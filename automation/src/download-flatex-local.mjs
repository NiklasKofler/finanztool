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
  readFlatexBrokerPositions,
  readFlatexOverviewSummary,
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

function parseMaybeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isCashPosition(position) {
  return position.category === "Cash" || /cash|konto|kontostand/i.test(`${position.id ?? ""} ${position.name ?? ""}`);
}

function positionIdForIsin(isin) {
  return `flatex_${String(isin).toUpperCase()}`;
}

function positionQuantityText(quantity) {
  return isNumber(quantity)
    ? `${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 6 }).format(quantity)} Stk.`
    : null;
}

function brokerDayChange(position) {
  const dayChangeValue = parseMaybeNumber(position.dailyValue);
  const dayChangePct = parseMaybeNumber(position.dailyPct);
  const currentValue = parseMaybeNumber(position.currentValue);
  const previousCloseValue =
    isNumber(currentValue) && isNumber(dayChangeValue)
      ? roundCurrency(currentValue - dayChangeValue)
      : parseMaybeNumber(position.previousValue);
  return { dayChangeValue, dayChangePct, previousCloseValue };
}

async function writeBrokerSnapshot({ brokerSnapshot, targets, results, requestedPeriod }) {
  const accessToken = await getFirebaseCliAccessToken();
  const firestore = new FirestoreRest({ projectId, accessToken });
  const now = new Date();
  const importId = "flatex_broker_snapshot_latest";
  const brokerPositions = brokerSnapshot.positions.filter((position) => position.isin);
  const overview = brokerSnapshot.overview;
  const existingPositions = (await firestore.listDocuments("sourcePositions")).filter(
    (position) => position.source === "flatex",
  );
  const existingById = new Map(existingPositions.map((position) => [position.id, position]));
  const existingByIsin = new Map(
    existingPositions
      .filter((position) => position.isin)
      .map((position) => [String(position.isin).toUpperCase(), position]),
  );
  const brokerIds = new Set();

  for (const position of brokerPositions) {
    const isin = String(position.isin).toUpperCase();
    const id = positionIdForIsin(isin);
    const existing = existingById.get(id) ?? existingByIsin.get(isin) ?? {};
    const { id: _existingId, ...existingData } = existing;
    const dayChange = brokerDayChange(position);
    brokerIds.add(id);

    await firestore.setDocument("sourcePositions", id, {
      ...existingData,
      source: "flatex",
      name: position.name ?? existing.name ?? isin,
      isin,
      wkn: position.wkn ?? existing.wkn ?? null,
      exchange: position.exchange ?? null,
      category: existing.category ?? "Wertpapier",
      quantity: parseMaybeNumber(position.quantity),
      quantityText: positionQuantityText(parseMaybeNumber(position.quantity)),
      currentValue: roundCurrency(parseMaybeNumber(position.currentValue)),
      costValue: roundCurrency(parseMaybeNumber(position.costValue)),
      performanceValue: roundCurrency(parseMaybeNumber(position.performanceValue)),
      performancePct: parseMaybeNumber(position.performancePct),
      previousCloseValue: roundCurrency(dayChange.previousCloseValue),
      dayChangeValue: roundCurrency(dayChange.dayChangeValue),
      dayChangePct: dayChange.dayChangePct,
      quoteText: position.quoteText ?? null,
      quotePrice: parseMaybeNumber(position.quotePrice),
      quoteCurrency: "EUR",
      quoteProvider: "flatex",
      quoteAsOf: position.quoteTime ?? null,
      quoteStatus: "OK",
      priceSource: "flatex",
      valuationDate: now,
      valuationMethod: "flatex_broker_snapshot_v1",
      brokerSnapshotImportId: importId,
      accountValueIncluded: true,
      updatedAt: now,
    });
  }

  for (const existing of existingPositions) {
    if (isCashPosition(existing)) continue;
    if (existing.isin && !brokerIds.has(positionIdForIsin(existing.isin))) {
      await firestore.deleteDocument("sourcePositions", existing.id);
    }
  }

  const cashValue = parseMaybeNumber(overview.cashBalance);
  if (isNumber(cashValue)) {
    await firestore.setDocument("sourcePositions", "flatex_cash_eur", {
      source: "flatex",
      name: "Flatex Kontostand",
      category: "Cash",
      quantity: 1,
      quantityText: "1 Konto",
      currency: "EUR",
      currentValue: roundCurrency(cashValue),
      accountValueIncluded: true,
      valuationMethod: "flatex_broker_snapshot_v1",
      brokerSnapshotImportId: importId,
      updatedAt: now,
    });
  }

  const brokerPositionValue = roundCurrency(
    brokerPositions.reduce((sum, position) => sum + (parseMaybeNumber(position.currentValue) ?? 0), 0),
  );
  const costValue = roundCurrency(
    brokerPositions.reduce((sum, position) => sum + (parseMaybeNumber(position.costValue) ?? 0), 0),
  );
  const performanceValueFromPositions = roundCurrency(
    brokerPositions.reduce((sum, position) => sum + (parseMaybeNumber(position.performanceValue) ?? 0), 0),
  );
  const depotValue = roundCurrency(parseMaybeNumber(overview.depotValue) ?? brokerPositionValue);
  const netValue = roundCurrency(
    parseMaybeNumber(overview.totalAssets) ??
      (isNumber(depotValue) && isNumber(cashValue) ? depotValue + cashValue : null),
  );
  const performanceValue =
    isNumber(performanceValueFromPositions) && performanceValueFromPositions !== 0
      ? performanceValueFromPositions
      : isNumber(depotValue) && isNumber(costValue)
        ? roundCurrency(depotValue - costValue)
        : null;
  const existingSummary = (await firestore.listDocuments("sourceSummaries")).find(
    (document) => document.id === "flatex",
  );
  const { id: _summaryId, ...existingSummaryData } = existingSummary ?? {};

  await firestore.setDocument("sourceSummaries", "flatex", {
    ...existingSummaryData,
    source: "flatex",
    displayName: "Flatex",
    currentValue: depotValue,
    depotValue,
    cashValue: roundCurrency(cashValue),
    netValue,
    availableCash: roundCurrency(parseMaybeNumber(overview.availableCash)),
    availableWithCredit: roundCurrency(parseMaybeNumber(overview.availableWithCredit)),
    creditLineEstimate: roundCurrency(parseMaybeNumber(overview.creditLineEstimate)),
    costValue,
    performanceValue,
    performancePct:
      isNumber(costValue) && costValue !== 0 && isNumber(performanceValue)
        ? performanceValue / costValue
        : null,
    brokerPositionValue,
    brokerPositionSummaryDifference:
      isNumber(depotValue) && isNumber(brokerPositionValue) ? roundCurrency(depotValue - brokerPositionValue) : null,
    positionCount: brokerPositions.length + (isNumber(cashValue) ? 1 : 0),
    brokerPositionCount: brokerPositions.length,
    valuationMethod: "flatex_broker_snapshot_v1",
    valuationDate: now,
    brokerSnapshotImportId: importId,
    updatedAt: now,
  });

  await firestore.setDocument("rawDocuments", importId, {
    source: "flatex",
    importType: "broker_snapshot",
    importId,
    period: requestedPeriod,
    targets,
    exportResults: results,
    overview,
    positions: brokerPositions,
    createdAt: now,
    updatedAt: now,
  });

  await firestore.setDocument("imports", importId, {
    source: "flatex",
    importType: "broker_snapshot",
    status: brokerPositions.length ? "OK" : "UNVOLLSTAENDIG",
    positionCount: brokerPositions.length,
    depotValue,
    cashValue: roundCurrency(cashValue),
    netValue,
    updatedAt: now,
  });

  await firestore.setDocument("agentStatus", "flatex", {
    source: "flatex",
    status: brokerPositions.length ? "OK" : "WARNUNG",
    message: brokerPositions.length
      ? `${brokerPositions.length} Broker-Positionen, Depot ${depotValue.toFixed(2)} EUR, Cash ${
          isNumber(cashValue) ? cashValue.toFixed(2) : "n/a"
        } EUR`
      : "Flatex-Broker-Snapshot ohne Positionen gelesen",
    lastSuccessAt: now,
    positionCount: brokerPositions.length,
    cashValue: roundCurrency(cashValue),
    depotValue,
    netValue,
    brokerSnapshotImportId: importId,
  });

  console.log(
    `[ok] Flatex-Broker-Snapshot geschrieben: ${brokerPositions.length} Positionen, Depot ${depotValue.toFixed(
      2,
    )} EUR`,
  );
}

