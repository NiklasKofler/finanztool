import "dotenv/config";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { requireLocalSecret } from "./local-secret.mjs";
import {
  launchCreditCardBrowser,
  parseEuro,
  roundCurrency,
  timestampRunId,
  writeCreditCardSnapshot,
} from "./credit-card-portal-utils.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = "tfbank";
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const headless = process.argv.includes("--headless") || process.env.TFBANK_HEADLESS === "1";
const keepBrowserOpen = process.argv.includes("--keep-open");
const logoutAfter = !process.argv.includes("--no-logout") && process.env.TFBANK_LOGOUT_AFTER !== "0";
const tanFromStdin = process.argv.includes("--tan-stdin");
const messagesTanEnabled = !process.argv.includes("--no-messages-tan") && process.env.TFBANK_MESSAGES_TAN !== "0";
const maxTanLoginAttempts = Math.max(
  1,
  Number.parseInt(readArg("--tan-login-attempts") ?? process.env.TFBANK_TAN_LOGIN_ATTEMPTS ?? "5", 10) || 5,
);
const loginUrl = "https://meine.tfbank.at/login";
const homeUrl = "https://meine.tfbank.at/";
const defaultTanFilePath = path.join(os.homedir(), ".finanztool", "tfbank-tan.txt");
const messagesTanHelperPath = path.join(__dirname, "read-messages-tan.swift");

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readTanFromStdin() {
  console.log(JSON.stringify({ status: "WAITING_TAN_STDIN", source, message: "TF Bank wartet auf SMS-TAN per stdin." }, null, 2));
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  return await new Promise((resolve) => {
    process.stdin.once("data", (data) => {
      process.stdin.pause();
      resolve(String(data).replace(/\D/g, "").slice(0, 12));
    });
  });
}

function normalizeTan(value) {
  const tan = String(value ?? "").replace(/\D/g, "").slice(0, 12);
  return tan.length >= 4 ? tan : null;
}

function isTanRelatedText(text) {
  return /tan|sms|einmalpasswort|otp|code|ungueltig|ungültig|falsch|abgelaufen|fehlgeschlagen|verbraucht/i.test(
    String(text ?? ""),
  );
}

function createTanLoginRetryError(message, { cause, stateText } = {}) {
  const error = new Error(message);
  error.code = "TAN_LOGIN_RETRYABLE";
  error.retryableTan = true;
  error.stateText = stateText ?? "";
  if (cause) error.cause = cause;
  return error;
}

function isTanRetryableError(error) {
  if (!error) return false;
  if (error.retryableTan || error.code === "WAITING_TAN" || error.code === "TAN_LOGIN_RETRYABLE") return true;
  return isTanRelatedText(error.message) || isTanRelatedText(error.stateText);
}

