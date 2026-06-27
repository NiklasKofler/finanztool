import "dotenv/config";
import fs from "node:fs/promises";
import { createBitgetClientFromLocalSecrets } from "./bitget-client.mjs";
import {
  costEventFromBitgetFill,
  incomeEventFromEarnRecord,
  normalizeBitgetBill,
  normalizeBitgetEarnRecord,
  normalizeBitgetFill,
  normalizeBitgetTaxRecord,
} from "./bitget-ledger-normalizer.mjs";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { EVENT_COLLECTIONS, normalizeEventDocument } from "./event-model.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const importId = "api_bitget_ledger_latest";
const runId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const dataProvider = "bitget_ledger_api";
const ledgerBackfillDays = Number.parseInt(
  process.env.BITGET_LEDGER_BACKFILL_DAYS ?? process.env.BITGET_LEDGER_WINDOW_DAYS ?? "90",
  10,
);
const ledgerOverlapDays = Number.parseInt(process.env.BITGET_LEDGER_OVERLAP_DAYS ?? "2", 10);
const taxBackfillDays = Math.min(30, ledgerBackfillDays);
const maxPages = Number.parseInt(process.env.BITGET_LEDGER_MAX_PAGES ?? "20", 10);
const writeConcurrency = Number.parseInt(process.env.BITGET_LEDGER_WRITE_CONCURRENCY ?? "20", 10);
const lockPath = process.env.BITGET_LEDGER_LOCK_PATH ?? "/tmp/finanztool-bitget-ledger.lock";
const staleLockMs = 50 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
const forceBackfill =
  process.argv.includes("--backfill") ||
  process.argv.includes("--full") ||
  process.env.BITGET_LEDGER_FORCE_BACKFILL === "1" ||
  process.env.BITGET_LEDGER_FORCE_BACKFILL === "true";

const accessToken = await getFirebaseCliAccessToken();
const firestore = new FirestoreRest({ projectId, accessToken });
const fetchWarnings = [];

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function recordFetchWarning(scope, error) {
  const warning = { scope, message: formatError(error), at: new Date().toISOString() };
  fetchWarnings.push(warning);
  console.warn(`[warn] Bitget ${scope} skipped: ${warning.message}`);
}

function millisDaysAgo(days, nowMillis = Date.now()) {
  return nowMillis - days * dayMs;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireRunLock() {
  const payload = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });
  try {
    const handle = await fs.open(lockPath, "wx");
    await handle.writeFile(payload);
    await handle.close();
    return async () => {
      await fs.unlink(lockPath).catch(() => {});
    };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;

    const existing = await fs.readFile(lockPath, "utf8").catch(() => "");
    const lockInfo = (() => {
      try {
        return JSON.parse(existing || "{}");
      } catch {
        return {};
      }
    })();
    const startedAt = lockInfo?.startedAt;
    const age = startedAt ? Date.now() - new Date(startedAt).getTime() : Number.POSITIVE_INFINITY;
    if (age > staleLockMs) {
      await fs.unlink(lockPath).catch(() => {});
      return acquireRunLock();
    }

    console.log("[info] Bitget Ledger-Sync laeuft bereits; zweiter Lauf wird uebersprungen.");
    return null;
  }
}

function normalizeResponseList(response) {
  if (Array.isArray(response)) return response;
  return response?.resultList ?? response?.dataList ?? response?.list ?? response?.records ?? [];
}

function responseEndId(response) {
  if (!response || Array.isArray(response)) return null;
  return response.endId ?? response.lastEndId ?? null;
}

async function fetchPagedArray(fetchPage, { idField, limit = 500, pageDelayMs = 0 } = {}) {
  const rows = [];
  let idLessThan = null;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchPage({ idLessThan, limit: String(limit) });
    const list = normalizeResponseList(response);
    if (!list.length) break;
    rows.push(...list);

    const nextId = responseEndId(response) ?? list.at(-1)?.[idField];
    if (!nextId || nextId === idLessThan || list.length < limit) break;
    idLessThan = nextId;
    if (pageDelayMs) await sleep(pageDelayMs);
  }

  return rows;
}

async function fetchSpotBills(client, startTime, endTime) {
  return fetchPagedArray(
    ({ idLessThan, limit }) =>
      client.getSpotBills({
        startTime: String(startTime),
        endTime: String(endTime),
        limit,
        ...(idLessThan ? { idLessThan } : {}),
      }),
    { idField: "billId", limit: 500 },
  );
}

