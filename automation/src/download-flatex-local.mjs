import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import {
  acceptNecessaryCookies,
  ensureFlatexLogin,
  launchFlatexBrowser,
} from "./flatex-browser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requestedPeriod = readArg("--period") ?? process.env.FLATEX_EXPORT_PERIOD ?? "zwei Wochen";
const writeFirestore = process.argv.includes("--write");
const reconcileAfterDownload = writeFirestore || process.argv.includes("--reconcile");
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const driveRoot =
  process.env.DEPOT_DRIVE_ROOT ??
  path.join(
    os.homedir(),
    "Library",
    "CloudStorage",
    "GoogleDrive-niklas.kofler@gmail.com",
    "My Drive",
    "Depot",
  );

const inboxDirectories = {
  depot: path.join(driveRoot, "00_Inbox", "Flatex", "Depotumsaetze"),
  cash: path.join(driveRoot, "00_Inbox", "Flatex", "Kontoumsaetze"),
};

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function timestampForFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    "-",
    pad(date.getMinutes()),
    "-",
    pad(date.getSeconds()),
  ].join("");
}

function periodForFilename(period) {
  return period
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

async function waitForPostings(page) {
  await acceptNecessaryCookies(page);
  await page.locator(".PostingsHeaderAreaInfoButton").click({ timeout: 10000, force: true }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function selectPeriod(page, period) {
  await acceptNecessaryCookies(page);
  const currentPeriod = page.locator(".SecondLevelHeaderArea [role=\"combobox\"], .SecondLevelHeaderArea .Line1").first();
  const label = (await currentPeriod.innerText({ timeout: 10000 })).trim();
  if (label === period) return;

  await currentPeriod.click({ timeout: 10000, force: true });
  await page.waitForTimeout(500);
  await page.getByRole("option", { name: period, exact: true }).click({ timeout: 10000, force: true });
  await page.waitForTimeout(2500);
}

async function activateTab(page, name) {
  await acceptNecessaryCookies(page);
  await page.getByRole("tab", { name, exact: true }).click({ timeout: 10000, force: true });
  await page.waitForTimeout(2500);
}

async function exportCurrentCsv(page, targetPath) {
  await acceptNecessaryCookies(page);
  const actionIcon = page.locator(".ActionButton:not(.Disabled) .IconButton[aria-label=\"Aktionen\"]").last();
  if ((await actionIcon.count()) === 0) return { status: "empty" };

  await actionIcon.click({ timeout: 10000, force: true });
  await page.waitForTimeout(800);
  const exportCsv = page.locator(".Action.ExportCsv");
  if (!(await exportCsv.isVisible().catch(() => false))) return { status: "no-export-button" };

  const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
  await exportCsv.click({ timeout: 10000, force: true });
  const download = await downloadPromise;
  await download.saveAs(targetPath);
  return { status: "downloaded", suggestedFilename: download.suggestedFilename() };
}

async function cleanupRuntimeDownloads(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries.map((entry) => {
      if (!entry.isFile()) return undefined;
      return fs.rm(path.join(directory, entry.name), { force: true });
    }),
  );
}

async function reconcile() {
  const args = [path.join(__dirname, "reconcile-flatex-local.mjs")];
  if (writeFirestore) args.push("--write");
  const result = spawnSync(process.execPath, args, {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Flatex-Abgleich fehlgeschlagen: Exit ${result.status}`);
  }
}

function roundCurrency(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}

await Promise.all(Object.values(inboxDirectories).map((directory) => fs.mkdir(directory, { recursive: true })));

const runtimeDownloadPath =
  process.env.FLATEX_DOWNLOAD_PATH ??
  path.resolve(__dirname, "..", "runtime", "flatex-browser-downloads");
process.env.FLATEX_DOWNLOAD_PATH = runtimeDownloadPath;
await fs.mkdir(runtimeDownloadPath, { recursive: true });
await cleanupRuntimeDownloads(runtimeDownloadPath);

const stamp = timestampForFilename();
const periodSlug = periodForFilename(requestedPeriod);
const targets = {
  depot: path.join(inboxDirectories.depot, `${stamp}_Flatex_Depotumsaetze_${periodSlug}.csv`),
  cash: path.join(inboxDirectories.cash, `${stamp}_Flatex_Kontoumsaetze_${periodSlug}.csv`),
};

const { context, page } = await launchFlatexBrowser();
const results = {};
try {
  await ensureFlatexLogin(page);
  await page.waitForTimeout(1000);
  await waitForPostings(page);
  await selectPeriod(page, requestedPeriod);

  await activateTab(page, "Depotumsätze");
  results.depot = await exportCurrentCsv(page, targets.depot);

  await activateTab(page, "Kontoumsätze");
  results.cash = await exportCurrentCsv(page, targets.cash);
} finally {
  await context.close().catch(() => {});
  await cleanupRuntimeDownloads(runtimeDownloadPath);
}

console.log(
  JSON.stringify(
    {
      source: "flatex",
      period: requestedPeriod,
      targets,
      results,
      reconcileAfterDownload,
      writeFirestore,
    },
    null,
    2,
  ),
);

if (reconcileAfterDownload) await reconcile();
