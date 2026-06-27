import "dotenv/config";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { requireLocalSecret } from "./local-secret.mjs";
import {
  clickOptionalButton,
  launchCreditCardBrowser,
  parseEuro,
  roundCurrency,
  timestampRunId,
  writeCreditCardSnapshot,
} from "./credit-card-portal-utils.mjs";

const source = "amazon_visa";
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const headless = process.argv.includes("--headless") || process.env.AMAZON_VISA_HEADLESS === "1";
const keepBrowserOpen = process.argv.includes("--keep-open");
const loginUrl = "https://kunden.openbankpay.com/amazon/login";
const dashboardUrl = "https://kunden.openbankpay.com/amazon/dashboard";

function parseAmazonVisaDashboardText(text, now = new Date()) {
  const normalized = String(text ?? "").replace(/\u00a0/g, " ");
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const compact = lines.join(" ");

  function amountNear(labelPattern, { before = 0, after = 5 } = {}) {
    const labelIndex = lines.findIndex((line) => labelPattern.test(line));
    if (labelIndex < 0) return null;
    const start = Math.max(0, labelIndex - before);
    const end = Math.min(lines.length - 1, labelIndex + after);
    for (let index = start; index <= end; index += 1) {
      const match = lines[index].match(/-?[\d.\s]+,\d{2}\s*€/);
      const parsed = parseEuro(match?.[0]);
      if (typeof parsed === "number") return parsed;
    }
    return null;
  }

  const available =
    amountNear(/Verfügbar|Verfuegbar/i) ??
    parseEuro(compact.match(/Verfügbar\s+([\d.\s]+,\d{2})\s*€/i)?.[1]) ??
    parseEuro(compact.match(/Verfuegbar\s+([\d.\s]+,\d{2})\s*€/i)?.[1]);
  const used =
    amountNear(/Verbraucht/i) ??
    parseEuro(compact.match(/Verbraucht\s+([\d.\s]+,\d{2})\s*€/i)?.[1]);
  const limit =
    amountNear(/Kreditkartenlimit|Kreditlimit|Kreditrahmen/i, { after: 2 }) ??
    parseEuro(compact.match(/(?:Kreditkartenlimit|Kreditlimit|Kreditrahmen)\s+([\d.\s]+,\d{2})\s*€/i)?.[1]);
  const derivedUsed =
    typeof used === "number"
      ? used
      : typeof limit === "number" && typeof available === "number"
        ? roundCurrency(limit - available)
        : null;

  if (typeof derivedUsed !== "number") {
    throw new Error("Amazon Visa Saldo konnte im Portaltext nicht erkannt werden.");
  }

  return {
    source,
    displayName: "Amazon Visa",
    currency: "EUR",
    currentValue: roundCurrency(-Math.abs(derivedUsed)),
    debtValue: roundCurrency(Math.abs(derivedUsed)),
    availableWithCredit: typeof available === "number" ? roundCurrency(available) : null,
    creditLineEstimate: typeof limit === "number" ? roundCurrency(limit) : null,
    valuationDate: now.toISOString().slice(0, 10),
    sourceDataProvider: "amazon_visa_portal",
    sourceDataUpdatedAt: now,
    valuationMethod: "amazon_visa_portal_balance_v1",
    status: "VERIFIED",
    importId: timestampRunId("portal_amazon_visa", now),
  };
}

async function isAmazonVisaLoggedIn(page) {
  const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
  return page.url().includes("/dashboard") && /Übersicht|Umsätze|Meine Karte|Abmelden|Kreditsaldo|Verbraucht|Kreditkartenlimit/i.test(text);
}

async function ensureAmazonVisaLogin(page) {
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  if (await isAmazonVisaLoggedIn(page)) return { mode: "existing-session" };

  await clickOptionalButton(page, /Ablehnen/i).catch(() => false);
  const [email, pin] = await Promise.all([
    requireLocalSecret("AMAZON_VISA_EMAIL", "finanztool-amazon-visa-email"),
    requireLocalSecret("AMAZON_VISA_PIN", "finanztool-amazon-visa-pin"),
  ]);

  const emailField = page.locator('input[type="email"], input').first();
  await emailField.fill(email, { timeout: 10000 });
  await page.getByRole("button", { name: /Weiter/i }).click({ timeout: 10000 });
  await page.waitForTimeout(1500);

  const codeFields = page.locator("input");
  if ((await codeFields.count()) < 4) throw new Error("Amazon Visa Zugangscode-Felder wurden nicht gefunden.");
  for (let index = 0; index < 4; index += 1) {
    await codeFields.nth(index).fill(pin[index] ?? "", { timeout: 10000 });
  }
  await page.getByRole("button", { name: /Login/i }).click({ timeout: 10000 });
  await page.waitForTimeout(5000);
  if (!(await isAmazonVisaLoggedIn(page))) {
    throw new Error("Amazon Visa Login fehlgeschlagen oder Dashboard nicht erkannt.");
  }
  return { mode: "keychain" };
}

async function readAmazonVisaSnapshot() {
  const now = new Date();
  const { context, page } = await launchCreditCardBrowser("amazon-visa", { headless });
  try {
    const login = await ensureAmazonVisaLogin(page);
    await page.goto(dashboardUrl, { waitUntil: "domcontentloaded" });
    let text = "";
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await page.waitForTimeout(1000);
      text = await page.locator("body").innerText({ timeout: 10000 });
      if (/Verbraucht[\s\S]*\d[\d.\s]*,\d{2}\s*€|Kreditkartenlimit[\s\S]*\d[\d.\s]*,\d{2}\s*€/i.test(text)) break;
      if (attempt === 4 || attempt === 12) {
        await page.getByRole("button", { name: /^Übersicht$/i }).first().click({ timeout: 3000 }).catch(() => {});
      }
      if (attempt === 18) {
        await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      }
    }
    return { snapshot: parseAmazonVisaDashboardText(text, now), login };
  } finally {
    if (!keepBrowserOpen) await context.close().catch(() => {});
  }
}

try {
  const { snapshot, login } = await readAmazonVisaSnapshot();
  const firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  const result = await writeCreditCardSnapshot(firestore, snapshot, { writeEnabled, now: new Date() });
  console.log(
    JSON.stringify(
      {
        status: "OK",
        source,
        mode: writeEnabled ? "write" : "dry-run",
        login: login.mode,
        currentValue: snapshot.currentValue,
        debtValue: snapshot.debtValue,
        availableWithCredit: snapshot.availableWithCredit,
        creditLineEstimate: snapshot.creditLineEstimate,
        ...result,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const now = new Date();
  const firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  if (writeEnabled) {
    await firestore.setDocument("agentStatus", source, {
      source,
      status: "FEHLER",
      message: error instanceof Error ? error.message : String(error),
      lastAgentRunAt: now,
      updatedAt: now,
    });
  }
  throw error;
}
