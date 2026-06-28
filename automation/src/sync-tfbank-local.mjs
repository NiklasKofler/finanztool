import "dotenv/config";
import { createHash } from "node:crypto";
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
const messagesUiFallbackEnabled =
  process.argv.includes("--messages-ui-fallback") || process.env.TFBANK_MESSAGES_UI_FALLBACK === "1";
const reuseBrowserProfile = process.argv.includes("--reuse-browser-profile") || process.env.TFBANK_REUSE_BROWSER_PROFILE === "1";
const maxTanLoginAttempts = Math.max(
  1,
  Number.parseInt(readArg("--tan-login-attempts") ?? process.env.TFBANK_TAN_LOGIN_ATTEMPTS ?? "5", 10) || 5,
);
const loginUrl = "https://meine.tfbank.at/login";
const homeUrl = "https://meine.tfbank.at/";
const defaultTanFilePath = path.join(os.homedir(), ".finanztool", "tfbank-tan.txt");
const messagesTanHelperPath = path.join(__dirname, "read-messages-tan.swift");
const messagesDbPath = path.join(os.homedir(), "Library", "Messages", "chat.db");
const runtimeDir = path.join(__dirname, "..", "runtime");
const debugLogPath = path.join(runtimeDir, "tfbank-debug.ndjson");
const submittedTanRegistryPath = path.join(runtimeDir, "tfbank-submitted-tans.json");
const debugEnabled = process.env.TFBANK_DEBUG !== "0";
const messagesTanPickMode = process.env.TFBANK_MESSAGES_TAN_PICK ?? "last";
const tanSettleMs = Math.max(
  0,
  Number.parseInt(readArg("--tan-settle-ms") ?? process.env.TFBANK_TAN_SETTLE_MS ?? "0", 10) || 0,
);
let messagesDbDisabledForRun = false;

function maskTan(value) {
  const tan = normalizeTan(value);
  if (!tan) return null;
  return `${"*".repeat(Math.max(0, tan.length - 2))}${tan.slice(-2)}`;
}

function maskDebugText(value) {
  return String(value ?? "").replace(/\b\d{4,12}\b/g, (match) => maskTan(match) ?? "****");
}

async function debugTfBank(event, data = {}) {
  if (!debugEnabled) return;
  try {
    await fs.mkdir(runtimeDir, { recursive: true });
    const safeData = JSON.parse(JSON.stringify(data, (_key, value) => {
      if (typeof value === "string") return maskDebugText(value);
      return value;
    }));
    await fs.appendFile(
      debugLogPath,
      `${JSON.stringify({ at: new Date().toISOString(), source, event, ...safeData })}\n`,
    );
  } catch {
    // Debugging must never break the import itself.
  }
}

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

function tanHash(value) {
  const tan = normalizeTan(value);
  if (!tan) return null;
  return createHash("sha256").update(`tfbank:${tan}`).digest("hex");
}