async function fetchSpotFills(client, startTime, endTime) {
  return fetchPagedArray(
    ({ idLessThan, limit }) =>
      client.getSpotFills({
        startTime: String(startTime),
        endTime: String(endTime),
        limit,
        ...(idLessThan ? { idLessThan } : {}),
      }),
    { idField: "tradeId", limit: 100 },
  );
}

async function fetchSavingsRecords(client, startTime, endTime) {
  const rows = [];
  for (const periodType of ["flexible", "fixed"]) {
    for (const orderType of ["pay_interest", "subscribe", "redeem", "deduction"]) {
      const records = await fetchPagedArray(
        ({ idLessThan, limit }) =>
          client.getSavingsRecords({
            periodType,
            orderType,
            startTime: String(startTime),
            endTime: String(endTime),
            limit,
            ...(idLessThan ? { idLessThan } : {}),
          }),
        { idField: "orderId", limit: 100 },
      ).catch((error) => {
        recordFetchWarning(`savings records ${periodType}/${orderType}`, error);
        return [];
      });
      rows.push(...records);
    }
  }
  return rows;
}

async function fetchSavingsAssets(client, startTime, endTime) {
  const assets = [];
  for (const periodType of ["flexible", "fixed"]) {
    const rows = await fetchPagedArray(
      ({ idLessThan, limit }) =>
        client.getSavingsAssets({
          periodType,
          startTime: String(startTime),
          endTime: String(endTime),
          limit,
          ...(idLessThan ? { idLessThan } : {}),
        }),
      { idField: "orderId", limit: 100 },
    ).catch((error) => {
      recordFetchWarning(`savings assets ${periodType}`, error);
      return [];
    });
    assets.push(...rows);
  }
  return assets;
}

async function fetchTaxSpotRecords(client, startTime, endTime) {
  return fetchPagedArray(
    ({ idLessThan, limit }) =>
      client.getTaxSpotRecords({
        startTime: String(startTime),
        endTime: String(endTime),
        limit,
        ...(idLessThan ? { idLessThan } : {}),
      }),
    { idField: "id", limit: 500, pageDelayMs: 1_100 },
  ).catch((error) => {
    recordFetchWarning("tax spot records", error);
    return [];
  });
}

async function fetchTaxFutureRecords(client, startTime, endTime) {
  return fetchPagedArray(
    ({ idLessThan, limit }) =>
      client.getTaxFutureRecords({
        startTime: String(startTime),
        endTime: String(endTime),
        limit,
        ...(idLessThan ? { idLessThan } : {}),
      }),
    { idField: "id", limit: 500, pageDelayMs: 1_100 },
  ).catch((error) => {
    recordFetchWarning("tax future records", error);
    return [];
  });
}

async function writeFailureStatus(error) {
  const now = new Date();
  const existing =
    (await firestore.listDocuments("agentStatus")).find((status) => status.id === "bitget_ledger") ?? {};
  await firestore.setDocument("agentStatus", "bitget_ledger", {
    ...existing,
    source: "bitget",
    status: "FEHLER",
    message: error instanceof Error ? error.message : String(error),
    importId,
    failedRunId: runId,
    updatedAt: now,
    lastAgentRunAt: now,
    lastFailureAt: now,
  });
  await firestore.setDocument("imports", importId, {
    source: "bitget",
    parser: "bitget_ledger_api_v1",
    status: "FEHLER",
    message: error instanceof Error ? error.message : String(error),
    runId,
    updatedAt: now,
    lastFailureAt: now,
  });
}

