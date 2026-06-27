import "dotenv/config";
import crypto from "node:crypto";
import {
  createCapitalComClientFromLocalSecrets,
  fetchCapitalComHistory,
  fetchCapitalComPortfolioSnapshot,
} from "./capitalcom-client.mjs";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { normalizeEventDocument } from "./event-model.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const runId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const importId = `api_capitalcom_${runId.slice(0, 8)}`;
const now = new Date();
const dataProvider = "capitalcom_api";
const historyLookbackDays = Number.parseInt(process.env.CAPITALCOM_HISTORY_DAYS ?? "1", 10);
const historyOverlapDays = Number.parseInt(process.env.CAPITALCOM_HISTORY_OVERLAP_DAYS ?? "0", 10);
const forceHistoryBackfill =
  process.argv.includes("--backfill") ||
  process.argv.includes("--full") ||
  process.env.CAPITALCOM_FORCE_HISTORY_BACKFILL === "1" ||
  process.env.CAPITALCOM_FORCE_HISTORY_BACKFILL === "true";

const accessToken = await getFirebaseCliAccessToken();
const firestore = new FirestoreRest({ projectId, accessToken });
let snapshot;
let history;

function sanitizeId(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160) || "unknown";
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex").slice(0, 24);
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
    : value.replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isoDateTimeForCapitalCom(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "");
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function newestDate(values) {
  return values
    .map(parseDate)
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

function readRowDate(row) {
  return (
    row.date ??
    row.createdDate ??
    row.created ??
    row.timestamp ??
    row.time ??
    row.transactionDate ??
    row.activityDate ??
    row.dealDate ??
    null
  );
}

function readRowCurrency(row) {
  return row.currency ?? row.currencyCode ?? row.amountCurrency ?? row.accountCurrency ?? "EUR";
}

function readRowAmount(row) {
  return (
    parseNumber(row.amount) ??
    parseNumber(row.value) ??
    parseNumber(row.cashTransactionAmount) ??
    parseNumber(row.size) ??
    parseNumber(row.profitAndLoss) ??
    parseNumber(row.pnl) ??
    parseNumber(row.realisedPnl) ??
    parseNumber(row.realizedPnl) ??
    parseNumber(row.fee) ??
    parseNumber(row.commission) ??
    parseNumber(row.swap) ??
    null
  );
}

function readRowType(row, fallback) {
  return (
    row.type ??
    row.transactionType ??
    row.activityType ??
    row.actionType ??
    row.dealStatus ??
    row.status ??
    fallback
  );
}

function readRowDescription(row, fallback) {
  if (row.note && row.instrumentName) return `${row.note} - ${row.instrumentName}`;
  if (row.note) return row.note;
  return (
    row.description ??
    row.details ??
    row.marketName ??
    row.instrumentName ??
    row.epic ??
    row.reference ??
    fallback
  );
}

function isCostLike(row, amount, rawType) {
  const text = (
    `${rawType ?? ""} ${row.transactionType ?? ""} ${row.note ?? ""} ` +
    `${row.description ?? ""} ${row.details ?? ""}`
  ).toLowerCase();
  return (
    text.includes("fee") ||
    text.includes("commission") ||
    text.includes("cost") ||
    text.includes("charge") ||
    text.includes("financing") ||
    text.includes("overnight") ||
    text.includes("swap") ||
    (typeof amount === "number" && amount < 0 && text.includes("tax"))
  );
}

function isIncomeLike(row, amount, rawType) {
  const text = (
    `${rawType ?? ""} ${row.transactionType ?? ""} ${row.note ?? ""} ` +
    `${row.description ?? ""} ${row.details ?? ""}`
  ).toLowerCase();
  return (
    text.includes("interest") ||
    text.includes("dividend") ||
    text.includes("rebate") ||
    text.includes("bonus") ||
    (typeof amount === "number" && amount > 0 && text.includes("adjustment"))
  );
}

function capitalComInstrumentId(row) {
  const instrument = row.epic ?? row.market?.epic ?? row.instrumentName ?? row.marketName;
  return instrument ? `capitalcom_${sanitizeId(instrument).toLowerCase()}` : null;
}

function capitalComLedgerCategory(row, rawType) {
  const text = (
    `${rawType ?? ""} ${row.transactionType ?? ""} ${row.note ?? ""} ` +
    `${row.description ?? ""} ${row.details ?? ""}`
  ).toLowerCase();
  if (text.includes("swap") || text.includes("overnight") || text.includes("financing")) return "financing";
  if (text.includes("trade") || text.includes("closed")) return "realized_pnl";
  if (text.includes("deposit") || text.includes("withdrawal")) return "cash_transfer";
  if (text.includes("correction") || text.includes("adjustment")) return "adjustment";
  return "account_movement";
}

function normalizeCapitalComHistoryRow(kind, row) {
  const rawId =
    row.transactionId ??
    row.activityId ??
    row.dealId ??
    row.reference ??
    row.id ??
    stableHash(row);
  const id = `capitalcom_${kind}_${sanitizeId(rawId)}`;
  const rawType = readRowType(row, kind);
  const amount = readRowAmount(row);
  const date = readRowDate(row);
  const currency = readRowCurrency(row);
  const category = capitalComLedgerCategory(row, rawType);
  return {
    id,
    source: "capitalcom",
    sourceAccountId: row.accountId ?? row.account?.accountId ?? null,
    accountId: row.accountId ?? row.account?.accountId ?? null,
    date: parseDate(date)?.toISOString() ?? date ?? null,
    bookingDate: parseDate(date)?.toISOString()?.slice(0, 10) ?? null,
    rawType,
    type: String(rawType ?? kind).toLowerCase(),
    recordKind: kind,
    category,
    subcategory: String(rawType ?? kind).toLowerCase(),
    description: readRowDescription(row, rawType),
    amount,
    currency,
    instrumentName: row.marketName ?? row.instrumentName ?? row.epic ?? null,
    instrumentId: capitalComInstrumentId(row),
    epic: row.epic ?? row.market?.epic ?? null,
    dealId: row.dealId ?? row.position?.dealId ?? null,
    importId,
    sourceDataProvider: dataProvider,
    sourceDataUpdatedAt: now,
    updatedAt: now,
    raw: row,
  };
}

function costEventFromCapitalComLedgerEntry(entry) {
  if (!isCostLike(entry.raw, entry.amount, entry.rawType)) return null;
  const amount = typeof entry.amount === "number" ? Math.abs(entry.amount) : null;
  return {
    id: `${entry.id}_cost`,
    source: "capitalcom",
    sourceLedgerEntryId: entry.id,
    sourceAccountId: entry.sourceAccountId ?? null,
    date: entry.date,
    category: "trading_cost",
    subcategory: String(entry.rawType ?? "capitalcom_cost").toLowerCase(),
    amount,
    currency: entry.currency,
    description: entry.description,
    instrumentName: entry.instrumentName ?? null,
    instrumentId: entry.instrumentId ?? null,
    epic: entry.epic ?? null,
    importId,
    updatedAt: now,
  };
}

function incomeEventFromCapitalComLedgerEntry(entry) {
  if (!isIncomeLike(entry.raw, entry.amount, entry.rawType)) return null;
  const amount = typeof entry.amount === "number" ? Math.abs(entry.amount) : null;
  return {
    id: `${entry.id}_income`,
    source: "capitalcom",
    sourceLedgerEntryId: entry.id,
    sourceAccountId: entry.sourceAccountId ?? null,
    date: entry.date,
    category: "trading_income",
    subcategory: String(entry.rawType ?? "capitalcom_income").toLowerCase(),
    amount,
    currency: entry.currency,
    description: entry.description,
    instrumentName: entry.instrumentName ?? null,
    instrumentId: entry.instrumentId ?? null,
    epic: entry.epic ?? null,
    importId,
    updatedAt: now,
  };
}

function uniqueById(rows) {
  const result = new Map();
  for (const row of rows) result.set(row.id, row);
  return [...result.values()];
}

try {
  const client = await createCapitalComClientFromLocalSecrets();
  const statuses = await firestore.listDocuments("agentStatus");
  const previousStatus = statuses.find((status) => status.id === "capitalcom");
  const previousHistoryEndAt = parseDate(previousStatus?.lastHistorySyncEndAt);
  const fromDate =
    !forceHistoryBackfill && previousHistoryEndAt
      ? new Date(previousHistoryEndAt.getTime() - historyOverlapDays * 86_400_000)
      : dateDaysAgo(historyLookbackDays);
  const toDate = now;
  snapshot = await fetchCapitalComPortfolioSnapshot(client);
  history = await fetchCapitalComHistory(client, {
    from: isoDateTimeForCapitalCom(fromDate),
    to: isoDateTimeForCapitalCom(toDate),
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await firestore.setDocument("agentStatus", "capitalcom", {
    source: "capitalcom",
    status: "WARNUNG",
    message: `Capital.com API konnte nicht gelesen werden: ${message}`,
    lastAttemptAt: now,
    lastErrorAt: now,
    errorStatus: error?.status ?? null,
    errorRequestPath: error?.requestPath ?? null,
    sourceDataProvider: dataProvider,
    updatedAt: now,
  });
  await firestore.setDocument("imports", importId, {
    source: "capitalcom",
    parser: "capitalcom_api_v1",
    status: "WARNUNG",
    message,
    errorStatus: error?.status ?? null,
    errorRequestPath: error?.requestPath ?? null,
    sourceDataProvider: dataProvider,
    runId,
    updatedAt: now,
  });
  console.warn(`[warn] Capital.com API konnte nicht gelesen werden: ${message}`);
  process.exit(0);
}

const existingPositions = (await firestore.listDocuments("sourcePositions")).filter(
  (position) => position.source === "capitalcom",
);
const currentIds = new Set(snapshot.positions.map((position) => position.id));
for (const position of existingPositions) {
  if (!currentIds.has(position.id)) await firestore.deleteDocument("sourcePositions", position.id);
}

for (const position of snapshot.positions) {
  await firestore.setDocument("sourcePositions", position.id, {
    ...position,
    importId,
    updatedAt: now,
  });
}

const ledgerEntries = uniqueById([
  ...(history?.transactions ?? []).map((row) => normalizeCapitalComHistoryRow("transaction", row)),
  ...(history?.activity ?? []).map((row) => normalizeCapitalComHistoryRow("activity", row)),
]);
const costEvents = uniqueById(ledgerEntries.map(costEventFromCapitalComLedgerEntry).filter(Boolean));
const incomeEvents = uniqueById(ledgerEntries.map(incomeEventFromCapitalComLedgerEntry).filter(Boolean));
for (const entry of ledgerEntries) {
  await firestore.setDocument("ledgerEntries", entry.id, normalizeEventDocument("ledgerEntries", entry, now));
  await firestore.setDocument("sourceDocumentFacts", entry.id, {
    ...entry,
    factType: "capitalcom_api_history",
    parseStatus: "OK",
    ledgerEntryId: entry.id,
  });
}
for (const event of costEvents) await firestore.setDocument("costEvents", event.id, normalizeEventDocument("costEvents", event, now));
for (const event of incomeEvents) await firestore.setDocument("incomeEvents", event.id, normalizeEventDocument("incomeEvents", event, now));

await firestore.setDocument("sourceSummaries", "capitalcom", {
  source: "capitalcom",
  displayName: "Capital.com",
  currentValue: snapshot.currentValue,
  cashValue: snapshot.cashValue,
  netValue: snapshot.netValue,
  valuationDate: snapshot.valuationDate,
  positionCount: snapshot.positionCount,
  workingOrderCount: snapshot.workingOrderCount,
  accounts: snapshot.accounts,
  accountId: snapshot.accountId,
  demo: snapshot.demo,
  nonEurAccountCount: snapshot.nonEurAccountCount,
  status: snapshot.status,
  valuationMethod: "capitalcom_api_v1",
  sourceDataProvider: dataProvider,
  sourceDataUpdatedAt: snapshot.valuationDate,
  quoteDataProvider: dataProvider,
  quoteDataUpdatedAt: snapshot.valuationDate,
  ledgerEntryCount: ledgerEntries.length,
  costEventCount: costEvents.length,
  incomeEventCount: incomeEvents.length,
  historyFrom: history?.from ?? null,
  historyTo: history?.to ?? null,
  historyWarnings: history?.warnings ?? [],
  updatedAt: now,
});

await firestore.setDocument("rawDocuments", "api_capitalcom_latest", {
  source: "capitalcom",
  importId,
  fileType: "api",
  parserVersion: "capitalcom_api_v2",
  accountId: snapshot.accountId,
  accounts: snapshot.accounts,
  positions: snapshot.positions,
  workingOrders: snapshot.workingOrders,
  historyFrom: history?.from ?? null,
  historyTo: history?.to ?? null,
  historyTransactions: history?.transactions ?? [],
  historyActivity: history?.activity ?? [],
  historyWarnings: history?.warnings ?? [],
  raw: {
    snapshot: snapshot.raw,
    history: history?.raw ?? null,
  },
  sourceDataUpdatedAt: snapshot.valuationDate,
  sourceDataProvider: dataProvider,
  quoteDataUpdatedAt: snapshot.valuationDate,
  quoteDataProvider: dataProvider,
  updatedAt: now,
});

await firestore.setDocument("imports", importId, {
  source: "capitalcom",
  parser: "capitalcom_api_v2",
  status: snapshot.status === "VERIFIED" && !history?.warnings?.length ? "IMPORTED" : "WARNUNG",
  positionCount: snapshot.positionCount,
  workingOrderCount: snapshot.workingOrderCount,
  currentValue: snapshot.currentValue,
  valuationDate: snapshot.valuationDate,
  accountCount: snapshot.accounts.length,
  nonEurAccountCount: snapshot.nonEurAccountCount,
  ledgerEntryCount: ledgerEntries.length,
  costEventCount: costEvents.length,
  incomeEventCount: incomeEvents.length,
  historyFrom: history?.from ?? null,
  historyTo: history?.to ?? null,
  historyWarningCount: history?.warnings?.length ?? 0,
  historyWarnings: history?.warnings ?? [],
  runId,
  sourceDataProvider: dataProvider,
  sourceDataUpdatedAt: snapshot.valuationDate,
  quoteDataProvider: dataProvider,
  quoteDataUpdatedAt: snapshot.valuationDate,
  updatedAt: now,
});

const warnings = [...(snapshot.warnings ?? []), ...(history?.warnings ?? [])];
await firestore.setDocument("agentStatus", "capitalcom", {
  source: "capitalcom",
  status: snapshot.status === "VERIFIED" && warnings.length === 0 ? "OK" : "WARNUNG",
  message:
    `${snapshot.accounts.length} Konto/Konten, ${snapshot.positionCount} offene CFD-Positionen, ` +
    `${ledgerEntries.length} History-Eintraege` +
    (warnings.length ? `, ${warnings.length} Warnung(en)` : ""),
  warnings,
  lastAttemptAt: now,
  lastSuccessAt: now,
  lastHistorySyncEndAt: newestDate([history?.to, snapshot.valuationDate]) ?? now,
  valuationDate: snapshot.valuationDate,
  currentValue: snapshot.currentValue,
  positionCount: snapshot.positionCount,
  workingOrderCount: snapshot.workingOrderCount,
  ledgerEntryCount: ledgerEntries.length,
  costEventCount: costEvents.length,
  incomeEventCount: incomeEvents.length,
  sourceDataProvider: dataProvider,
  sourceDataUpdatedAt: snapshot.valuationDate,
  quoteDataProvider: dataProvider,
  quoteDataUpdatedAt: snapshot.valuationDate,
  importId,
  updatedAt: now,
});

console.log(
  `[ok] Capital.com lokal importiert: ${snapshot.accounts.length} Konto/Konten, ` +
    `${snapshot.positionCount} Positionen, ${ledgerEntries.length} History-Eintraege, ` +
    `${snapshot.currentValue.toFixed(2)} EUR`,
);
