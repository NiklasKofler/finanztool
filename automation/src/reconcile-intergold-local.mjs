import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { normalizeEventDocument } from "./event-model.mjs";
import {
  fetchIntergoldPriceHtml,
  INTERGOLD_PRICE_URL,
  parseIntergoldPricesFromHtml,
} from "./intergold-prices.mjs";
import {
  compactIntergoldId,
  convertMetalValue,
  parseIntergoldConfirmation,
} from "./intergold-parser.mjs";
import { extractPdfText } from "./pdf-text.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const saveSnapshot = writeEnabled || process.argv.includes("--snapshot");
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
  path.join(driveRoot, "00_Inbox", "Intergold"),
  path.join(driveRoot, "01_Originale", "Intergold", "Einlagerungsbestaetigungen"),
  path.join(driveRoot, "02_Archiviert", "Intergold", "Einlagerungsbestaetigungen"),
  path.join(driveRoot, "Intergold", "01_Einlagerungsbestätigung"),
  path.join(driveRoot, "Intergold", "Einlagerungsbestaetigungen"),
];
const snapshotDirectory = path.join(driveRoot, "01_Originale", "Intergold", "PreisSnapshots");
const documentDataProvider = "intergold_confirmation_pdf";
const quoteDataProvider = "intergold_website";
const source = "intergold";

function sum(values) {
  return values.reduce((total, value) => total + (typeof value === "number" ? value : 0), 0);
}

function roundCurrency(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

function stableId(...parts) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 20);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function documentIdFromHash(fileHash) {
  return `intergold_doc_${fileHash.slice(0, 20)}`;
}

function factId(...parts) {
  return `intergold_fact_${stableId(...parts)}`;
}

function transactionId(...parts) {
  return `intergold_tx_${stableId(...parts)}`;
}

function costEventId(...parts) {
  return `intergold_cost_${stableId(...parts)}`;
}

function classifyIntergoldDocument({ fileName, text, confirmation }) {
  if (confirmation?.positions?.length) {
    return {
      documentType: "purchase_confirmation",
      parseStatus: "PARSED",
      classification: "Intergold Kauf-/Einlagerungsbeleg",
    };
  }

  const normalized = `${fileName}\n${text}`.toLowerCase();
  if (/verkauf|rueckkauf|rückkauf|auslagerung|ausfolgung|storno/.test(normalized)) {
    return {
      documentType: "sale_or_withdrawal_document",
      parseStatus: "UNPARSED",
      classification: "Intergold Verkaufs-/Auslagerungsdokument",
    };
  }

  if (/rechnung|beleg|einlagerung|lager|depot|metall|edelmetall/.test(normalized)) {
    return {
      documentType: "intergold_info_document",
      parseStatus: "UNPARSED",
      classification: "Intergold Info-Dokument",
    };
  }

  return {
    documentType: "unknown",
    parseStatus: "UNKNOWN",
    classification: "Intergold unbekanntes Dokument",
  };
}

function textExcerpt(value, maxLength = 1200) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function priceHistoryId(price) {
  return compactIntergoldId(
    [
      "intergold",
      price.metal,
      price.priceDate,
      price.unit,
      price.saleEur,
      price.buyEur,
    ].join("_"),
  );
}

function priceChangeKey(price) {
  return [
    price?.metal,
    price?.priceDate,
    price?.unit,
    price?.saleEur,
    price?.buyEur,
    price?.status,
  ].join("|");
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

async function savePriceSnapshot(html, fetchedAt) {
  if (!saveSnapshot) return null;
  await fs.mkdir(snapshotDirectory, { recursive: true });
  const stamp = fetchedAt.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "_");
  const snapshotPath = path.join(snapshotDirectory, `${stamp}_Intergold_Aktuelles.html`);
  await fs.writeFile(snapshotPath, html, "utf8");
  return snapshotPath;
}

