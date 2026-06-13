import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { readLocalSecret } from "./local-secret.mjs";

const GINMON_LOGIN_URL = "https://www.ginmon.de/login";
const GINMON_EMAIL_SERVICE = "finanztool-ginmon-email";
const GINMON_PASSWORD_SERVICE = "finanztool-ginmon-password";

function defaultChromePath() {
  return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}

export function getGinmonPaths() {
  const home = os.homedir();
  return {
    chromePath: process.env.GINMON_CHROME_PATH ?? defaultChromePath(),
    profilePath:
      process.env.GINMON_BROWSER_PROFILE ??
      path.join(home, ".finanztool", "browser-profiles", "ginmon"),
    downloadPath:
      process.env.GINMON_DOWNLOAD_PATH ??
      path.resolve("runtime", "ginmon-browser-downloads"),
  };
}

export async function launchGinmonBrowser({ headless = false } = {}) {
  const paths = getGinmonPaths();
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

export async function ensureGinmonLogin(page, { manualTimeoutMs = 180000 } = {}) {
  await page.goto(GINMON_LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const passwordField = page.locator("#gm-password, input[type=\"password\"]").first();
  const loginRequired = await passwordField.isVisible().catch(() => false);
  if (!loginRequired) return { mode: "existing-session" };

  const [email, password] = await Promise.all([
    readLocalSecret("GINMON_EMAIL", GINMON_EMAIL_SERVICE),
    readLocalSecret("GINMON_PASSWORD", GINMON_PASSWORD_SERVICE),
  ]);

  if (email && password) {
    const emailField = page.locator("input[name=\"username\"], input[type=\"email\"]").first();
    await emailField.fill(email, { timeout: 10000 });
    await passwordField.fill(password, { timeout: 10000 });
    await page.getByRole("button", { name: "Login" }).click({ timeout: 10000 });
    await page.waitForURL(/app\.ginmon\.de/i, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);
    if (!(await passwordField.isVisible().catch(() => false))) return { mode: "keychain" };
  }

  console.log("[info] Bitte im geoeffneten Ginmon-Fenster anmelden. Ich warte auf die App.");
  const startedAt = Date.now();
  while (Date.now() - startedAt < manualTimeoutMs) {
    await page.waitForTimeout(1000);
    if (!(await passwordField.isVisible().catch(() => false))) {
      await page.waitForTimeout(5000);
      return { mode: "manual" };
    }
  }
  if (await passwordField.isVisible().catch(() => false)) {
    throw new Error("Ginmon-Anmeldung nicht abgeschlossen.");
  }
  return { mode: "manual" };
}
