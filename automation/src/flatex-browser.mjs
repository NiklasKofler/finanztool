import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { requireLocalSecret } from "./local-secret.mjs";

const FLATEX_LOGIN_URL = "https://konto.flatex.at/banking-flatex.at/";
const FLATEX_USER_SERVICE = "finanztool-flatex-user-id";
const FLATEX_PASSWORD_SERVICE = "finanztool-flatex-password";

function defaultChromePath() {
  return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}

export function getFlatexPaths() {
  const home = os.homedir();
  return {
    chromePath: process.env.FLATEX_CHROME_PATH ?? defaultChromePath(),
    profilePath:
      process.env.FLATEX_BROWSER_PROFILE ??
      path.join(home, ".finanztool", "browser-profiles", "flatex"),
    downloadPath:
      process.env.FLATEX_DOWNLOAD_PATH ??
      path.join(
        home,
        "Library",
        "CloudStorage",
        "GoogleDrive-niklas.kofler@gmail.com",
        "My Drive",
        "Depot",
        "00_Inbox",
        "Flatex",
      ),
  };
}

export async function launchFlatexBrowser({ headless = false } = {}) {
  const paths = getFlatexPaths();
  await Promise.all([
    fs.mkdir(paths.profilePath, { recursive: true }),
    fs.mkdir(paths.downloadPath, { recursive: true }),
  ]);

  const context = await chromium.launchPersistentContext(paths.profilePath, {
    executablePath: paths.chromePath,
    headless,
    acceptDownloads: true,
    downloadsPath: paths.downloadPath,
    viewport: { width: 1440, height: 1000 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page, paths };
}

export async function ensureFlatexLogin(page) {
  await page.goto(FLATEX_LOGIN_URL, { waitUntil: "domcontentloaded" });
  const userField = page.locator("#loginForm_txtUserId");
  await Promise.race([
    userField.waitFor({ state: "visible", timeout: 15000 }),
    page.getByText("Mein flatex Depot", { exact: false }).waitFor({ state: "visible", timeout: 15000 }),
  ]).catch(() => {});
  const loginRequired = await userField.isVisible().catch(() => false);
  if (!loginRequired) return;

  const [userId, password] = await Promise.all([
    requireLocalSecret("FLATEX_USER_ID", FLATEX_USER_SERVICE),
    requireLocalSecret("FLATEX_PASSWORD", FLATEX_PASSWORD_SERVICE),
  ]);

  await userField.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(userId, { delay: 35 });
  const passwordField = page.locator("#loginForm_txtPassword_txtPassword");
  await passwordField.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(password, { delay: 35 });

  const sessionTan = page.locator("#loginForm_chkSessionPassword");
  if (await sessionTan.isChecked()) await sessionTan.click();

  await page.keyboard.press("Enter");
  await Promise.race([
    page.getByText("Mein flatex Depot", { exact: false }).waitFor({ state: "visible", timeout: 15000 }),
    page.waitForURL(/overviewFormAction|next-desktop/i, { timeout: 15000 }),
  ]).catch(() => {});

  if (await userField.isVisible().catch(() => false)) {
    throw new Error("Flatex-Anmeldung fehlgeschlagen. Zugangsdaten oder Login-Seite pruefen.");
  }
}

export async function acceptNecessaryCookies(page) {
  const necessaryCookies = page.locator("#CybotCookiebotDialogBodyButtonDecline");
  if ((await necessaryCookies.count()) > 0) {
    await necessaryCookies.click({ timeout: 5000, force: true }).catch(async () => {
      await page.evaluate(() => {
        document.querySelector("#CybotCookiebotDialogBodyButtonDecline")?.click();
      });
    });
    await page
      .locator("#CybotCookiebotDialogBodyUnderlay")
      .waitFor({ state: "hidden", timeout: 5000 })
      .catch(() => {});
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.evaluate(() => {
      for (const selector of [
        "#CybotCookiebotDialog",
        "#CybotCookiebotDialogBodyUnderlay",
        "#CookiebotWidget",
      ]) {
        document.querySelector(selector)?.remove();
      }
    });
    await page.waitForTimeout(300);
  }
}

function parseGermanEuro(value) {
  if (!value) return null;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGermanNumber(value) {
  if (!value) return null;
  const normalized = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIsinWkn(value) {
  const match = String(value ?? "").match(/([A-Z]{2}[A-Z0-9]{10})\s*\(([^)]+)\)/);
  return {
    isin: match?.[1] ?? null,
    wkn: match?.[2] ?? null,
  };
}

function sectionBetween(text, startLabel, endLabel) {
  const start = text.indexOf(startLabel);
  if (start < 0) return "";
  const end = endLabel ? text.indexOf(endLabel, start + startLabel.length) : -1;
  return text.slice(start, end >= 0 ? end : undefined);
}

function readEuroAfterLabel(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}\\s*\\*?\\s*\\n\\s*(-?[\\d.]+,\\d{2})\\s*€`, "i"));
  return parseGermanEuro(match?.[1]);
}

export async function readFlatexOverviewSummary(page) {
  await acceptNecessaryCookies(page);
  await page.getByRole("tab", { name: "Dashboard", exact: true }).click({ timeout: 5000, force: true }).catch(() => {});
  await page.waitForTimeout(1000);
  const text = await page.locator("body").innerText({ timeout: 10000 });
  const accountSection = sectionBetween(text, "Konto und Kredit", "Depot und Guthaben");
  const depotSection = sectionBetween(text, "Depot und Guthaben", "Krypto");
  const cashBalance = readEuroAfterLabel(accountSection, "Kontosaldo");
  const availableCash = readEuroAfterLabel(accountSection, "verfügbares Guthaben");
  const availableWithCredit = readEuroAfterLabel(accountSection, "Verfügbar (inkl. Kredit)");
  const depotValue = readEuroAfterLabel(depotSection, "Depotwert");
  const totalAssets = readEuroAfterLabel(depotSection, "Gesamtvermögen");
  const creditLineEstimate =
    typeof availableWithCredit === "number" && typeof cashBalance === "number" && cashBalance < 0
      ? availableWithCredit - cashBalance
      : null;

  return {
    depotValue,
    cashBalance,
    availableCash,
    availableWithCredit,
    creditLineEstimate,
    totalAssets,
  };
}

export async function readFlatexBrokerPositions(page) {
  await acceptNecessaryCookies(page);
  await page.getByRole("tab", { name: "Alle", exact: true }).click({ timeout: 10000, force: true });
  await page.waitForTimeout(2500);

  const tableRows = await page.evaluate(() =>
    [...document.querySelectorAll("tr.I1")]
      .filter((row) => !row.innerText.includes("Bezeichnung"))
      .map((row) => {
        const details = row.nextElementSibling;
        return {
          cells: [...row.children].map((cell) => cell.innerText.trim()),
          details: details ? [...details.children].map((cell) => cell.innerText.trim()) : [],
        };
      }),
  );

  return tableRows
    .map((row) => {
      const isinWkn = parseIsinWkn(row.details[0]);
      return {
        name: row.cells[0] ?? null,
        exchange: row.cells[1] ?? null,
        quantity: parseGermanNumber(row.cells[2]),
        currentValue: parseGermanNumber(row.cells[3]),
        costValue: parseGermanNumber(row.cells[4]),
        performancePct: parseGermanNumber(row.cells[5]) / 100,
        previousValue: parseGermanNumber(row.cells[6]),
        dailyPct: parseGermanNumber(row.cells[7]) / 100,
        isin: isinWkn.isin,
        wkn: isinWkn.wkn,
        quoteTime: row.details[1] ?? null,
        quoteText: row.details[2] ?? null,
        quotePrice: parseGermanNumber(row.details[2]),
        buyIn: parseGermanNumber(row.details[4]),
        performanceValue: parseGermanNumber(row.details[5]),
        previousQuote: parseGermanNumber(row.details[6]),
        dailyValue: parseGermanNumber(row.details[7]),
      };
    })
    .filter((position) => position.isin && typeof position.quantity === "number");
}
