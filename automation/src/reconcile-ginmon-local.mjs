import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import {
  classifyGinmonDocument,
  parseGinmonAssetStatus,
  parseGinmonInvoice,
  parseGinmonQuarterlyReport,
} from "./ginmon-parser.mjs";
import { extractPdfText } from "./pdf-text.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
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

const sourceDirectories = [
  path.join(driveRoot, "00_Inbox", "Ginmon"),
  path.join(driveRoot, "01_Originale", "Ginmon"),
  path.join(driveRoot, "02_Archiviert", "Ginmon"),
];

async function listPdfFiles(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listPdfFiles(filePath);
      return entry.isFile() && entry.name.toLowerCase().endsWith(".pdf") ? [filePath] : [];
    }),
  );
  return nested.flat();
}

function assetSortKey(asset) {
  return `${asset.valuationDate ?? "0000-00-00"}_${asset.createdDate ?? "0000-00-00"}`;
}

function stableId(...parts) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 16);
}

function customerIdFromFile(filePath) {
  return path.basename(filePath).match(/customer-([0-9]+)/i)?.[1] ?? null;
}

function sum(values) {
  return values.reduce((total, value) => total + (typeof value === "number" ? value : 0), 0);
}

function enrichPosition(position, accountMeta = {}) {
  const accountKey = position.accountNumber ?? "unknown";
  const portfolioLabel = accountMeta.strategy ?? accountMeta.label ?? accountKey;
  const id = position.isin
    ? `ginmon_${accountKey}_${position.isin}`
    : `ginmon_${accountKey}_cash`;
  return {
    ...position,
    id,
    source: "ginmon",
    portfolioLabel,
    category:
      position.category === "Cash" ? `Cash - ${portfolioLabel}` : `Investmentfonds - ${portfolioLabel}`,
    accountNumber: accountKey,
    customerId: accountMeta.customerId ?? null,
    valuationMethod: "ginmon_asset_status_dynamic_v1",
  };
}

const files = [...new Set((await Promise.all(sourceDirectories.map(listPdfFiles))).flat())];
const documents = [];
const warnings = [];

for (const filePath of files) {
  let text = "";
  try {
    text = await extractPdfText(filePath);
  } catch (error) {
    warnings.push(`${path.basename(filePath)}: PDF konnte nicht gelesen werden (${error.message})`);
    continue;
  }

  const type = classifyGinmonDocument(path.basename(filePath), text);
  const document = { filePath, fileName: path.basename(filePath), type, customerId: customerIdFromFile(filePath) };
  try {
    if (type === "asset_status") document.parsed = parseGinmonAssetStatus(text, filePath);
    if (type === "quarterly_report") document.parsed = parseGinmonQuarterlyReport(text, filePath);
    if (type === "invoice") document.parsed = parseGinmonInvoice(text, filePath);
    if (document.parsed) document.parsed.customerId = document.parsed.customerId ?? document.customerId;
  } catch (error) {
    warnings.push(`${path.basename(filePath)}: Parserfehler (${error.message})`);
  }
  documents.push(document);
}

const strategiesByAccount = new Map();
for (const document of documents.filter((item) => item.type === "quarterly_report" && item.parsed?.strategy)) {
  strategiesByAccount.set(document.parsed.accountNumber ?? "unknown", document.parsed.strategy);
}

const assetsByAccount = new Map();
for (const document of documents.filter((item) => item.type === "asset_status" && item.parsed?.totalValue != null)) {
  const accountNumber = document.parsed.accountNumber ?? "unknown";
  const existing = assetsByAccount.get(accountNumber);
  if (!existing || assetSortKey(document.parsed) > assetSortKey(existing.parsed)) {
    assetsByAccount.set(accountNumber, document);
  }
}

const latestAssets = [...assetsByAccount.values()].sort((left, right) =>
  (left.parsed.accountNumber ?? "").localeCompare(right.parsed.accountNumber ?? ""),
);
const positions = latestAssets.flatMap((document) =>
  document.parsed.positions.map((position) => {
    const accountNumber = document.parsed.accountNumber ?? "unknown";
    return enrichPosition(position, {
      customerId: document.parsed.customerId,
      strategy: strategiesByAccount.get(accountNumber),
    });
  }),
);
const invoiceEvents = documents
  .filter((document) => document.type === "invoice" && document.parsed?.totalAmount != null)
  .map((document) => ({
    id: `ginmon_invoice_${document.parsed.invoiceNumber ?? stableId(document.filePath)}`,
    source: "ginmon",
    type: "invoice",
    amount: document.parsed.totalAmount,
    vatIncluded: document.parsed.vatIncluded,
    baseFee: document.parsed.baseFee,
    discount: document.parsed.discount,
    period: document.parsed.period,
    invoiceDate: document.parsed.invoiceDate,
    invoiceNumber: document.parsed.invoiceNumber,
    sourceDocument: document.filePath,
  }));
