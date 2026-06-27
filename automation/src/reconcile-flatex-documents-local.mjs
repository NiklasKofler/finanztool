import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import {
  classifyFlatexDocument,
  parseFlatexDocumentByType,
} from "./flatex-document-parser.mjs";
import { replaceFlatexEvents } from "./flatex-event-normalizer.mjs";
import { extractPdfText } from "./pdf-text.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
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
  path.join(driveRoot, "00_Inbox", "Flatex"),
  path.join(driveRoot, "01_Originale", "Flatex"),
  path.join(driveRoot, "02_Archiviert", "Flatex"),
];

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function stableId(...parts) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 16);
}

function postboxDocumentIdFromFile(filePath) {
  return path.basename(filePath).match(/_([0-9]{8,})\.pdf$/i)?.[1] ?? null;
}

function sourceDocumentId(filePath) {
  const postboxDocumentId = postboxDocumentIdFromFile(filePath);
  return postboxDocumentId ? `flatex_doc_${postboxDocumentId}` : `flatex_file_${stableId(filePath)}`;
}

function sourceDocumentFactId(documentId, type, index = 0) {
  return `${documentId}_${type}_${String(index + 1).padStart(4, "0")}`;
}

function withTimeout(promise, timeoutMs, message) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
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

function factBase(document, documentId, factType) {
  const parsed = document.parsed ?? {};
  return {
    source: "flatex",
    documentId,
    documentType: document.type,
    factType,
    accountNumber: parsed.accountNumber ?? null,
    depotNumber: parsed.depotNumber ?? null,
    customerNumber: parsed.customerNumber ?? null,
    documentDate: parsed.documentDate ?? null,
    sourceDocument: document.filePath,
  };
}