async function readSubmittedTanRegistry() {
  try {
    const raw = await fs.readFile(submittedTanRegistryPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.submittedTans) ? parsed.submittedTans : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    await debugTfBank("submitted_tan_registry_error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function isSubmittedTan(tan) {
  const hash = tanHash(tan);
  if (!hash) return false;
  const submittedTans = await readSubmittedTanRegistry();
  return submittedTans.some((entry) => entry.hash === hash);
}

async function rememberSubmittedTan(tan, { channel } = {}) {
  const normalizedTan = normalizeTan(tan);
  const hash = tanHash(normalizedTan);
  if (!hash) return;
  await fs.mkdir(runtimeDir, { recursive: true });
  const submittedTans = await readSubmittedTanRegistry();
  const next = [
    {
      hash,
      suffix: normalizedTan.slice(-2),
      channel: channel ?? null,
      submittedAt: new Date().toISOString(),
    },
    ...submittedTans.filter((entry) => entry.hash !== hash),
  ].slice(0, 40);
  await fs.writeFile(submittedTanRegistryPath, JSON.stringify({ submittedTans: next }, null, 2));
  await debugTfBank("submitted_tan_remembered", { tan: maskTan(normalizedTan), channel });
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
  if (error.code === "WAITING_TAN") return false;
  if (error.code === "TAN_NOT_RECEIVED") return true;
  if (error.retryableTan || error.code === "TAN_LOGIN_RETRYABLE") return true;
  return isTanRelatedText(error.message) || isTanRelatedText(error.stateText);
}

async function readTanFromFile(tanFilePath) {
  try {
    const tan = normalizeTan(await fs.readFile(tanFilePath, "utf8"));
    if (!tan) return null;
    if (await isSubmittedTan(tan)) {
      await fs.unlink(tanFilePath).catch(() => {});
      await debugTfBank("tan_file_already_submitted", { tan: maskTan(tan), tanFilePath });
      return null;
    }
    await fs.unlink(tanFilePath).catch(() => {});
    await debugTfBank("tan_file_detected", { tan: maskTan(tan), tanFilePath });
    return tan;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    await debugTfBank("tan_file_error", { tanFilePath, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function readTanFromMessages() {
  if (!messagesTanEnabled || process.platform !== "darwin") {
    await debugTfBank("messages_tan_skipped", { messagesTanEnabled, platform: process.platform });
    return null;
  }

  const dbTan = await readTanFromMessagesDatabase();
  if (dbTan) return dbTan;
  if (!messagesUiFallbackEnabled) {
    await debugTfBank("messages_ui_fallback_skipped", {
      reason: "disabled",
      hint: "TFBANK_MESSAGES_UI_FALLBACK=1 oder --messages-ui-fallback aktivieren",
    });
    return null;
  }

  try {
    await execFileAsync("open", ["-g", "-a", "Messages"], { timeout: 5_000 }).catch(() => {});
    const { stdout, stderr } = await execFileAsync("swift", [messagesTanHelperPath], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        TFBANK_MESSAGES_TAN_DEBUG: process.env.TFBANK_MESSAGES_TAN_DEBUG ?? "1",
        TFBANK_MESSAGES_TAN_PICK: messagesTanPickMode,
      },
    });
    const tan = normalizeTan(stdout);
    await debugTfBank("messages_tan_read", {
      detected: Boolean(tan),
      tan: maskTan(tan),
      pickMode: messagesTanPickMode,
      helperStderr: stderr.trim(),
    });
    return tan;
  } catch (error) {
    await debugTfBank("messages_tan_error", { message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function readTanFromMessagesDatabase() {
  if (process.platform !== "darwin" || process.env.TFBANK_MESSAGES_DB === "0" || messagesDbDisabledForRun) return null;
  const query = `
    SELECT text, date
    FROM message
    WHERE text LIKE '%TF Bank Bestätigungscode ist%'
       OR text LIKE '%TF Bank Bestaetigungscode ist%'
    ORDER BY date DESC
    LIMIT 12;
  `;
  try {
    const { stdout, stderr } = await execFileAsync("sqlite3", ["-readonly", "-json", messagesDbPath, query], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    if (stderr.trim()) {
      await debugTfBank("messages_db_stderr", { message: stderr.trim() });
    }
    const rows = JSON.parse(stdout || "[]");
    const candidates = rows
      .map((row) =>
        normalizeTan(String(row?.text ?? "").match(/TF Bank (?:Bestätigungscode|Bestaetigungscode) ist\s+(\d{4,12})/i)?.[1]),
      )
      .filter(Boolean);
    const tan = candidates[0] ?? null;
    await debugTfBank("messages_db_read", {
      detected: Boolean(tan),
      tan: maskTan(tan),
      rowCount: rows.length,
      candidates: candidates.slice(0, 8).map(maskTan),
    });
    return tan;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/authorization denied|operation not permitted|permission denied/i.test(message)) {
      messagesDbDisabledForRun = true;
    }
    await debugTfBank("messages_db_error", {
      message,
      hint: "macOS Full Disk Access fuer die ausfuehrende App/Terminal noetig",
    });
    return null;
  }
}

async function waitForTan({ previousMessagesTan } = {}) {
  const tanFilePath = readArg("--tan-file") ?? process.env.TFBANK_TAN_FILE ?? defaultTanFilePath;
  const waitSeconds = Number.parseInt(readArg("--tan-wait-seconds") ?? process.env.TFBANK_TAN_WAIT_SECONDS ?? "60", 10);
  const pollMs = Math.max(
    500,
    Number.parseInt(readArg("--tan-poll-ms") ?? process.env.TFBANK_TAN_POLL_MS ?? "1000", 10) || 1000,
  );
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
        messagesDb: process.env.TFBANK_MESSAGES_DB !== "0",
        messagesUiFallback: messagesUiFallbackEnabled,
        pollMs,
      },
      null,
      2,
    ),
  );

  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    const messagesTan = await readTanFromMessages();
    if (messagesTan && await isSubmittedTan(messagesTan)) {
      await debugTfBank("tan_messages_already_submitted", {
        tan: maskTan(messagesTan),
      });
    } else if (messagesTan && messagesTan !== previousMessagesTan) {
      await debugTfBank("tan_messages_detected_new", {
        tan: maskTan(messagesTan),
        previousTan: maskTan(previousMessagesTan),
      });
      return messagesTan;
    }
    if (messagesTan && messagesTan === previousMessagesTan) {
      await debugTfBank("tan_messages_same_as_previous", {
        tan: maskTan(messagesTan),
        previousTan: maskTan(previousMessagesTan),
      });
    }
    const tan = await readTanFromFile(tanFilePath);
    if (tan) return tan;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  await debugTfBank("tan_not_received", {
    waitSeconds,
    pollMs,
    previousTan: maskTan(previousMessagesTan),
    tanFilePath,
    messagesTanEnabled,
    messagesUiFallbackEnabled,
    pickMode: messagesTanPickMode,
  });
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
  await debugTfBank("login_before_submit", { previousMessagesTan: maskTan(previousMessagesTan) });
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
        `TF Bank konnte keine neue SMS-TAN erkennen. Bitte Messages/Weiterleitung pruefen oder Code waehrend des aktiven Laufs per --tan, --tan-stdin oder ${defaultTanFilePath} bereitstellen.`,
      );
      error.code = "TAN_NOT_RECEIVED";
      throw error;
    }
    if (tanSettleMs > 0) {
      await debugTfBank("tan_settle_wait", { tan: maskTan(tan), settleMs: tanSettleMs });
      await page.waitForTimeout(tanSettleMs);
    }
    await debugTfBank("login_tan_submit", { tan: maskTan(tan), inputVisible: true });
    await clearAndType(otpInput, tan);
    const submitButton = page.getByRole("button", { name: /Einloggen|Weiter|Bestätigen|Bestaetigen/i }).first();
    await rememberSubmittedTan(tan, { channel: "tfbank_portal_submit" });
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
    const browserProfileName = reuseBrowserProfile
      ? "tfbank"
      : `tfbank-run-${process.pid}-${Date.now()}-${attempt}`;
    await debugTfBank("login_attempt_start", {
      attempt,
      maxAttempts: maxTanLoginAttempts,
      headless,
      browserProfileName,
      reuseBrowserProfile,
    });
    const { context, page, profilePath } = await launchCreditCardBrowser(browserProfileName, { headless });
    try {
      const login = await ensureTfBankLogin(page);
      await page.goto(homeUrl, { waitUntil: "domcontentloaded" });
      const text = await waitForNonEmptyPageText(page, { timeoutMs: 30000, reloadAfterMs: 8000 });
      try {
        const snapshot = parseTfBankDashboardText(text, now);
        const logout = await logoutTfBank(page);
        await debugTfBank("snapshot_success", {
          attempt,
          loginMode: login.mode,
          currentValue: snapshot.currentValue,
          availableWithCredit: snapshot.availableWithCredit,
          logout,
        });
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
      await debugTfBank("login_attempt_error", {
        attempt,
        maxAttempts: maxTanLoginAttempts,
        retryableTan,
        code: error?.code ?? null,
        message: error instanceof Error ? error.message : String(error),
      });
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
      await debugTfBank("tan_retry_next_attempt", { attempt, maxAttempts: maxTanLoginAttempts });
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } finally {
      if (!keepBrowserOpen) {
        await context.close().catch(() => {});
        if (!reuseBrowserProfile) {
          await fs.rm(profilePath, { recursive: true, force: true }).catch(() => {});
        }
      }
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
  await debugTfBank("run_start", {
    writeEnabled,
    headless,
    keepBrowserOpen,
    logoutAfter,
    messagesTanEnabled,
    reuseBrowserProfile,
    maxTanLoginAttempts,
    tanWaitSeconds: readArg("--tan-wait-seconds") ?? process.env.TFBANK_TAN_WAIT_SECONDS ?? "60",
    tanPollMs: readArg("--tan-poll-ms") ?? process.env.TFBANK_TAN_POLL_MS ?? "1000",
    tanSettleMs,
    messagesTanPickMode,
    messagesUiFallbackEnabled,
  });
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
  await debugTfBank("run_success", {
    login: login.mode,
    loginAttempts: login.attempts,
    currentValue: snapshot.currentValue,
    availableWithCredit: snapshot.availableWithCredit,
    importId: result.importId,
  });
} catch (error) {
  const now = new Date();
  const firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  const waitingTan = error?.code === "WAITING_TAN";
  const tanNotReceived = error?.code === "TAN_NOT_RECEIVED";
  const tanLoginFailed = error?.code === "TAN_LOGIN_FAILED";
  await debugTfBank("run_error", {
    code: error?.code ?? null,
    message: error instanceof Error ? error.message : String(error),
    waitingTan,
    tanNotReceived,
    tanLoginFailed,
  });
  if (writeEnabled || waitingTan || tanNotReceived) {
    const previousSuccess = await loadPreviousAgentSuccess(firestore);
    await firestore.setDocument("agentStatus", source, {
      source,
      status: waitingTan ? "RUNNING" : "FEHLER",
      message: waitingTan
        ? `${error instanceof Error ? error.message : String(error)} Letzter erfolgreicher Stand bleibt sichtbar.`
        : tanLoginFailed || tanNotReceived
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