async function readTanFromFile(tanFilePath) {
  try {
    const tan = normalizeTan(await fs.readFile(tanFilePath, "utf8"));
    if (!tan) return null;
    await fs.unlink(tanFilePath).catch(() => {});
    return tan;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

async function readTanFromMessages() {
  if (!messagesTanEnabled || process.platform !== "darwin") return null;
  try {
    await execFileAsync("open", ["-g", "-a", "Messages"], { timeout: 5_000 }).catch(() => {});
    const { stdout } = await execFileAsync("swift", [messagesTanHelperPath], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });
    return normalizeTan(stdout);
  } catch {
    return null;
  }
}

async function waitForTan({ previousMessagesTan } = {}) {
  const tanFilePath = readArg("--tan-file") ?? process.env.TFBANK_TAN_FILE ?? defaultTanFilePath;
  const waitSeconds = Number.parseInt(readArg("--tan-wait-seconds") ?? process.env.TFBANK_TAN_WAIT_SECONDS ?? "300", 10);
  if (!Number.isFinite(waitSeconds) || waitSeconds <= 0) return null;

  await fs.mkdir(path.dirname(tanFilePath), { recursive: true });
  console.log(
    JSON.stringify(
      {
        status: "WAITING_TAN",
        source,
        message: `TF Bank wartet bis zu ${waitSeconds}s auf neue SMS-TAN aus Messages oder TAN-Datei.`,
        tanFilePath,
        messagesTan: messagesTanEnabled,
      },
      null,
      2,
    ),
  );

  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    const messagesTan = await readTanFromMessages();
    if (messagesTan && messagesTan !== previousMessagesTan) {
      return messagesTan;
    }
    const tan = await readTanFromFile(tanFilePath);
    if (tan) return tan;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

async function resolveTan({ previousMessagesTan } = {}) {
  return (
    normalizeTan(readArg("--tan")) ??
    normalizeTan(process.env.TFBANK_TAN) ??
    (tanFromStdin ? normalizeTan(await readTanFromStdin()) : null) ??
    (await waitForTan({ previousMessagesTan }))
  );
}

function parseTfBankDashboardText(text, now = new Date()) {
  const normalized = String(text ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const summaryMatch = normalized.match(
    /Verf[uü]gungsrahmen\s+Reservierter Betrag\s+Saldo\s+€\s*([\d.\s]+,\d{2})\s+€\s*([\d.\s]+,\d{2})\s+(-?\s*€?\s*[\d.\s]+,\d{2}|-?\s*[\d.\s]+,\d{2}\s*€)/i,
  );
  const tfBankLimit = parseEuro(summaryMatch?.[1]);
  const tfBankReserved = parseEuro(summaryMatch?.[2]);
  const tfBankSaldo = parseEuro(summaryMatch?.[3]);
  const debt =
    (typeof tfBankSaldo === "number" ? tfBankSaldo : null) ??
    parseEuro(normalized.match(/(?:offener|aktueller|karten)?\s*saldo\s*:?\s*(-?[\d.\s]+,\d{2})\s*€/i)?.[1]) ??
    parseEuro(normalized.match(/(?:zu zahlen|rechnung(?:sbetrag)?|verbrauch(?:t)?)\s*:?\s*(-?[\d.\s]+,\d{2})\s*€/i)?.[1]);
  const available =
    parseEuro(normalized.match(/Zur Verf[uü]gung stehender Betrag\s*€\s*([\d.\s]+,\d{2})/i)?.[1]) ??
    parseEuro(normalized.match(/verf[uü]gbar(?:er betrag)?\s*:?\s*€?\s*([\d.\s]+,\d{2})/i)?.[1]);
  const limit =
    (typeof tfBankLimit === "number" ? tfBankLimit : null) ??
    parseEuro(normalized.match(/(?:Verf[uü]gungsrahmen|kreditrahmen|kreditlimit|limit)\s*:?\s*€?\s*([\d.\s]+,\d{2})/i)?.[1]);

  if (typeof debt !== "number") {
    throw new Error("TF Bank Saldo konnte im Portaltext nicht erkannt werden.");
  }

  return {
    source,
    displayName: "TF Bank Kreditkarte",
    currency: "EUR",
    currentValue: roundCurrency(-Math.abs(debt)),
    debtValue: roundCurrency(Math.abs(debt)),
    availableWithCredit: typeof available === "number" ? roundCurrency(available) : null,
    creditLineEstimate: typeof limit === "number" ? roundCurrency(limit) : null,
    reservedValue: typeof tfBankReserved === "number" ? roundCurrency(tfBankReserved) : null,
    valuationDate: now.toISOString().slice(0, 10),
    sourceDataProvider: "tfbank_portal",
    sourceDataUpdatedAt: now,
    valuationMethod: "tfbank_portal_balance_v1",
    status: "VERIFIED",
    importId: timestampRunId("portal_tfbank", now),
  };
}

async function clearAndType(locator, value) {
  await locator.click({ timeout: 10000 });
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await locator.type(value, { delay: 40, timeout: 10000 });
  await locator.evaluate((input, nextValue) => {
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function isTfBankLoggedIn(page) {
  const text = await readPageText(page, { timeout: 10000 });
  return /saldo|kreditrahmen|kreditlimit|ums[aä]tz|rechnung|verf[uü]gbar/i.test(text) && !/Geburtsdatum|Einmalpasswort aus SMS/i.test(text);
}

async function readPageText(page, { timeout = 10000 } = {}) {
  return await page.locator("body").innerText({ timeout }).catch(() => "");
}

async function waitForNonEmptyPageText(
  page,
  { timeoutMs = 30000, pollMs = 1000, reloadAfterMs = 0 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let reloaded = false;
  while (Date.now() < deadline) {
    const text = await readPageText(page, { timeout: Math.min(pollMs, 5000) });
    if (text.replace(/\s+/g, "").length > 0) return text;
    const shouldReload = reloadAfterMs > 0 && !reloaded && Date.now() > deadline - timeoutMs + reloadAfterMs;
    if (shouldReload) {
      reloaded = true;
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    }
    await page.waitForTimeout(pollMs);
  }
  return await readPageText(page, { timeout: 5000 });
}

async function waitForTfBankDashboard(page, { timeoutMs = 60000, pollMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    lastText = await readPageText(page, { timeout: 5000 });
    if (await isTfBankLoggedIn(page)) return { ok: true, text: lastText };
    if (/falsche|ungueltig|ungültig|abgelaufen|fehlgeschlagen|gesperrt/i.test(lastText)) {
      return { ok: false, text: lastText };
    }
    await page.waitForTimeout(pollMs);
  }
  return { ok: false, text: lastText || (await readPageText(page, { timeout: 5000 })) };
}

async function clickVisibleByRole(page, role, pattern, timeout = 1200) {
  const locator = page.getByRole(role, { name: pattern }).first();
  if (!(await locator.isVisible({ timeout }).catch(() => false))) return false;
  await locator.click({ timeout: 5000 });
  return true;
}

async function clickVisibleText(page, pattern, timeout = 1200) {
  const locator = page.locator(`text=${pattern}`).first();
  if (!(await locator.isVisible({ timeout }).catch(() => false))) return false;
  await locator.click({ timeout: 5000 });
  return true;
}

async function clickLogoutControl(page) {
  const logoutPattern = /abmelden|ausloggen|logout|log out|sign out/i;
  for (const role of ["button", "link", "menuitem"]) {
    if (await clickVisibleByRole(page, role, logoutPattern)) return true;
  }
  if (await clickVisibleText(page, logoutPattern)) return true;

  const menuPatterns = [
    /men[uü]|konto|profil|account|benutzer|user|einstellungen|mehr/i,
    /^[A-ZÄÖÜ]{1,2}$/,
  ];
  for (const pattern of menuPatterns) {
    for (const role of ["button", "link"]) {
      if (await clickVisibleByRole(page, role, pattern, 800)) {
        await page.waitForTimeout(700);
        for (const logoutRole of ["button", "link", "menuitem"]) {
          if (await clickVisibleByRole(page, logoutRole, logoutPattern, 1000)) return true;
        }
        if (await clickVisibleText(page, logoutPattern, 1000)) return true;
      }
    }
  }

  return await page.evaluate(() => {
    const pattern = /abmelden|ausloggen|logout|log out|sign out/i;
    const candidates = [...document.querySelectorAll("button, a, [role='button'], [role='menuitem']")];
    const item = candidates.find((element) => {
      const text = element.textContent?.trim() ?? element.getAttribute("aria-label") ?? "";
      const box = element.getBoundingClientRect();
      return pattern.test(text) && box.width > 0 && box.height > 0;
    });
    if (!item) return false;
    item.click();
    return true;
  });
}

async function logoutTfBank(page) {
  if (!logoutAfter || keepBrowserOpen) {
    return { attempted: false, ok: null, message: keepBrowserOpen ? "Browser bleibt fuer Debug offen." : "Logout deaktiviert." };
  }

  try {
    const clicked = await clickLogoutControl(page);
    if (!clicked) {
      return { attempted: true, ok: false, message: "Kein Logout-/Abmelden-Element gefunden." };
    }
    await page.waitForTimeout(2500);
    const text = await page.locator("body").innerText({ timeout: 8000 }).catch(() => "");
    const url = page.url();
    const loggedOut =
      /geburtsdatum|kundennummer|einloggen|login|anmelden/i.test(text) ||
      /login|logout|logged-out|signout|sign-out/i.test(url);
    return {
      attempted: true,
      ok: loggedOut,
      message: loggedOut ? "Logout bestaetigt." : "Logout geklickt, aber Login-Seite nicht sicher erkannt.",
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      message: `Logout fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function ensureTfBankLogin(page) {
  await page.goto(homeUrl, { waitUntil: "domcontentloaded" });
  await waitForNonEmptyPageText(page, { timeoutMs: 25000, reloadAfterMs: 8000 });
  if (await isTfBankLoggedIn(page)) return { mode: "existing-session" };

  const [customerNumber, birthdate] = await Promise.all([
    requireLocalSecret("TFBANK_CUSTOMER_NUMBER", "finanztool-tfbank-customer-number"),
    requireLocalSecret("TFBANK_BIRTHDATE", "finanztool-tfbank-birthdate"),
  ]);
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  await waitForNonEmptyPageText(page, { timeoutMs: 25000, reloadAfterMs: 8000 });
  await clearAndType(page.locator('input[name="customerId"], #customerId').first(), customerNumber);
  const inputs = page.locator("input");
  if ((await inputs.count()) < 2) throw new Error("TF Bank Geburtsdatum-Feld wurde nicht gefunden.");
  await clearAndType(inputs.nth(1), birthdate);
  const previousMessagesTan = await readTanFromMessages();
  await page.getByRole("button", { name: /Einloggen/i }).click({ timeout: 10000 });
  await page.waitForTimeout(3000);
  await waitForNonEmptyPageText(page, { timeoutMs: 30000 });

  const text = await readPageText(page, { timeout: 10000 });
  const otpInput = page.locator('input[name="otp"], #otp, input[placeholder*="SMS" i], input[placeholder*="Einmal" i]').first();
  const waitingForTan = /Einmalpasswort aus SMS|SMS|otp/i.test(text) || (await otpInput.isVisible({ timeout: 1000 }).catch(() => false));
  if (waitingForTan) {
    const tan = await resolveTan({ previousMessagesTan });
    if (!tan) {
      const error = new Error(
        `TF Bank wartet auf SMS-TAN. Code waehrend des aktiven Laufs per --tan, --tan-stdin oder ${defaultTanFilePath} bereitstellen.`,
      );
      error.code = "WAITING_TAN";
      throw error;
    }
    await clearAndType(otpInput, tan);
    const submitButton = page.getByRole("button", { name: /Einloggen|Weiter|Bestätigen|Bestaetigen/i }).first();
    await submitButton.click({ timeout: 8000 }).catch(async () => {
      const fallbackButton = page.locator("button").last();
      await fallbackButton.evaluate((button) => button.click());
    });
    const afterTanDashboard = await waitForTfBankDashboard(page, { timeoutMs: 60000 });
    if (!afterTanDashboard.ok) {
      const stateText = (afterTanDashboard.text || (await readPageText(page, { timeout: 10000 }))).replace(/\s+/g, " ");
      throw createTanLoginRetryError(
        `TF Bank TAN-Login wurde vom Portal nicht bestaetigt. Sichtbarer Zustand: ${stateText.slice(0, 500)}`,
        { stateText },
      );
    }
  }

  const dashboard = await waitForTfBankDashboard(page, { timeoutMs: 45000 });
  if (!dashboard.ok) {
    const stateText = dashboard.text || (await readPageText(page, { timeout: 10000 }));
    const trimmed = stateText.replace(/\s+/g, " ").slice(0, 500);
    if (isTanRelatedText(trimmed)) {
      throw createTanLoginRetryError(`TF Bank TAN-Login fehlgeschlagen. Sichtbarer Zustand: ${trimmed}`, { stateText });
    }
    throw new Error(`TF Bank Login fehlgeschlagen oder Dashboard nicht erkannt. Sichtbarer Zustand: ${trimmed}`);
  }
  return { mode: "keychain" };
}

async function readTfBankSnapshot() {
  const now = new Date();
  const attemptErrors = [];
  for (let attempt = 1; attempt <= maxTanLoginAttempts; attempt += 1) {
    const { context, page } = await launchCreditCardBrowser("tfbank", { headless });
    try {
      const login = await ensureTfBankLogin(page);
      await page.goto(homeUrl, { waitUntil: "domcontentloaded" });
      const text = await waitForNonEmptyPageText(page, { timeoutMs: 30000, reloadAfterMs: 8000 });
      try {
        const snapshot = parseTfBankDashboardText(text, now);
        const logout = await logoutTfBank(page);
        return {
          snapshot,
          login: { ...login, attempts: attempt, maxAttempts: maxTanLoginAttempts },
          logout,
        };
      } catch (error) {
        const visibleState = text.replace(/\s+/g, " ").slice(0, 1500);
        throw new Error(`${error instanceof Error ? error.message : String(error)} Sichtbarer Zustand: ${visibleState}`);
      }
    } catch (error) {
      const retryableTan = isTanRetryableError(error);
      attemptErrors.push(error instanceof Error ? error.message : String(error));
      if (!retryableTan || attempt >= maxTanLoginAttempts) {
        if (retryableTan) {
          const finalError = new Error(
            `TF Bank TAN-Login nach ${attempt}/${maxTanLoginAttempts} Versuchen fehlgeschlagen. Letzter Grund: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          finalError.code = "TAN_LOGIN_FAILED";
          finalError.attempts = attempt;
          finalError.attemptErrors = attemptErrors;
          throw finalError;
        }
        throw error;
      }
      console.warn(
        JSON.stringify(
          {
            status: "TFBANK_TAN_RETRY",
            source,
            attempt,
            maxAttempts: maxTanLoginAttempts,
            message: `${error instanceof Error ? error.message : String(error)} Neuer Login-Versuch wird gestartet.`,
          },
          null,
          2,
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } finally {
      if (!keepBrowserOpen) await context.close().catch(() => {});
    }
  }
  throw new Error("TF Bank Login wurde ohne Ergebnis beendet.");
}

async function loadPreviousAgentSuccess(firestore) {
  try {
    const [statuses, summaries] = await Promise.all([
      firestore.listDocuments("agentStatus"),
      firestore.listDocuments("sourceSummaries"),
    ]);
    const previousStatus = statuses.find((document) => document.id === source);
    const previousSummary = summaries.find((document) => document.id === source);
    const lastAgentSuccessAt =
      previousStatus?.lastAgentSuccessAt ??
      previousStatus?.lastSuccessAt ??
      previousSummary?.lastAgentSuccessAt ??
      previousSummary?.lastSuccessAt ??
      null;
    const lastSuccessAt =
      previousStatus?.lastSuccessAt ??
      previousStatus?.lastAgentSuccessAt ??
      previousSummary?.lastSuccessAt ??
      previousSummary?.lastAgentSuccessAt ??
      null;

    return {
      lastAgentSuccessAt,
      lastSuccessAt,
    };
  } catch {
    return {
      lastAgentSuccessAt: null,
      lastSuccessAt: null,
    };
  }
}

try {
  const firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  const previousSuccess = await loadPreviousAgentSuccess(firestore);
  if (writeEnabled) {
    await firestore.setDocument("agentStatus", source, {
      source,
      status: "RUNNING",
      message: "TF Bank Login gestartet; wartet bei Bedarf auf SMS-TAN.",
      ...previousSuccess,
      lastAgentRunAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const { snapshot, login, logout } = await readTfBankSnapshot();
  const result = await writeCreditCardSnapshot(firestore, snapshot, { writeEnabled, now: new Date() });
  if (writeEnabled && logoutAfter && logout?.ok === false) {
    const now = new Date();
    await firestore.setDocument("agentStatus", source, {
      source,
      status: "WARNUNG",
      message: `${snapshot.displayName}: Saldo ${snapshot.currentValue.toFixed(2)} EUR, verfuegbar ${snapshot.availableWithCredit?.toFixed?.(2) ?? "n/a"} EUR. ${logout.message}`,
      lastAgentRunAt: now,
      lastAgentSuccessAt: now,
      lastSuccessAt: now,
      valuationDate: snapshot.valuationDate,
      currentValue: snapshot.currentValue,
      debtValue: snapshot.debtValue,
      importId: result.importId,
      updatedAt: now,
    });
  }
  console.log(
    JSON.stringify(
      {
        status: "OK",
        source,
        mode: writeEnabled ? "write" : "dry-run",
        login: login.mode,
        loginAttempts: login.attempts,
        currentValue: snapshot.currentValue,
        debtValue: snapshot.debtValue,
        availableWithCredit: snapshot.availableWithCredit,
        creditLineEstimate: snapshot.creditLineEstimate,
        logout,
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
  const waitingTan = error?.code === "WAITING_TAN";
  const tanLoginFailed = error?.code === "TAN_LOGIN_FAILED";
  if (writeEnabled || waitingTan) {
    const previousSuccess = await loadPreviousAgentSuccess(firestore);
    await firestore.setDocument("agentStatus", source, {
      source,
      status: waitingTan ? "WARNUNG" : "FEHLER",
      message: waitingTan
        ? `${error instanceof Error ? error.message : String(error)} Letzter erfolgreicher Stand bleibt sichtbar.`
        : tanLoginFailed
          ? `${error instanceof Error ? error.message : String(error)} Letzter erfolgreicher Stand bleibt sichtbar.`
          : error instanceof Error ? error.message : String(error),
      ...previousSuccess,
      lastAgentRunAt: now,
      updatedAt: now,
    });
  }
  if (waitingTan) {
    console.log(JSON.stringify({ status: "WAITING_TAN", source, message: error.message }, null, 2));
    process.exit(0);
  }
  throw error;
}