async function scanIntergoldDocuments(filePaths) {
  const documentsByHash = new Map();
  const warnings = [];

  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    let fileHash = null;
    let text = "";
    let confirmation = null;
    let classification = {
      documentType: "unknown",
      parseStatus: "ERROR",
      classification: "Intergold Dokument konnte nicht gelesen werden",
    };
    let errorMessage = null;

    try {
      const content = await fs.readFile(filePath);
      fileHash = sha256(content);
      if (documentsByHash.has(fileHash)) {
        const existing = documentsByHash.get(fileHash);
        existing.duplicatePaths.push(filePath);
        existing.sourcePaths = [...new Set([...existing.sourcePaths, filePath])].sort();
        continue;
      }

      text = await extractPdfText(filePath);
      confirmation = parseIntergoldConfirmation(text, filePath);
      classification = classifyIntergoldDocument({ fileName, text, confirmation });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      warnings.push(`${fileName}: ${errorMessage}`);
      if (!fileHash) {
        fileHash = stableId(filePath, errorMessage);
      }
    }

    const documentId = documentIdFromHash(fileHash);
    if (confirmation?.positions?.length) {
      confirmation = {
        ...confirmation,
        sourceDocument: documentId,
        sourceFilePath: filePath,
        sourceFileHash: fileHash,
        positions: confirmation.positions.map((position) => ({
          ...position,
          sourceDocument: documentId,
          sourceFilePath: filePath,
          sourceFileHash: fileHash,
        })),
      };
    }

    documentsByHash.set(fileHash, {
      id: documentId,
      source,
      sourceChannel: "intergold_attachment",
      fileName,
      filePath,
      sourcePaths: [filePath],
      duplicatePaths: [],
      fileHash,
      fileType: "pdf",
      documentType: classification.documentType,
      parseStatus: classification.parseStatus,
      classification: classification.classification,
      documentDate: confirmation?.invoiceDate ?? null,
      invoiceNumber: confirmation?.invoiceNumber ?? null,
      totalAmount: confirmation?.totalAmount ?? null,
      lineCostTotal: confirmation?.lineCostTotal ?? null,
      feeAmount: confirmation?.feeAmount ?? null,
      positionCount: confirmation?.positions?.length ?? 0,
      rawTextExcerpt: textExcerpt(text),
      parserVersion: "intergold_document_v1",
      errorMessage,
      confirmation,
    });
  }

  return {
    documents: [...documentsByHash.values()],
    confirmations: [...documentsByHash.values()]
      .map((document) => document.confirmation)
      .filter((confirmation) => confirmation?.positions?.length),
    warnings,
  };
}

function buildHoldings(confirmations, prices) {
  const priceByMetal = new Map(
    prices.filter((price) => price.status === "OK").map((price) => [price.metal.toLowerCase(), price]),
  );
  const holdingsByMetal = new Map();

  for (const confirmation of confirmations) {
    for (const position of confirmation.positions) {
      const key = position.normalizedMetal.toLowerCase();
      const existing =
        holdingsByMetal.get(key) ?? {
          metal: position.normalizedMetal,
          originalMetals: new Set(),
          quantity: 0,
          unit: position.unit,
          lineCostValue: 0,
          allocatedFee: 0,
          costValue: 0,
          sourceDocuments: new Set(),
          invoiceNumbers: new Set(),
          invoiceDates: new Set(),
        };
      if (existing.unit !== position.unit) {
        existing.unitMismatch = true;
      }
      existing.originalMetals.add(position.metal);
      existing.quantity += position.quantity ?? 0;
      existing.lineCostValue += position.lineCostValue ?? 0;
      existing.allocatedFee += position.allocatedFee ?? 0;
      existing.costValue += position.costValue ?? 0;
      if (position.sourceDocument) existing.sourceDocuments.add(position.sourceDocument);
      if (position.invoiceNumber) existing.invoiceNumbers.add(position.invoiceNumber);
      if (position.invoiceDate) existing.invoiceDates.add(position.invoiceDate);
      holdingsByMetal.set(key, existing);
    }
  }

  return [...holdingsByMetal.values()].map((holding) => {
    const price = priceByMetal.get(holding.metal.toLowerCase());
    const currentValueBuy =
      price && convertMetalValue(holding.quantity, holding.unit, price.buyEur, price.unit);
    const currentValueSale =
      price && convertMetalValue(holding.quantity, holding.unit, price.saleEur, price.unit);
    const currentValue = roundCurrency(currentValueBuy);
    const saleValue = roundCurrency(currentValueSale);
    const costValue = roundCurrency(holding.costValue);
    return {
      metal: holding.metal,
      originalMetals: [...holding.originalMetals].sort(),
      quantity: holding.quantity,
      unit: holding.unit,
      lineCostValue: roundCurrency(holding.lineCostValue),
      allocatedFee: roundCurrency(holding.allocatedFee),
      costValue,
      priceUnit: price?.unit ?? null,
      buyEur: price?.buyEur ?? null,
      saleEur: price?.saleEur ?? null,
      priceDate: price?.priceDate ?? null,
      currentValueBuy: currentValue,
      currentValueSale: saleValue,
      performanceValue:
        currentValue != null && costValue != null ? roundCurrency(currentValue - costValue) : null,
      performancePct:
        currentValue != null && costValue ? (currentValue - costValue) / costValue : null,
      sourceDocuments: [...holding.sourceDocuments].sort(),
      invoiceNumbers: [...holding.invoiceNumbers].sort(),
      invoiceDates: [...holding.invoiceDates].sort(),
      latestDocumentDate: [...holding.invoiceDates].filter(Boolean).sort().at(-1) ?? null,
      status:
        holding.unitMismatch || currentValue == null || saleValue == null ? "UNVOLLSTAENDIG" : "VERIFIED",
    };
  });
}

