import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { requireLocalSecret } from "./local-secret.mjs";

const VBV_LOGIN_URL = "https://www.meinevbv.at/#/login";
const VBV_EMAIL_SERVICE = "finanztool-vbv-email";
const VBV_PASSWORD_SERVICE = "finanztool-vbv-password";

function defaultChromePath() {
  return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}

export function getVbvPaths() {
  const home = os.homedir();
  return {
    chromePath: process.env.VBV_CHROME_PATH ?? defaultChromePath(),
    profilePath:
      process.env.VBV_BROWSER_PROFILE ??
      path.join(home, ".finanztool", "browser-profiles", "vbv"),
  };
}

export async function launchVbvBrowser({ headless = false } = {}) {
  const paths = getVbvPaths();
  await fs.mkdir(paths.profilePath, { recursive: true });

  const context = await chromium.launchPersistentContext(paths.profilePath, {
    executablePath: paths.chromePath,
    headless,
    viewport: { width: 1440, height: 1000 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page, paths };
}

async function isLoggedIn(page) {
  if (page.url().includes("/login")) return false;
  const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
  if (/E-mail address\s+Password\s+LOGIN/i.test(text)) return false;
  return /Logout|Severance Payment Fund|Your balance on/i.test(text);
}

export async function ensureVbvLogin(page) {
  await page.goto(VBV_LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  if (await isLoggedIn(page)) return { mode: "existing-session" };

  const [email, password] = await Promise.all([
    requireLocalSecret("VBV_EMAIL", VBV_EMAIL_SERVICE),
    requireLocalSecret("VBV_PASSWORD", VBV_PASSWORD_SERVICE),
  ]);

  const emailField = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="mail" i]').first();
  const passwordField = page.locator('input[type="password"]').first();
  await emailField.fill(email, { timeout: 10000 });
  await passwordField.fill(password, { timeout: 10000 });

  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")]
      .find((item) => item.textContent?.trim().toLowerCase() === "login" && !item.disabled);
    button?.click();
    return Boolean(button);
  });
  if (!clicked) throw new Error("VBV-Loginbutton wurde nicht gefunden.");

  const startedAt = Date.now();
  while (Date.now() - startedAt < 45000) {
    await page.waitForTimeout(1000);
    if (await isLoggedIn(page)) return { mode: "keychain" };
  }

  throw new Error("VBV-Anmeldung fehlgeschlagen. Zugangsdaten oder Login-Seite pruefen.");
}

function parseGermanMoney(value) {
  const normalized = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGermanDate(value) {
  const match = String(value ?? "").match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function parseVbvBalanceText(text) {
  const normalized = String(text ?? "").replace(/\r/g, "");
  const match =
    normalized.match(/SEVERANCE PAYMENT FUND[\s\S]*?Your balance on\s+(\d{2}\.\d{2}\.\d{4})\s+([\d.\s]+,\d{2})\s*€/i) ??
    normalized.match(/Your balance on\s+(\d{2}\.\d{2}\.\d{4})\s+([\d.\s]+,\d{2})\s*€/i);

  const valuationDate = parseGermanDate(match?.[1]);
  const currentValue = parseGermanMoney(match?.[2]);
  if (!valuationDate || typeof currentValue !== "number") {
    throw new Error("VBV-Saldo konnte aus dem Seitentext nicht erkannt werden.");
  }

  return {
    source: "vbv",
    displayName: "VBV Vorsorgekasse",
    currentValue,
    netValue: currentValue,
    valuationDate,
    valuationMethod: "meine_vbv_dashboard_balance_v1",
    positionCount: 0,
    status: "VERIFIED",
    rawText: match?.[0]?.slice(0, 500) ?? null,
  };
}

export async function readVbvBalance(page) {
  await page.goto("https://www.meinevbv.at/#/home", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const text = await page.locator("body").innerText({ timeout: 10000 });
  return parseVbvBalanceText(text);
}
