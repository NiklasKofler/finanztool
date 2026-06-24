import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { requireLocalSecret } from "./local-secret.mjs";

export const TRADE_REPUBLIC_TRANSACTIONS_URL = "https://app.traderepublic.com/profile/transactions";

const TRADE_REPUBLIC_LOGIN_URL = "https://app.traderepublic.com/login";
const TR_PHONE_SERVICE = "finanztool-traderepublic-phone";
const TR_PIN_SERVICE = "finanztool-traderepublic-pin";
const TR_COUNTRY_NAME = process.env.TR_COUNTRY_NAME ?? "Austria";
const TR_COUNTRY_CODE = process.env.TR_COUNTRY_CODE ?? "+43";

function defaultChromePath() {
  return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}

export function getTradeRepublicPaths() {
  const home = os.homedir();
  return {
    chromePath: process.env.TR_CHROME_PATH ?? defaultChromePath(),
    profilePath:
      process.env.TR_BROWSER_PROFILE ??
      path.join(home, ".finanztool", "browser-profiles", "traderepublic"),
    downloadPath:
      process.env.TR_DOWNLOAD_PATH ??
      path.join(home, ".finanztool", "runtime", "traderepublic-downloads"),
  };
}

export async function launchTradeRepublicBrowser({ headless = false } = {}) {
  const paths = getTradeRepublicPaths();
  await Promise.all([
    fs.mkdir(paths.profilePath, { recursive: true }),
    fs.mkdir(paths.downloadPath, { recursive: true }),
  ]);

  const context = await chromium.launchPersistentContext(paths.profilePath, {
    executablePath: paths.chromePath,
    headless,
    acceptDownloads: true,
    downloadsPath: paths.downloadPath,
    viewport: { width: 1360, height: 920 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page, paths };
}

async function isVisible(locator, timeout = 1000) {
  return locator
    .first()
    .isVisible({ timeout })
    .catch(() => false);
}

async function clickFirst(page, candidates, timeout = 4000) {
  for (const candidate of candidates) {
    const locator = typeof candidate === "string" ? page.locator(candidate) : candidate;
    if (await isVisible(locator, timeout)) {
      await locator.first().click({ timeout, force: true });
      return true;
    }
  }
  return false;
}

async function fillFirst(page, candidates, value, timeout = 5000) {
  for (const selector of candidates) {
    const locator = page.locator(selector);
    if (await isVisible(locator, timeout)) {
      await locator.first().click({ timeout, force: true });
      await page.keyboard.press("Meta+A");
      await page.keyboard.press("Backspace");
      await page.keyboard.type(value, { delay: 35 });
      return true;
    }
  }
  return false;
}

function phoneWithoutCountryCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0043")) return digits.slice(4);
  if (digits.startsWith("43") && digits.length > 10) return digits.slice(2);
  return digits;
}

async function selectTradeRepublicCountry(page, { countryName = TR_COUNTRY_NAME, countryCode = TR_COUNTRY_CODE } = {}) {
  const exactCountryPattern = new RegExp(`^\\s*(${countryName}|Oesterreich|Österreich).*${countryCode.replace("+", "\\+")}|${countryCode.replace("+", "\\+")}.*(${countryName}|Oesterreich|Österreich)`, "i");
  const looseCountryPattern = /Austria|Oesterreich|Österreich|\+43/i;

  const selects = await page.locator("select").all();
  for (const select of selects) {
    if (!(await select.isVisible({ timeout: 500 }).catch(() => false))) continue;
    for (const value of [countryCode, countryCode.replace("+", ""), "AT", "AUT", countryName, "Austria"]) {
      const changed = await select.selectOption({ value }, { timeout: 1000 }).then(() => true).catch(() => false);
      if (changed) return true;
      const changedByLabel = await select.selectOption({ label: value }, { timeout: 1000 }).then(() => true).catch(() => false);
      if (changedByLabel) return true;
    }
  }

  const alreadySelected = await page.locator(`text=/${countryCode.replace("+", "\\+")}|Austria|Österreich|Oesterreich/i`)
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  if (alreadySelected) return true;

  const dropdownCandidates = [
    page.getByRole("combobox"),
    page.getByRole("button", { name: /\+\d+|country|land|Austria|Österreich|Oesterreich/i }),
    page.locator('[aria-label*="country" i], [aria-label*="land" i], [data-testid*="country" i]'),
    page.locator('button, [role="button"]').filter({ hasText: /\+\d+|country|land/i }),
  ];

  for (const candidate of dropdownCandidates) {
    const count = Math.min(await candidate.count().catch(() => 0), 6);
    for (let index = 0; index < count; index += 1) {
      const item = candidate.nth(index);
      if (!(await item.isVisible({ timeout: 700 }).catch(() => false))) continue;
      await item.click({ timeout: 1500, force: true }).catch(() => null);
      await page.waitForTimeout(500);
      const option = page
        .getByRole("option", { name: exactCountryPattern })
        .or(page.getByText(looseCountryPattern))
        .first();
      if (await option.isVisible({ timeout: 1200 }).catch(() => false)) {
        await option.click({ timeout: 2000, force: true });
        return true;
      }
      await page.keyboard.press("Escape").catch(() => {});
    }
  }

  return false;
}

async function waitForLoggedIn(page, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const url = page.url();
    const bodyText = await page.locator("body").innerText({ timeout: 2000 }).catch(() => "");
    const isAuthenticatedUrl =
      /app\.traderepublic\.com\/(portfolio|profile|cash|orders|browse|search|settings)/i.test(url) &&
      !/signin|login|challenge|identifier/i.test(url);
    if (
      isAuthenticatedUrl ||
      (/app\.traderepublic\.com/i.test(url) &&
        !/signin|login|challenge|identifier/i.test(url) &&
        /wealth|cash|portfolio|profile|transactions|activity|vermögen|konto/i.test(bodyText))
    ) {
      return true;
    }
    await page.waitForTimeout(2000);
  }
  return false;
}

