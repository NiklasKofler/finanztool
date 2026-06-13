import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import {
  classifyGinmonDocument,
  parseGinmonAccountStatement,
  parseGinmonAnnualStatement,
  parseGinmonAssetStatus,
  parseGinmonCorporateAction,
  parseGinmonEarnings,
  parseGinmonInvoice,
  parseGinmonQuarterlyReport,
  parseGinmonTrade,
} from "./ginmon-parser.mjs";
import { extractPdfText } from "./pdf-text.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const writeDocumentsOnly = process.argv.includes("--write-documents-only");
const shouldWrite = writeEnabled || writeDocumentsOnly;
const verbose = process.argv.includes("--verbose");
const pdfTimeoutMs = Number.parseInt(readArg("--pdf-timeout-ms") ?? "20000", 10);
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

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

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

function portalDocumentIdFromFile(filePath) {
  return path.basename(filePath).match(/_doc-([0-9]+)_/i)?.[1] ?? null;
}

function sourceDocumentId(filePath) {
  const portalDocumentId = portalDocumentIdFromFile(filePath);
  return portalDocumentId ? `ginmon_doc_${portalDocumentId}` : `ginmon_file_${stableId(filePath)}`;
}

function sourceDocumentFactId(documentId, type, index = 0) {
  return `${documentId}_${type}_${String(index + 1).padStart(4, "0")}`;
}

function customerIdFromFile(filePath) {
  return path.basename(filePath).match(/customer-([0-9]+)/i)?.[1] ?? null;
}

function accountNumberFromFile(filePath) {
  return path.basename(filePath).match(/(?:VS|FC|wpabr|divid)_([0-9]{12})/i)?.[1] ?? null;
}

function buildCustomerIdsByAccount(files) {
  const idsByAccount = new Map();
  for (const filePath of files) {
    const accountNumber = accountNumberFromFile(filePath);
    const customerId = customerIdFromFile(filePath);
    if (accountNumber && customerId && !idsByAccount.has(accountNumber)) {
      idsByAccount.set(accountNumber, customerId);
    }
  }
  return idsByAccount;
}

function withTimeout(promise, timeoutMs, message) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function sum(values) {
  return values.reduce((total, value) => total + (typeof value === "number" ? value : 0), 0);
}