function parseMillis(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

async function resolveSyncWindow(endTime) {
  const backfillStartTime = millisDaysAgo(ledgerBackfillDays, endTime);
  const taxBackfillStartTime = millisDaysAgo(taxBackfillDays, endTime);

  if (forceBackfill) {
    return {
      mode: "backfill",
      startTime: backfillStartTime,
      endTime,
      taxStartTime: taxBackfillStartTime,
      configuredBackfillDays: ledgerBackfillDays,
      taxBackfillDays,
      overlapDays: ledgerOverlapDays,
    };
  }

  const existing =
    (await firestore.listDocuments("agentStatus")).find((status) => status.id === "bitget_ledger") ?? {};
  const lastEndTime = parseMillis(
    existing.lastLedgerSyncEndAt ??
      existing.windowEndAt ??
      existing.lastAgentSuccessAt ??
      existing.lastSuccessAt ??
      existing.sourceDataUpdatedAt,
  );

  if (!lastEndTime) {
    return {
      mode: "initial_backfill",
      startTime: backfillStartTime,
      endTime,
      taxStartTime: taxBackfillStartTime,
      configuredBackfillDays: ledgerBackfillDays,
      taxBackfillDays,
      overlapDays: ledgerOverlapDays,
    };
  }

  const overlappedStartTime = Math.min(endTime, Math.max(0, lastEndTime - ledgerOverlapDays * dayMs));
  const startTime = Math.max(backfillStartTime, overlappedStartTime);
  return {
    mode: "incremental",
    startTime,
    endTime,
    taxStartTime: Math.max(startTime, taxBackfillStartTime),
    configuredBackfillDays: ledgerBackfillDays,
    taxBackfillDays,
    overlapDays: ledgerOverlapDays,
    previousWindowEndAt: new Date(lastEndTime).toISOString(),
  };
}

async function writeDocuments(collection, documents) {
  for (let offset = 0; offset < documents.length; offset += writeConcurrency) {
    const chunk = documents.slice(offset, offset + writeConcurrency);
    await Promise.all(chunk.map((document) => firestore.setDocument(
      collection,
      document.id,
      EVENT_COLLECTIONS.includes(collection) ? normalizeEventDocument(collection, document) : document,
    )));
  }
}

function uniqueById(documents) {
  return [...new Map(documents.map((document) => [document.id, document])).values()];
}

async function main() {
  const client = await createBitgetClientFromLocalSecrets();
  const now = new Date();
  const endTime = Date.now();
  const syncWindow = await resolveSyncWindow(endTime);
  const { startTime, taxStartTime } = syncWindow;
  const windowDays = Math.max(1, Math.ceil((endTime - startTime) / dayMs));
  const taxWindowDays = Math.max(1, Math.ceil((endTime - taxStartTime) / dayMs));

  const [bills, fills, savingsRecords, savingsAssets] = await Promise.all([
    fetchSpotBills(client, startTime, endTime),
    fetchSpotFills(client, startTime, endTime),
    fetchSavingsRecords(client, startTime, endTime),
    fetchSavingsAssets(client, startTime, endTime),
  ]);
  await sleep(1_100);
  const taxSpotRecords = await fetchTaxSpotRecords(client, taxStartTime, endTime);
  await sleep(1_100);
  const taxFutureRecords = await fetchTaxFutureRecords(client, taxStartTime, endTime);

  const ledgerEntries = uniqueById(bills.map((bill) => normalizeBitgetBill(bill, { importId, now })));
  const transactions = uniqueById(fills.map((fill) => normalizeBitgetFill(fill, { importId, now })));
  const costEvents = uniqueById(transactions
    .map((transaction) => costEventFromBitgetFill(transaction, { now }))
    .filter(Boolean));
  const earnEvents = uniqueById(
    savingsRecords.map((record) => normalizeBitgetEarnRecord(record, { importId, now })),
  );
  const incomeEvents = uniqueById(earnEvents
    .map((record) => incomeEventFromEarnRecord(record, { now }))
    .filter(Boolean));
  const taxFacts = uniqueById([
    ...taxSpotRecords.map((record) => normalizeBitgetTaxRecord(record, { importId, now })),
    ...taxFutureRecords.map((record) => ({
      ...normalizeBitgetTaxRecord(record, { importId, now }),
      id: `bitget_tax_future_${record.id ?? record.bizOrderId ?? record.ts}`,
      factType: "tax_future_record",
    })),
  ]);
  const importStatus = fetchWarnings.length ? "IMPORTED_WITH_WARNINGS" : "IMPORTED";
  const agentStatus = fetchWarnings.length ? "WARNUNG" : "OK";
  const warningSuffix = fetchWarnings.length ? `, ${fetchWarnings.length} Warnung(en)` : "";

  console.log(
    `[info] Bitget Ledger fetched: ${ledgerEntries.length} bills, ` +
      `${transactions.length} fills, ${costEvents.length} fees, ` +
      `${incomeEvents.length} income events, ${taxFacts.length} tax facts`,
  );

  await writeDocuments("ledgerEntries", ledgerEntries);
  await writeDocuments("transactions", transactions);
  await writeDocuments("costEvents", costEvents);
  await writeDocuments("incomeEvents", incomeEvents);
  await writeDocuments("sourceDocumentFacts", taxFacts);

  await firestore.setDocument("rawDocuments", importId, {
    source: "bitget",
    importId,
    fileType: "api",
    parserVersion: "bitget_ledger_api_v1",
    windowDays,
    taxWindowDays,
    windowMode: syncWindow.mode,
    windowStartAt: new Date(startTime).toISOString(),
    windowEndAt: new Date(endTime).toISOString(),
    lastLedgerSyncEndAt: new Date(endTime).toISOString(),
    windowOverlapDays: syncWindow.overlapDays,
    configuredBackfillDays: syncWindow.configuredBackfillDays,
    taxBackfillDays: syncWindow.taxBackfillDays,
    previousWindowEndAt: syncWindow.previousWindowEndAt ?? null,
    bills,
    fills,
    savingsRecords,
    savingsAssets,
    taxSpotRecords,
    taxFutureRecords,
    warnings: fetchWarnings,
    sourceDataUpdatedAt: now,
    sourceDataProvider: dataProvider,
    updatedAt: now,
  });

  await firestore.setDocument("imports", importId, {
    source: "bitget",
    parser: "bitget_ledger_api_v1",
    status: importStatus,
    runId,
    windowDays,
    taxWindowDays,
    windowMode: syncWindow.mode,
    windowStartAt: new Date(startTime).toISOString(),
    windowEndAt: new Date(endTime).toISOString(),
    lastLedgerSyncEndAt: new Date(endTime).toISOString(),
    windowOverlapDays: syncWindow.overlapDays,
    configuredBackfillDays: syncWindow.configuredBackfillDays,
    taxBackfillDays: syncWindow.taxBackfillDays,
    previousWindowEndAt: syncWindow.previousWindowEndAt ?? null,
    billCount: bills.length,
    ledgerEntryCount: ledgerEntries.length,
    fillCount: fills.length,
    transactionCount: transactions.length,
    costEventCount: costEvents.length,
    savingsRecordCount: savingsRecords.length,
    savingsAssetCount: savingsAssets.length,
    incomeEventCount: incomeEvents.length,
    taxSpotRecordCount: taxSpotRecords.length,
    taxFutureRecordCount: taxFutureRecords.length,
    warnings: fetchWarnings,
    sourceDataUpdatedAt: now,
    sourceDataProvider: dataProvider,
    updatedAt: now,
  });

  await firestore.setDocument("agentStatus", "bitget_ledger", {
    source: "bitget",
    status: agentStatus,
    message:
    `${ledgerEntries.length} Ledger, ${transactions.length} Trades, ` +
      `${costEvents.length} Kosten, ${incomeEvents.length} Zinsen synchronisiert ` +
      `(${syncWindow.mode}, ${windowDays} Tage)${warningSuffix}`,
    lastSuccessAt: now,
    lastAgentRunAt: now,
    lastAgentSuccessAt: now,
    sourceDataUpdatedAt: now,
    sourceDataProvider: dataProvider,
    windowDays,
    taxWindowDays,
    windowMode: syncWindow.mode,
    windowStartAt: new Date(startTime).toISOString(),
    windowEndAt: new Date(endTime).toISOString(),
    lastLedgerSyncEndAt: new Date(endTime).toISOString(),
    windowOverlapDays: syncWindow.overlapDays,
    configuredBackfillDays: syncWindow.configuredBackfillDays,
    taxBackfillDays: syncWindow.taxBackfillDays,
    previousWindowEndAt: syncWindow.previousWindowEndAt ?? null,
    warnings: fetchWarnings,
    importId,
  });

  console.log(
    `[ok] Bitget Ledger synchronisiert: ${ledgerEntries.length} Ledger, ` +
      `${transactions.length} Trades, ${costEvents.length} Kosten, ${incomeEvents.length} Zinsen`,
  );
}

let releaseLock = null;
try {
  releaseLock = await acquireRunLock();
  if (releaseLock) await main();
} catch (error) {
  await writeFailureStatus(error);
  console.error(`[error] Bitget Ledger-Sync fehlgeschlagen: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  if (releaseLock) await releaseLock();
}