function holdingToPosition(holding) {
  return {
    id: `intergold_${compactIntergoldId(holding.metal)}`,
    source: "intergold",
    name: holding.metal,
    category: "Metall",
    quantityText: `${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 5 }).format(holding.quantity)} ${holding.unit}`,
    currentValue: holding.currentValueBuy,
    saleValue: holding.currentValueSale,
    costValue: holding.costValue,
    performanceValue: holding.performanceValue,
    performancePct: holding.performancePct,
    quoteText:
      holding.buyEur != null && holding.priceUnit
        ? `Ankauf ${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(holding.buyEur)} EUR/${holding.priceUnit}`
        : null,
    valuationDate: holding.priceDate,
    valuationMethod: "intergold_buy_price_v1",
    sourceDataUpdatedAt: holding.latestDocumentDate,
    sourceDataProvider: documentDataProvider,
    documentDataUpdatedAt: holding.latestDocumentDate,
    documentDataProvider,
    quoteDataUpdatedAt: holding.priceDate,
    quoteDataProvider,
    sourceUrl: INTERGOLD_PRICE_URL,
    accountValueIncluded: true,
  };
}

function buildDocumentFacts(documents, now) {
  const facts = [];
  for (const document of documents) {
    if (document.parseStatus !== "PARSED") continue;

    const baseFact = {
      id: factId(document.id, "summary"),
      source,
      sourceDocumentId: document.id,
      sourceChannel: document.sourceChannel,
      documentType: document.documentType,
      parseStatus: document.parseStatus,
      factType:
        document.parseStatus === "PARSED"
          ? "intergold_purchase_confirmation"
          : "intergold_unparsed_attachment",
      fileName: document.fileName,
      filePath: document.filePath,
      fileHash: document.fileHash,
      documentDate: document.documentDate,
      invoiceNumber: document.invoiceNumber,
      totalAmount: document.totalAmount,
      lineCostTotal: document.lineCostTotal,
      feeAmount: document.feeAmount,
      positionCount: document.positionCount,
      classification: document.classification,
      rawTextExcerpt: document.rawTextExcerpt,
      errorMessage: document.errorMessage,
      updatedAt: now,
    };
    facts.push(baseFact);

    for (const position of document.confirmation?.positions ?? []) {
      facts.push({
        id: factId(document.id, "position", position.lineNumber, position.articleNumber, position.metal),
        source,
        sourceDocumentId: document.id,
        sourceChannel: document.sourceChannel,
        documentType: document.documentType,
        parseStatus: "PARSED",
        factType: "intergold_purchase_position",
        fileName: document.fileName,
        filePath: document.filePath,
        fileHash: document.fileHash,
        invoiceNumber: position.invoiceNumber,
        invoiceDate: position.invoiceDate,
        lineNumber: position.lineNumber,
        articleNumber: position.articleNumber,
        metal: position.normalizedMetal,
        originalMetal: position.metal,
        quantity: position.quantity,
        unit: position.unit,
        lineCostValue: roundCurrency(position.lineCostValue),
        allocatedFee: roundCurrency(position.allocatedFee),
        costValue: roundCurrency(position.costValue),
        currency: "EUR",
        updatedAt: now,
      });
    }
  }
  return facts;
}