async function saveLoginDiagnostic(page) {
  const dir = path.join(os.homedir(), ".finanztool", "runtime", "traderepublic-diagnostics");
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.join(dir, `${stamp}_login-timeout.png`);
  const textPath = path.join(dir, `${stamp}_login-timeout.txt`);
  const [title, bodyText] = await Promise.all([
    page.title().catch(() => ""),
    page.locator("body").innerText({ timeout: 3000 }).catch(() => ""),
  ]);
  await Promise.all([
    page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null),
    fs.writeFile(textPath, `URL: ${page.url()}\nTITLE: ${title}\n\n${bodyText.slice(0, 20000)}`),
  ]);
  return { screenshotPath, textPath, title, url: page.url() };
}

export async function ensureTradeRepublicLogin(page, { onStatus = async () => {}, timeoutMs } = {}) {
  const confirmTimeoutMs =
    timeoutMs ?? Number.parseInt(process.env.TR_LOGIN_CONFIRM_TIMEOUT_MS ?? "300000", 10);

  await onStatus("Trade Republic Login wird geprueft");
  await page.goto(TRADE_REPUBLIC_LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  if (await waitForLoggedIn(page, 5000)) {
    return { mode: "existing-session" };
  }

  const [phone, pin] = await Promise.all([
    requireLocalSecret("TR_PHONE", TR_PHONE_SERVICE),
    requireLocalSecret("TR_PIN", TR_PIN_SERVICE),
  ]);

  await onStatus("Land Austria +43 wird gesetzt");
  await selectTradeRepublicCountry(page);

  await onStatus("Telefonnummer wird eingegeben");
  const phoneNumber = phoneWithoutCountryCode(phone);
  const phoneFilled = await fillFirst(page, [
    'input[type="tel"]',
    'input[autocomplete="tel"]',
    'input[name*="phone" i]',
    'input[id*="phone" i]',
    'input[inputmode="tel"]',
    'input',
  ], phoneNumber);
  if (!phoneFilled) {
    throw new Error("Trade-Republic-Telefonfeld nicht gefunden.");
  }

  await clickFirst(page, [
    page.getByRole("button", { name: /weiter|next|continue|log in|login|einloggen|anmelden/i }),
    'button[type="submit"]',
  ]).catch(() => false);
  await page.keyboard.press("Enter").catch(() => {});
  await page.waitForTimeout(2500);

  await onStatus("PIN wird eingegeben");
  const pinFilled = await fillFirst(page, [
    'input[type="password"]',
    'input[inputmode="numeric"]',
    'input[name*="pin" i]',
    'input[id*="pin" i]',
    'input[autocomplete="one-time-code"]',
    'input',
  ], pin);
  if (!pinFilled) {
    throw new Error("Trade-Republic-PIN-Feld nicht gefunden.");
  }

  await clickFirst(page, [
    page.getByRole("button", { name: /weiter|next|continue|log in|login|einloggen|anmelden/i }),
    'button[type="submit"]',
  ]).catch(() => false);
  await page.keyboard.press("Enter").catch(() => {});

  await onStatus("Warte auf Bestaetigung in der Trade-Republic-App");
  const loggedIn = await waitForLoggedIn(page, confirmTimeoutMs);
  if (!loggedIn) {
    const diagnostic = await saveLoginDiagnostic(page).catch(() => null);
    const diagnosticHint = diagnostic
      ? ` Diagnose: ${diagnostic.screenshotPath} / ${diagnostic.textPath}. URL: ${diagnostic.url}. Titel: ${diagnostic.title}.`
      : "";
    throw new Error(`Trade-Republic-Login nicht bestaetigt oder abgelaufen.${diagnosticHint}`);
  }
  return { mode: "fresh-login" };
}