function buildDocumentRecords(documents) {
  const records = [];
  const facts = [];

  for (const document of documents) {
    const documentId = sourceDocumentId(document.filePath);
    const parsed = document.parsed ?? null;
    const parseStatus = parsed ? "PARSED" : document.type === "unknown" ? "UNKNOWN" : "UNPARSED";

    records.push({
      id: documentId,
      source: "flatex",
      externalDocumentId: postboxDocumentIdFromFile(document.filePath),
      filePath: document.filePath,
      fileName: document.fileName,
      documentType: document.type,
      parseStatus,
      parserVersion: "flatex_document_facts_v1",
      accountNumber: parsed?.accountNumber ?? null,
      depotNumber: parsed?.depotNumber ?? null,
      customerNumber: parsed?.customerNumber ?? null,
      valuationDate: parsed?.statementDate ?? parsed?.settlementDate ?? null,
      reportDate: parsed?.documentDate ?? null,
      parsed,
    });

    if (!parsed) continue;

    if (document.type === "security_trade") {
      parsed.trades?.forEach((trade, index) => {
        facts.push({
          id: sourceDocumentFactId(documentId, "security_trade", index),
          ...factBase(document, documentId, "security_trade"),
          orderNumber: trade.orderNumber ?? null,
          transactionNumber: trade.transactionNumber ?? null,
          side: trade.side ?? null,
          name: trade.name ?? null,
          isin: trade.isin ?? null,
          wkn: trade.wkn ?? null,
          quantity: trade.quantity ?? null,
          quantityText: trade.quantityText ?? null,
          tradeDate: trade.tradeDate ?? null,
          tradeTime: trade.tradeTime ?? null,
          settlementDate: trade.settlementDate ?? null,
          exchange: trade.exchange ?? null,
          price: trade.price ?? null,
          grossAmount: trade.grossAmount ?? null,
          provision: trade.provision ?? null,
          externalFees: trade.externalFees ?? null,
          withheldTax: trade.withheldTax ?? null,
          profitLoss: trade.profitLoss ?? null,
          cashAmount: trade.cashAmount ?? null,
          currency: trade.currency ?? "EUR",
          dedupeKey: [
            "flatex",
            trade.orderNumber,
            trade.transactionNumber,
            trade.side,
            trade.isin,
            trade.tradeDate,
            trade.quantity,
            trade.cashAmount,
          ].filter((value) => value !== null && value !== undefined).join("|"),
        });
      });
    }

    if (document.type === "income_distribution" || document.type === "fund_accumulation") {
      facts.push({
        id: sourceDocumentFactId(documentId, document.type),
        ...factBase(document, documentId, document.type),
        transactionNumber: parsed.transactionNumber ?? null,
        name: parsed.name ?? null,
        isin: parsed.isin ?? null,
        wkn: parsed.wkn ?? null,
        quantity: parsed.quantity ?? null,
        exDate: parsed.exDate ?? null,
        paymentDate: parsed.paymentDate ?? null,
        settlementDate: parsed.settlementDate ?? null,
        inflowDate: parsed.inflowDate ?? null,
        grossPerShare: parsed.grossPerShare ?? null,
        grossAmount: parsed.grossAmount ?? null,
        taxableIncome: parsed.taxableIncome ?? null,
        taxBase: parsed.taxBase ?? null,
        withheldTax: parsed.withheldTax ?? null,
        withholdingTaxRate: parsed.withholdingTaxRate ?? null,
        withholdingTax: parsed.withholdingTax ?? null,
        fxRate: parsed.fxRate ?? null,
        cashAmount: parsed.cashAmount ?? null,
        dedupeKey: [
          "flatex",
          document.type,
          parsed.transactionNumber,
          parsed.isin,
          parsed.exDate,
          parsed.cashAmount,
        ].filter((value) => value !== null && value !== undefined).join("|"),
      });
    }

    if (document.type === "account_statement") {
      facts.push({
        id: sourceDocumentFactId(documentId, "account_statement"),
        ...factBase(document, documentId, "account_statement"),
        statementDate: parsed.statementDate ?? null,
        accountBalance: parsed.accountBalance ?? null,
        positionCount: parsed.positions?.length ?? 0,
      });
      parsed.positions?.forEach((position, index) => {
        facts.push({
          id: sourceDocumentFactId(documentId, "account_position_market_value", index),
          ...factBase(document, documentId, "account_position_market_value"),
          statementDate: parsed.statementDate ?? null,
          isin: position.isin ?? null,
          marketValue: position.marketValue ?? null,
          currency: position.currency ?? "EUR",
        });
      });
    }

    if (document.type === "depot_statement") {
      facts.push({
        id: sourceDocumentFactId(documentId, "depot_statement"),
        ...factBase(document, documentId, "depot_statement"),
        statementDate: parsed.statementDate ?? null,
        statementNumber: parsed.statementNumber ?? null,
        declaredPositionCount: parsed.declaredPositionCount ?? null,
        parsedPositionCount: parsed.positions?.length ?? 0,
        totalValue: parsed.totalValue ?? null,
      });
      parsed.positions?.forEach((position, index) => {
        facts.push({
          id: sourceDocumentFactId(documentId, "depot_position_snapshot", index),
          ...factBase(document, documentId, "depot_position_snapshot"),
          statementDate: parsed.statementDate ?? null,
          name: position.name ?? null,
          isin: position.isin ?? null,
          quantity: position.quantity ?? null,
          quantityText: position.quantityText ?? null,
          marketValue: position.marketValue ?? null,
          valuationPrice: position.valuationPrice ?? null,
          custodyText: position.custodyText ?? null,
          currency: position.currency ?? "EUR",
        });
      });
    }

    if (document.type === "corporate_action") {
      facts.push({
        id: sourceDocumentFactId(documentId, "corporate_action"),
        ...factBase(document, documentId, "corporate_action"),
        actionType: parsed.actionType ?? null,
        valuationDate: parsed.valuationDate ?? null,
        ratio: parsed.ratio ?? null,
        taxableIncome: parsed.taxableIncome ?? null,
        withheldTax: parsed.withheldTax ?? null,
        cashAmount: parsed.cashAmount ?? null,
        instruments: parsed.instruments ?? [],
      });
    }

    if (document.type === "tax_certificate") {
      facts.push({
        id: sourceDocumentFactId(documentId, "tax_certificate"),
        ...factBase(document, documentId, "tax_certificate"),
        taxYear: parsed.taxYear ?? null,
        orderNumber: parsed.orderNumber ?? null,
        entryCount: parsed.entries?.length ?? 0,
      });
      parsed.entries?.forEach((entry, index) => {
        facts.push({
          id: sourceDocumentFactId(documentId, "tax_certificate_entry", index),
          ...factBase(document, documentId, "tax_certificate_entry"),
          taxYear: parsed.taxYear ?? null,
          orderNumber: parsed.orderNumber ?? null,
          label: entry.label ?? null,
          income: entry.income ?? null,
          creditableForeignTax: entry.creditableForeignTax ?? null,
          capitalGainsTax: entry.capitalGainsTax ?? null,
        });
      });
    }

    if (document.type === "cash_adjustment") {
      facts.push({
        id: sourceDocumentFactId(documentId, "cash_adjustment"),
        ...factBase(document, documentId, "cash_adjustment"),
        title: parsed.title ?? null,
        adjustmentType: parsed.adjustmentType ?? null,
        valuationDate: parsed.valuationDate ?? null,
        name: parsed.name ?? null,
        isin: parsed.isin ?? null,
        wkn: parsed.wkn ?? null,
        quantity: parsed.quantity ?? null,
        grossAmount: parsed.grossAmount ?? null,
        amount: parsed.amount ?? null,
        cashAmount: parsed.cashAmount ?? null,
        currency: parsed.currency ?? "EUR",
      });
    }

    if (document.type === "cost_information") {
      facts.push({
        id: sourceDocumentFactId(documentId, "cost_information"),
        ...factBase(document, documentId, "cost_information"),
        title: parsed.title ?? null,
        costYear: parsed.costYear ?? null,
        totalCosts: parsed.totalCosts ?? null,
        serviceCosts: parsed.serviceCosts ?? null,
        otherCosts: parsed.otherCosts ?? null,
        productCosts: parsed.productCosts ?? null,
        fxCosts: parsed.fxCosts ?? null,
        rebates: parsed.rebates ?? null,
        ancillaryCosts: parsed.ancillaryCosts ?? null,
        productCount: parsed.products?.length ?? 0,
        currency: parsed.currency ?? "EUR",
      });
      parsed.products?.forEach((product, index) => {
        facts.push({
          id: sourceDocumentFactId(documentId, "cost_information_product", index),
          ...factBase(document, documentId, "cost_information_product"),
          costYear: parsed.costYear ?? null,
          name: product.name ?? null,
          isin: product.isin ?? null,
          totalCosts: product.totalCosts ?? null,
          serviceCosts: product.serviceCosts ?? null,
          otherCosts: product.otherCosts ?? null,
          productCosts: product.productCosts ?? null,
          fxCosts: product.fxCosts ?? null,
          rebates: product.rebates ?? null,
          currency: product.currency ?? "EUR",
        });
      });
    }

    if (![
      "security_trade",
      "income_distribution",
      "fund_accumulation",
      "account_statement",
      "depot_statement",
      "corporate_action",
      "tax_certificate",
      "cash_adjustment",
      "cost_information",
    ].includes(document.type)) {
      facts.push({
        id: sourceDocumentFactId(documentId, document.type),
        ...factBase(document, documentId, document.type),
        title: parsed.title ?? null,
        containsIsin: parsed.containsIsin ?? false,
        isin: parsed.isin ?? null,
        amount: parsed.amount ?? null,
      });
    }
  }

  return { records, facts };
}