function buildDocumentRecords(documents) {
  const records = [];
  const facts = [];

  for (const document of documents) {
    const documentId = sourceDocumentId(document.filePath);
    const parsed = document.parsed ?? null;
    const accountNumber = parsed?.accountNumber ?? accountNumberFromFile(document.filePath);
    const customerId = parsed?.customerId ?? document.customerId ?? null;
    const parseStatus = parsed ? "PARSED" : document.type === "unknown" ? "UNKNOWN" : "UNPARSED";

    records.push({
      id: documentId,
      source: "ginmon",
      externalDocumentId: portalDocumentIdFromFile(document.filePath),
      filePath: document.filePath,
      fileName: document.fileName,
      documentType: document.type,
      parseStatus,
      parserVersion: "ginmon_document_facts_v1",
      accountNumber: accountNumber ?? null,
      customerId,
      valuationDate: parsed?.valuationDate ?? null,
      reportDate: parsed?.reportDate ?? parsed?.invoiceDate ?? null,
      parsed,
    });

    if (!parsed) continue;

    if (document.type === "asset_status") {
      facts.push({
        id: sourceDocumentFactId(documentId, "account_snapshot"),
        source: "ginmon",
        documentId,
        documentType: document.type,
        factType: "account_snapshot",
        accountNumber: parsed.accountNumber ?? null,
        customerId: parsed.customerId ?? null,
        valuationDate: parsed.valuationDate ?? null,
        currentValue: parsed.totalValue ?? null,
        depotValue: parsed.depotValue ?? null,
        cashValue: parsed.cashValue ?? null,
        transactionFees: parsed.fees?.transactionFees ?? null,
        custodyFees: parsed.fees?.custodyFees ?? null,
        managementFees: parsed.fees?.managementFees ?? null,
        totalFees: parsed.fees?.totalFees ?? null,
        sourceDocument: document.filePath,
      });

      parsed.positions?.forEach((position, index) => {
        facts.push({
          id: sourceDocumentFactId(documentId, "position_snapshot", index),
          source: "ginmon",
          documentId,
          documentType: document.type,
          factType: "position_snapshot",
          accountNumber: position.accountNumber ?? parsed.accountNumber ?? null,
          customerId: parsed.customerId ?? null,
          name: position.name,
          category: position.category,
          isin: position.isin ?? null,
          wkn: position.wkn ?? null,
          quantity: position.quantity ?? null,
          quantityText: position.quantityText ?? null,
          quantitySource: typeof position.quantity === "number" ? "document" : null,
          costPrice: position.costPrice ?? null,
          quoteValue: position.quoteValue ?? null,
          quoteText: position.quoteText ?? null,
          currentValue: position.currentValue ?? null,
          costValue: position.costValue ?? null,
          performanceValue: position.performanceValue ?? null,
          performancePct: position.performancePct ?? null,
          valuationDate: position.valuationDate ?? parsed.valuationDate ?? null,
          sourceDocument: document.filePath,
        });
      });
    }

    if (document.type === "quarterly_report") {
      facts.push({
        id: sourceDocumentFactId(documentId, "quarterly_report"),
        source: "ginmon",
        documentId,
        documentType: document.type,
        factType: "quarterly_report",
        accountNumber: parsed.accountNumber ?? null,
        customerId: parsed.customerId ?? null,
        strategy: parsed.strategy ?? null,
        period: parsed.period ?? null,
        reportDate: parsed.reportDate ?? null,
        managementFees: parsed.managementFees ?? null,
        totalValue: parsed.totalValue ?? null,
        sourceDocument: document.filePath,
      });
    }

    if (document.type === "invoice") {
      facts.push({
        id: sourceDocumentFactId(documentId, "invoice"),
        source: "ginmon",
        documentId,
        documentType: document.type,
        factType: "invoice",
        customerId: parsed.customerId ?? null,
        invoiceDate: parsed.invoiceDate ?? null,
        invoiceNumber: parsed.invoiceNumber ?? null,
        period: parsed.period ?? null,
        baseFee: parsed.baseFee ?? null,
        discount: parsed.discount ?? null,
        totalAmount: parsed.totalAmount ?? null,
        vatIncluded: parsed.vatIncluded ?? null,
        sourceDocument: document.filePath,
      });
    }

    if (document.type === "trade") {
      facts.push({
        id: sourceDocumentFactId(documentId, "trade"),
        source: "ginmon",
        documentId,
        documentType: document.type,
        factType: "trade",
        accountNumber: parsed.accountNumber ?? null,
        customerId: parsed.customerId ?? null,
        settlementNumber: parsed.settlementNumber ?? null,
        settlementDocumentDate: parsed.settlementDocumentDate ?? null,
        side: parsed.side ?? null,
        name: parsed.name ?? null,
        isin: parsed.isin ?? null,
        quantity: parsed.quantity ?? null,
        price: parsed.price ?? null,
        currency: "EUR",
        tradeDate: parsed.tradeDate ?? null,
        tradeTime: parsed.tradeTime ?? null,
        exchange: parsed.exchange ?? null,
        settlementDate: parsed.settlementDate ?? null,
        grossAmount: parsed.grossAmount ?? null,
        cashAmount: parsed.cashAmount ?? null,
        dedupeKey: [
          "ginmon",
          parsed.accountNumber,
          parsed.settlementNumber,
          parsed.tradeDate,
          parsed.isin,
          parsed.quantity,
          parsed.cashAmount,
        ]
          .filter((value) => value !== null && value !== undefined)
          .join("|"),
        sourceDocument: document.filePath,
      });
    }

    if (document.type === "earnings") {
      facts.push({
        id: sourceDocumentFactId(documentId, "earning"),
        source: "ginmon",
        documentId,
        documentType: document.type,
        factType: "earning",
        accountNumber: parsed.accountNumber ?? null,
        customerId: parsed.customerId ?? null,
        executionNumber: parsed.executionNumber ?? null,
        executionDocumentDate: parsed.executionDocumentDate ?? null,
        eventType: parsed.eventType ?? null,
        name: parsed.name ?? null,
        isin: parsed.isin ?? null,
        quantity: parsed.quantity ?? null,
        exDate: parsed.exDate ?? null,
        paymentDate: parsed.paymentDate ?? null,
        yearlyAmountPerShare: parsed.yearlyAmountPerShare ?? null,
        investmentIncome: parsed.investmentIncome ?? null,
        taxDate: parsed.taxDate ?? null,
        fundType: parsed.fundType ?? null,
        partialExemptionPct: parsed.partialExemptionPct ?? null,
        dedupeKey: [
          "ginmon",
          parsed.accountNumber,
          parsed.executionNumber,
          parsed.eventType,
          parsed.isin,
          parsed.paymentDate,
          parsed.investmentIncome,
        ]
          .filter((value) => value !== null && value !== undefined)
          .join("|"),
        sourceDocument: document.filePath,
      });
    }

    if (document.type === "corporate_action") {
      facts.push({
        id: sourceDocumentFactId(documentId, "corporate_action"),
        source: "ginmon",
        documentId,
        documentType: document.type,
        factType: "corporate_action",
        accountNumber: parsed.accountNumber ?? null,
        customerId: parsed.customerId ?? null,
        noticeDate: parsed.noticeDate ?? null,
        effectiveDate: parsed.effectiveDate ?? null,
        actionType: parsed.actionType ?? null,
        actionText: parsed.actionText ?? null,
        name: parsed.name ?? null,
        isin: parsed.isin ?? null,
        quantity: parsed.quantity ?? null,
        quantityText: parsed.quantityText ?? null,
        informationUrl: parsed.informationUrl ?? null,
        dedupeKey: [
          "ginmon",
          parsed.accountNumber,
          parsed.actionType,
          parsed.isin,
          parsed.effectiveDate,
          parsed.quantity,
        ]
          .filter((value) => value !== null && value !== undefined)
          .join("|"),
        sourceDocument: document.filePath,
      });
    }

    if (document.type === "annual_statement") {
      facts.push({
        id: sourceDocumentFactId(documentId, "annual_statement"),
        source: "ginmon",
        documentId,
        documentType: document.type,
        factType: "annual_statement",
        accountNumber: parsed.accountNumber ?? null,
        customerId: parsed.customerId ?? null,
        statementNumber: parsed.statementNumber ?? null,
        documentDate: parsed.documentDate ?? null,
        statementDate: parsed.statementDate ?? null,
        declaredPositionCount: parsed.declaredPositionCount ?? null,
        parsedPositionCount: parsed.positions?.length ?? 0,
        sourceDocument: document.filePath,
      });

      parsed.positions?.forEach((position, index) => {
        facts.push({
          id: sourceDocumentFactId(documentId, "annual_position_snapshot", index),
          source: "ginmon",
          documentId,
          documentType: document.type,
          factType: "annual_position_snapshot",
          accountNumber: position.accountNumber ?? parsed.accountNumber ?? null,
          customerId: parsed.customerId ?? null,
          name: position.name ?? null,
          isin: position.isin ?? null,
          quantity: position.quantity ?? null,
          quantityText: position.quantityText ?? null,
          quantitySource: typeof position.quantity === "number" ? "document" : null,
          custodyType: position.custodyType ?? null,
          custodyCountry: position.custodyCountry ?? null,
          statementDate: position.statementDate ?? parsed.statementDate ?? null,
          dedupeKey: [
            "ginmon",
            position.accountNumber ?? parsed.accountNumber,
            "annual_statement",
            parsed.statementDate,
            position.isin,
            position.quantity,
          ]
            .filter((value) => value !== null && value !== undefined)
            .join("|"),
          sourceDocument: document.filePath,
        });
      });
    }

    if (document.type === "account_statement" || document.type === "account_balance") {
      facts.push({
        id: sourceDocumentFactId(documentId, "account_statement"),
        source: "ginmon",
        documentId,
        documentType: document.type,
        factType: "account_statement",
        accountNumber: parsed.accountNumber ?? null,
        customerId: parsed.customerId ?? null,
        iban: parsed.iban ?? null,
        bic: parsed.bic ?? null,
        statementNumber: parsed.statementNumber ?? null,
        statementDate: parsed.statementDate ?? null,
        periodStart: parsed.periodStart ?? null,
        periodEnd: parsed.periodEnd ?? null,
        openingBalance: parsed.openingBalance ?? null,
        closingBalance: parsed.closingBalance ?? null,
        entryCount: parsed.entries?.length ?? 0,
        sourceDocument: document.filePath,
      });

      parsed.entries?.forEach((entry, index) => {
        facts.push({
          id: sourceDocumentFactId(documentId, "cash_ledger_entry", index),
          source: "ginmon",
          documentId,
          documentType: document.type,
          factType: "cash_ledger_entry",
          accountNumber: parsed.accountNumber ?? null,
          customerId: parsed.customerId ?? null,
          statementNumber: parsed.statementNumber ?? null,
          bookingDate: entry.bookingDate ?? null,
          valueDate: entry.valueDate ?? null,
          text: entry.text ?? null,
          amount: entry.amount ?? null,
          currency: entry.currency ?? "EUR",
          dedupeKey: [
            "ginmon",
            parsed.accountNumber,
            parsed.statementNumber,
            index + 1,
            entry.bookingDate,
            entry.amount,
            entry.text,
          ]
            .filter((value) => value !== null && value !== undefined)
            .join("|"),
          sourceDocument: document.filePath,
        });
      });
    }
  }

  return { records, facts };
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
const customerIdsByAccount = buildCustomerIdsByAccount(files);
const documents = [];
const warnings = [];

let processedFileCount = 0;
for (const filePath of files) {
  processedFileCount += 1;
  if (verbose && (processedFileCount === 1 || processedFileCount % 25 === 0 || processedFileCount === files.length)) {
    console.log(`[ginmon-documents] ${processedFileCount}/${files.length} ${path.basename(filePath)}`);
  }
  let text = "";
  try {
    text = await withTimeout(
      extractPdfText(filePath),
      pdfTimeoutMs,
      `PDF-Text-Extraktion Timeout nach ${pdfTimeoutMs}ms`,
    );
  } catch (error) {
    warnings.push(`${path.basename(filePath)}: PDF konnte nicht gelesen werden (${error.message})`);
    continue;
  }

  const type = classifyGinmonDocument(path.basename(filePath), text);
  const document = {
    filePath,
    fileName: path.basename(filePath),
    type,
    customerId: customerIdFromFile(filePath),
  };
  try {
    if (type === "asset_status") document.parsed = parseGinmonAssetStatus(text, filePath);
    if (type === "quarterly_report") document.parsed = parseGinmonQuarterlyReport(text, filePath);
    if (type === "invoice") document.parsed = parseGinmonInvoice(text, filePath);
    if (type === "trade") document.parsed = parseGinmonTrade(text, filePath);
    if (type === "earnings") document.parsed = parseGinmonEarnings(text, filePath);
    if (type === "corporate_action") document.parsed = parseGinmonCorporateAction(text, filePath);
    if (type === "annual_statement") document.parsed = parseGinmonAnnualStatement(text, filePath);
    if (type === "account_statement" || type === "account_balance") {
      document.parsed = parseGinmonAccountStatement(text, filePath);
    }
    if (document.parsed) {
      document.parsed.customerId =
        document.parsed.customerId ??
        document.customerId ??
        customerIdsByAccount.get(document.parsed.accountNumber);
    }
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
  mode: shouldWrite ? (writeDocumentsOnly ? "write-documents-only" : "write") : "dry-run",
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
  parsedDocumentCount: documents.filter((document) => document.parsed).length,
  warnings,
};

console.log(JSON.stringify(summary, null, 2));

if (!shouldWrite) {
  console.log("[dry-run] Keine Firestore-Daten geaendert. Fuer Schreiben --write verwenden.");
  process.exit(0);
}

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});
const now = new Date();
const { records: documentRecords, facts: documentFacts } = buildDocumentRecords(documents);