function buildPurchaseTransactions(confirmations, now) {
  return confirmations.flatMap((confirmation) =>
    confirmation.positions.map((position) => ({
      id: transactionId(
        confirmation.sourceDocument,
        position.invoiceNumber,
        position.lineNumber,
        position.articleNumber,
        position.normalizedMetal,
      ),
      source,
      sourceDocumentId: confirmation.sourceDocument,
      filePath: confirmation.sourceFilePath,
      fileHash: confirmation.sourceFileHash,
      date: position.invoiceDate,
      type: "buy",
      category: "metal_purchase",
      bookingText: `Intergold Kauf ${position.normalizedMetal}`,
      invoiceNumber: position.invoiceNumber,
      lineNumber: position.lineNumber,
      articleNumber: position.articleNumber,
      metal: position.normalizedMetal,
      quantity: position.quantity,
      unit: position.unit,
      amount: roundCurrency(position.lineCostValue),
      totalCostValue: roundCurrency(position.costValue),
      allocatedFee: roundCurrency(position.allocatedFee),
      currency: "EUR",
      updatedAt: now,
    })),
  );
}

function buildPurchaseCostEvents(confirmations, now) {
  return confirmations.flatMap((confirmation) =>
    confirmation.positions
      .filter((position) => (position.allocatedFee ?? 0) > 0)
      .map((position) => ({
        id: costEventId(
          confirmation.sourceDocument,
          position.invoiceNumber,
          position.lineNumber,
          position.articleNumber,
          "fee_allocation",
        ),
        source,
        sourceDocumentId: confirmation.sourceDocument,
        filePath: confirmation.sourceFilePath,
        fileHash: confirmation.sourceFileHash,
        date: position.invoiceDate,
        type: "purchase_fee_allocation",
        category: "metal_purchase_fee",
        bookingText: `Intergold anteilige Kauf-/Lagerkosten ${position.normalizedMetal}`,
        invoiceNumber: position.invoiceNumber,
        lineNumber: position.lineNumber,
        metal: position.normalizedMetal,
        amount: roundCurrency(position.allocatedFee),
        amountAbs: roundCurrency(Math.abs(position.allocatedFee ?? 0)),
        currency: "EUR",
        updatedAt: now,
      })),
  );
}

const fetchedAt = new Date();
const html = await fetchIntergoldPriceHtml();
const snapshotPath = await savePriceSnapshot(html, fetchedAt);
const prices = parseIntergoldPricesFromHtml(html);
const files = [...new Set((await Promise.all(sourceDirectories.map(listPdfFiles))).flat())];
const documentScan = await scanIntergoldDocuments(files);
const documents = documentScan.documents;
const confirmations = documentScan.confirmations;
const warnings = documentScan.warnings;
const openInfoDocuments = documents.filter((document) => document.parseStatus !== "PARSED");

const holdings = buildHoldings(confirmations, prices);
const positions = holdings.map(holdingToPosition);
const currentValue = roundCurrency(sum(holdings.map((holding) => holding.currentValueBuy)));
const saleValue = roundCurrency(sum(holdings.map((holding) => holding.currentValueSale)));
const costValue = roundCurrency(sum(holdings.map((holding) => holding.costValue)));
const lineCostValue = roundCurrency(sum(holdings.map((holding) => holding.lineCostValue)));
const allocatedFee = roundCurrency(sum(holdings.map((holding) => holding.allocatedFee)));
const missingPrices = holdings.filter((holding) => holding.status !== "VERIFIED").map((holding) => holding.metal);
const latestPriceDate = prices.map((price) => price.priceDate).filter(Boolean).sort().at(-1) ?? null;
const latestDocumentDate =
  confirmations.map((confirmation) => confirmation.invoiceDate).filter(Boolean).sort().at(-1) ?? null;