const files = [...new Set((await Promise.all(sourceDirectories.map(listPdfFiles))).flat())];
const documents = [];
const warnings = [];

let processedFileCount = 0;
for (const filePath of files) {
  processedFileCount += 1;
  if (verbose && (processedFileCount === 1 || processedFileCount % 25 === 0 || processedFileCount === files.length)) {
    console.log(`[flatex-documents] ${processedFileCount}/${files.length} ${path.basename(filePath)}`);
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

  const type = classifyFlatexDocument(path.basename(filePath), text);
  const document = {
    filePath,
    fileName: path.basename(filePath),
    type,
  };
  try {
    document.parsed = parseFlatexDocumentByType(type, text, filePath);
  } catch (error) {
    warnings.push(`${path.basename(filePath)}: Parserfehler (${error.message})`);
  }
  documents.push(document);
}

const { records, facts } = buildDocumentRecords(documents);
const countBy = (items, keyFn) => {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => String(left).localeCompare(String(right))));
};

const summary = {
  mode: writeEnabled ? "write" : "dry-run",
  files: files.length,
  documentTypes: countBy(documents, (document) => document.type),
  parseStatus: countBy(records, (record) => record.parseStatus),
  factTypes: countBy(facts, (fact) => fact.factType),
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

const existingFlatexDocumentFacts = (await firestore.listDocuments("sourceDocumentFacts")).filter(
  (fact) => fact.source === "flatex",
);
const currentFactIds = new Set(facts.map((fact) => fact.id));
for (const existing of existingFlatexDocumentFacts) {
  if (!currentFactIds.has(existing.id)) await firestore.deleteDocument("sourceDocumentFacts", existing.id);
}

for (const record of records) {
  const { id, ...data } = record;
  await firestore.setDocument("sourceDocuments", id, {
    ...data,
    updatedAt: now,
  });
}

for (const fact of facts) {
  const { id, ...data } = fact;
  await firestore.setDocument("sourceDocumentFacts", id, {
    ...data,
    updatedAt: now,
  });
}

const normalizedEvents = await replaceFlatexEvents(firestore, facts, now);

await firestore.setDocument("agentStatus", "flatex_documents", {
  source: "flatex",
  status: records.some((record) => record.parseStatus === "UNKNOWN" || record.parseStatus === "UNPARSED")
    ? "WARNUNG"
    : "OK",
  message: `${records.length} Flatex-Dokumente, ${facts.length} Fakten, ${normalizedEvents.written.transactions} Transaktionen, ${normalizedEvents.written.costEvents} Kosten, ${normalizedEvents.written.incomeEvents} Ertraege gespeichert`,
  lastSuccessAt: now,
  documentCount: records.length,
  factCount: facts.length,
  normalizedTransactions: normalizedEvents.written.transactions,
  normalizedLedgerEntries: normalizedEvents.written.ledgerEntries,
  normalizedCostEvents: normalizedEvents.written.costEvents,
  normalizedIncomeEvents: normalizedEvents.written.incomeEvents,
  unknownCount: records.filter((record) => record.parseStatus === "UNKNOWN").length,
  warningCount: warnings.length,
  warnings: warnings.slice(0, 20),
});

console.log(`[ok] Flatex-Dokumentfakten geschrieben: ${records.length} Dokumente, ${facts.length} Fakten`);