const reportingFeeEvents = latestAssets
  .filter((document) => document.parsed.fees?.totalFees != null)
  .map((document) => ({
    id: `ginmon_reporting_fees_${document.parsed.accountNumber ?? stableId(document.filePath)}_${document.parsed.valuationDate}`,
    source: "ginmon",
    type: "asset_status_fee_overview",
    amount: document.parsed.fees.totalFees,
    managementFees: document.parsed.fees.managementFees,
    transactionFees: document.parsed.fees.transactionFees,
    custodyFees: document.parsed.fees.custodyFees,
    valuationDate: document.parsed.valuationDate,
    sourceDocument: document.filePath,
  }));
const costEvents = [...invoiceEvents, ...reportingFeeEvents];
const currentValue = sum(latestAssets.map((document) => document.parsed.totalValue));
const depotValue = sum(latestAssets.map((document) => document.parsed.depotValue));
const cashValue = sum(latestAssets.map((document) => document.parsed.cashValue));
const latestValuationDate = latestAssets
  .map((document) => document.parsed.valuationDate)
  .filter(Boolean)
  .sort()
  .at(-1);

const summary = {
  mode: writeEnabled ? "write" : "dry-run",
  files: files.length,
  documentTypes: Object.fromEntries(
    [...new Set(documents.map((document) => document.type))]
      .sort()
      .map((type) => [type, documents.filter((document) => document.type === type).length]),
  ),
  accounts: latestAssets.map((document) => ({
    accountNumber: document.parsed.accountNumber,
    customerId: document.parsed.customerId ?? null,
    strategy: strategiesByAccount.get(document.parsed.accountNumber ?? "unknown") ?? null,
    valuationDate: document.parsed.valuationDate,
    currentValue: document.parsed.totalValue,
    depotValue: document.parsed.depotValue,
    cashValue: document.parsed.cashValue,
    positionCount: document.parsed.positions.length,
    sourceDocument: document.fileName,
  })),
  currentValue,
  depotValue,
  cashValue,
  positionCount: positions.length,
  costEventCount: costEvents.length,
  warnings,
};

console.log(JSON.stringify(summary, null, 2));

if (!writeEnabled) {
  console.log("[dry-run] Keine Firestore-Daten geaendert. Fuer Schreiben --write verwenden.");
  process.exit(0);
}

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});
const now = new Date();

const existingPositions = (await firestore.listDocuments("sourcePositions")).filter(
  (position) => position.source === "ginmon",
);
const currentIds = new Set(positions.map((position) => position.id));
for (const existing of existingPositions) {
  if (!currentIds.has(existing.id)) await firestore.deleteDocument("sourcePositions", existing.id);
}

for (const position of positions) {
  const { id, accountNumber, ...data } = position;
  await firestore.setDocument("sourcePositions", id, {
    ...data,
    source: "ginmon",
    accountNumber,
    updatedAt: now,
  });
}

const existingSummary = (await firestore.listDocuments("sourceSummaries")).find(
  (document) => document.id === "ginmon",
);
const { id: _summaryId, ...existingSummaryData } = existingSummary ?? {};
await firestore.setDocument("sourceSummaries", "ginmon", {
  ...existingSummaryData,
  source: "ginmon",
  displayName: "Ginmon",
  currentValue,
  depotValue,
  cashValue,
  netValue: currentValue,
  valuationDate: latestValuationDate,
  valuationMethod: "ginmon_asset_status_dynamic_v1",
  positionCount: positions.length,
  accountCount: latestAssets.length,
  accounts: summary.accounts,
  latestCosts: costEvents.filter((event) => event.type === "asset_status_fee_overview"),
  status: latestAssets.length ? "VERIFIED" : "UNVOLLSTAENDIG",
  updatedAt: now,
});

for (const event of costEvents) {
  const { id, ...data } = event;
  await firestore.setDocument("costEvents", id, {
    ...data,
    updatedAt: now,
  });
}

const existingCostEvents = (await firestore.listDocuments("costEvents")).filter(
  (event) => event.source === "ginmon",
);
const currentCostEventIds = new Set(costEvents.map((event) => event.id));
for (const existing of existingCostEvents) {
  if (!currentCostEventIds.has(existing.id)) await firestore.deleteDocument("costEvents", existing.id);
}

await firestore.setDocument("agentStatus", "ginmon", {
  source: "ginmon",
  status: latestAssets.length ? "OK" : "UNVOLLSTAENDIG",
  message: `${latestAssets.length} Ginmon-Depot(s), ${positions.length} Positionen, ${costEvents.length} Kostenereignisse`,
  lastSuccessAt: now,
  positionCount: positions.length,
  currentValue,
});

console.log(`[ok] Ginmon-Abgleich geschrieben: ${positions.length} Positionen, ${currentValue.toFixed(2)} EUR`);