const summary = {
  mode: writeEnabled ? "write" : "dry-run",
  priceCount: prices.length,
  okPriceCount: prices.filter((price) => price.status === "OK").length,
  priceDate: latestPriceDate,
  latestDocumentDate,
  pdfCount: files.length,
  sourceDocumentCount: documents.length,
  confirmationCount: confirmations.length,
  openInfoDocumentCount: openInfoDocuments.length,
  holdingCount: holdings.length,
  currentValue,
  saleValue,
  costValue,
  lineCostValue,
  allocatedFee,
  missingPrices,
  snapshotPath,
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
const [existingSummaries, existingCurrentPrices, existingPriceHistory] = await Promise.all([
  firestore.listDocuments("sourceSummaries"),
  firestore.listDocuments("intergoldPrices"),
  firestore.listDocuments("intergoldPriceHistory"),
]);
const existingSummary = existingSummaries.find((document) => document.id === "intergold");
const { id: _summaryId, ...existingSummaryData } = existingSummary ?? {};
const existingPriceByMetal = new Map(
  existingCurrentPrices.map((price) => [String(price.metal ?? price.id ?? "").toLowerCase(), price]),
);
const existingPriceHistoryIds = new Set(existingPriceHistory.map((price) => price.id));
const priceChanged = prices.some((price) => {
  const existingPrice = existingPriceByMetal.get(String(price.metal ?? "").toLowerCase());
  return !existingPrice || priceChangeKey(existingPrice) !== priceChangeKey(price);
});
const currentPriceHistoryIds = new Set(prices.map(priceHistoryId));
const latestCurrentPriceHistoryCreatedAt =
  existingPriceHistory
    .filter((price) => currentPriceHistoryIds.has(price.id))
    .map((price) => price.createdAt ?? price.fetchedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
const quoteDataChangedAt =
  priceChanged
    ? now
    : existingSummaryData.quoteDataChangedAt ??
      existingSummaryData.priceChangedAt ??
      latestCurrentPriceHistoryCreatedAt ??
      null;

const documentFacts = buildDocumentFacts(documents, now);
const purchaseTransactions = buildPurchaseTransactions(confirmations, now);
const purchaseCostEvents = buildPurchaseCostEvents(confirmations, now);

for (const document of documents) {
  const { confirmation: _confirmation, ...documentData } = document;
  await firestore.setDocument("sourceDocuments", document.id, {
    ...documentData,
    status: document.parseStatus === "PARSED" ? "PARSED" : "REVIEW_REQUIRED",
    sourceDataProvider: documentDataProvider,
    documentDataProvider,
    documentDataUpdatedAt: document.documentDate,
    updatedAt: now,
  });
}

for (const fact of documentFacts) {
  const { id, ...data } = fact;
  await firestore.setDocument("sourceDocumentFacts", id, data);
}

for (const transaction of purchaseTransactions) {
  const { id, ...data } = normalizeEventDocument("transactions", transaction, fetchedAt);
  await firestore.setDocument("transactions", id, data);
}

for (const costEvent of purchaseCostEvents) {
  const { id, ...data } = normalizeEventDocument("costEvents", costEvent, fetchedAt);
  await firestore.setDocument("costEvents", id, data);
}

const existingPositions = (await firestore.listDocuments("sourcePositions")).filter(
  (position) => position.source === "intergold",
);
const currentPositionIds = new Set(positions.map((position) => position.id));
for (const existing of existingPositions) {
  if (!currentPositionIds.has(existing.id)) await firestore.deleteDocument("sourcePositions", existing.id);
}

for (const position of positions) {
  const { id, ...data } = position;
  await firestore.setDocument("sourcePositions", id, {
    ...data,
    lastAgentRunAt: now,
    lastAgentSuccessAt: now,
    updatedAt: now,
  });
}

for (const holding of holdings) {
  await firestore.setDocument("intergoldHoldings", compactIntergoldId(holding.metal), {
    ...holding,
    updatedAt: now,
  });
}

for (const price of prices) {
  const currentId = compactIntergoldId(price.metal);
  const historyId = priceHistoryId(price);
  await firestore.setDocument("intergoldPrices", currentId, {
    ...price,
    sourceUrl: INTERGOLD_PRICE_URL,
    lastFetchedAt: fetchedAt,
    quoteDataUpdatedAt: price.priceDate,
    quoteDataProvider,
    quoteDataChangedAt,
    updatedAt: now,
  });
  if (!existingPriceHistoryIds.has(historyId)) {
    await firestore.setDocument("intergoldPriceHistory", historyId, {
      ...price,
      sourceUrl: INTERGOLD_PRICE_URL,
      fetchedAt,
      importRunId: stableId("intergold", fetchedAt.toISOString()),
      rawSnapshotPath: snapshotPath,
      createdAt: now,
    });
  }
}

await firestore.setDocument("sourceSummaries", "intergold", {
  ...existingSummaryData,
  source: "intergold",
  displayName: "Intergold",
  currentValue,
  saleValue,
  costValue,
  lineCostValue,
  allocatedFee,
  performanceValue: currentValue != null && costValue != null ? roundCurrency(currentValue - costValue) : null,
  performancePct: currentValue != null && costValue ? (currentValue - costValue) / costValue : null,
  valuationMethod: "intergold_buy_price_v1",
  valuationDate: latestPriceDate,
  priceDate: latestPriceDate,
  priceSourceUrl: INTERGOLD_PRICE_URL,
  priceSnapshotPath: snapshotPath,
  sourceDataUpdatedAt: latestDocumentDate,
  sourceDataProvider: documentDataProvider,
  documentDataUpdatedAt: latestDocumentDate,
  documentDataProvider,
  quoteDataUpdatedAt: latestPriceDate,
  quoteDataProvider,
  quoteDataChangedAt,
  lastAgentRunAt: now,
  lastAgentSuccessAt: now,
  priceChanged,
  sourceDocumentCount: confirmations.length,
  registeredDocumentCount: documents.length,
  openInfoDocumentCount: openInfoDocuments.length,
  documentFactCount: documentFacts.length,
  transactionCount: purchaseTransactions.length,
  costEventCount: purchaseCostEvents.length,
  positionCount: positions.length,
  missingPrices,
  status: missingPrices.length ? "PARTIAL" : "VERIFIED",
  updatedAt: now,
});

await firestore.setDocument("agentStatus", "intergold", {
  source: "intergold",
  status: missingPrices.length ? "PARTIAL" : "OK",
  message:
    `${positions.length} Intergold-Positionen, ${prices.length} Preise, ` +
    `${documents.length} Dokumente registriert, ${openInfoDocuments.length} offen im Postfach, ` +
    `${missingPrices.length} fehlende Preise`,
  lastSuccessAt: now,
  lastAgentRunAt: now,
  lastAgentSuccessAt: now,
  sourceDataUpdatedAt: latestDocumentDate,
  sourceDataProvider: documentDataProvider,
  documentDataUpdatedAt: latestDocumentDate,
  documentDataProvider,
  quoteDataUpdatedAt: latestPriceDate,
  quoteDataProvider,
  quoteDataChangedAt,
  priceChanged,
  positionCount: positions.length,
  registeredDocumentCount: documents.length,
  openInfoDocumentCount: openInfoDocuments.length,
  documentFactCount: documentFacts.length,
  transactionCount: purchaseTransactions.length,
  costEventCount: purchaseCostEvents.length,
  currentValue,
});

console.log(`[ok] Intergold-Abgleich geschrieben: ${positions.length} Positionen, ${currentValue.toFixed(2)} EUR`);