const existingGinmonDocumentFacts = (await firestore.listDocuments("sourceDocumentFacts")).filter(
  (fact) => fact.source === "ginmon",
);
const currentDocumentFactIds = new Set(documentFacts.map((fact) => fact.id));
for (const existing of existingGinmonDocumentFacts) {
  if (!currentDocumentFactIds.has(existing.id)) await firestore.deleteDocument("sourceDocumentFacts", existing.id);
}

for (const record of documentRecords) {
  const { id, ...data } = record;
  await firestore.setDocument("sourceDocuments", id, {
    ...data,
    updatedAt: now,
  });
}

for (const fact of documentFacts) {
  const { id, ...data } = fact;
  await firestore.setDocument("sourceDocumentFacts", id, {
    ...data,
    updatedAt: now,
  });
}

if (writeDocumentsOnly) {
  await firestore.setDocument("agentStatus", "ginmon_documents", {
    source: "ginmon",
    status: "OK",
    message: `${documentRecords.length} Ginmon-Dokumente, ${documentFacts.length} generische Dokumentfakten gespeichert`,
    lastSuccessAt: now,
    documentCount: documentRecords.length,
    factCount: documentFacts.length,
  });
  console.log(`[ok] Ginmon-Dokumentfakten geschrieben: ${documentRecords.length} Dokumente, ${documentFacts.length} Fakten`);
  process.exit(0);
}

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