async function writeBrokerSnapshotFailure(error) {
  if (!writeFirestore) return;
  const accessToken = await getFirebaseCliAccessToken();
  const firestore = new FirestoreRest({ projectId, accessToken });
  const now = new Date();
  await firestore.setDocument("agentStatus", "flatex", {
    source: "flatex",
    status: "WARNUNG",
    message: `Umsaetze abgeglichen, aber Broker-Snapshot konnte nicht gelesen werden: ${
      error instanceof Error ? error.message : String(error)
    }`,
    updatedAt: now,
  });
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
let brokerSnapshot = null;
let brokerSnapshotError = null;
try {
  await ensureFlatexLogin(page);
  await page.waitForTimeout(1000);
  await waitForPostings(page);
  await selectPeriod(page, requestedPeriod);

  await activateTab(page, "Depotumsätze");
  results.depot = await exportCurrentCsv(page, targets.depot);

  await activateTab(page, "Kontoumsätze");
  results.cash = await exportCurrentCsv(page, targets.cash);

  try {
    const overview = await readFlatexOverviewSummary(page);
    const positions = await readFlatexBrokerPositions(page);
    brokerSnapshot = { overview, positions };
  } catch (error) {
    brokerSnapshotError = error;
  }
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
      brokerSnapshot: brokerSnapshot
        ? {
            overview: brokerSnapshot.overview,
            positionCount: brokerSnapshot.positions.length,
          }
        : null,
      brokerSnapshotError:
        brokerSnapshotError instanceof Error ? brokerSnapshotError.message : brokerSnapshotError,
      reconcileAfterDownload,
      writeFirestore,
    },
    null,
    2,
  ),
);

if (reconcileAfterDownload) await reconcile();
if (writeFirestore && brokerSnapshot) {
  await writeBrokerSnapshot({ brokerSnapshot, targets, results, requestedPeriod });
} else if (writeFirestore && brokerSnapshotError) {
  await writeBrokerSnapshotFailure(brokerSnapshotError);
}
