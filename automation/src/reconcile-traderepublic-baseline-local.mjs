import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { extractPdfText } from "./pdf-text.mjs";
import { parseCsv, rowsToObjects } from "./summary-utils.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const source = "traderepublic";
const writeEnabled = process.argv.includes("--write");
const quoteSyncEnabled = writeEnabled && !process.argv.includes("--no-quotes");

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

const baselineDate = readArg("--baseline-date") ?? new Date().toISOString().slice(0, 10);
const defaultSourceDir = path.join(os.homedir(), "Downloads");
const defaultArchiveDir = path.join(driveRoot, "01_Originale", "TradeRepublic", "Baseline", baselineDate);

const csvPath = readArg("--csv") ?? path.join(defaultSourceDir, "Transaction export.csv");
const accountStatementPath = readArg("--account-statement") ?? path.join(defaultSourceDir, "Account statement.pdf");
const taxReportPath = readArg("--tax-report") ?? path.join(defaultSourceDir, "Tax Report 2025.pdf");
const archiveDir = readArg("--archive-dir") ?? defaultArchiveDir;

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function sanitizeId(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGermanNumber(value) {
  const normalized = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}

function roundQuantity(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1_000_000_000) / 1_000_000_000 : value;
}

function clean(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function detectDelimiter(firstLine) {
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function classifyTransaction(row) {
  const category = String(row.category ?? "").toUpperCase();
  const type = String(row.type ?? "").toUpperCase();
  const shares = parseCsvNumber(row.shares) ?? 0;
  if (category === "TRADING" && (type === "BUY" || type === "SELL") && shares > 0) return "trade";
  if (type.includes("PRIVATE_MARKET_BUY")) return "private_market_cash";
  if (type.includes("INTEREST")) return "interest";
  if (type.includes("EARNINGS") || type.includes("DIVIDEND")) return "dividend";
  if (type.includes("TAX")) return "tax";
  if (type.includes("FEE")) return "fee";
  if (type.includes("BONUS") || type.includes("STOCKPERK")) return "bonus";
  if (category === "CASH") return "cash";
  if (category === "CORPORATE_ACTION") return "corporate_action";
  return "other";
}

function parseTransactionCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  const delimiter = detectDelimiter(lines[0] ?? "");
  const rows = rowsToObjects(parseCsv(csvText, delimiter)).map((row, index) => {
    const parsed = {
      rowNumber: index + 1,
      datetime: clean(row.datetime),
      date: clean(row.date),
      accountType: clean(row.account_type),
      category: clean(row.category),
      type: clean(row.type),
      assetClass: clean(row.asset_class),
      name: clean(row.name),
      isin: clean(row.symbol),
      shares: parseCsvNumber(row.shares),
      price: parseCsvNumber(row.price),
      amount: parseCsvNumber(row.amount),
      fee: parseCsvNumber(row.fee),
      tax: parseCsvNumber(row.tax),
      currency: clean(row.currency) ?? "EUR",
      originalAmount: parseCsvNumber(row.original_amount),
      originalCurrency: clean(row.original_currency),
      fxRate: parseCsvNumber(row.fx_rate),
      description: clean(row.description),
      transactionId: clean(row.transaction_id),
      counterpartyName: clean(row.counterparty_name),
      counterpartyIban: clean(row.counterparty_iban),
      paymentReference: clean(row.payment_reference),
      mccCode: clean(row.mcc_code),
      factType: classifyTransaction(row),
    };
    return { raw: row, parsed };
  });

  const ordered = [...rows].sort((left, right) =>
    String(left.parsed.datetime ?? left.parsed.date ?? "").localeCompare(String(right.parsed.datetime ?? right.parsed.date ?? "")),
  );
  return { rows: ordered, holdings: buildHoldings(ordered) };
}

function buildHoldings(rows) {
  const byIsin = new Map();
  const latestTradeByIsin = new Map();

  for (const row of rows) {
    const tx = row.parsed;
    if (!tx.isin || !tx.type) continue;
    const type = tx.type.toUpperCase();
    const shares = tx.shares ?? 0;
    if (shares <= 0) continue;

    const current = byIsin.get(tx.isin) ?? {
      isin: tx.isin,
      name: tx.name ?? tx.isin,
      assetClass: tx.assetClass,
      quantity: 0,
      costValue: 0,
      buyCostTotal: 0,
      buyQuantityTotal: 0,
      sellProceedsTotal: 0,
      sellQuantityTotal: 0,
      realizedPnL: 0,
      transactionCount: 0,
      firstTransactionDate: tx.date,
      lastTransactionDate: tx.date,
    };

    if (tx.factType === "corporate_action" && type === "SPLIT") {
      current.quantity += shares;
    } else if (tx.factType !== "trade") {
      continue;
    } else if (type === "BUY") {
      const grossFromAmount = typeof tx.amount === "number" && tx.amount !== 0 ? Math.abs(tx.amount) : null;
      const grossFromPrice = typeof tx.price === "number" ? shares * tx.price : null;
      const gross = grossFromAmount ?? grossFromPrice ?? 0;
      const buyCost = gross + Math.abs(tx.fee ?? 0) + Math.abs(tx.tax ?? 0);
      current.quantity += shares;
      current.costValue += buyCost;
      current.buyCostTotal += buyCost;
      current.buyQuantityTotal += shares;
    } else if (type === "SELL") {
      const averageCost = current.quantity > 0 ? current.costValue / current.quantity : 0;
      const soldQuantity = Math.min(current.quantity, shares);
      const removedCost = soldQuantity * averageCost;
      const proceeds = Math.abs(tx.amount ?? 0) - Math.abs(tx.fee ?? 0) - Math.abs(tx.tax ?? 0);
      current.quantity = Math.max(0, current.quantity - soldQuantity);
      current.costValue = Math.max(0, current.costValue - removedCost);
      current.sellProceedsTotal += proceeds;
      current.sellQuantityTotal += soldQuantity;
      current.realizedPnL += proceeds - removedCost;
    }

    current.transactionCount += 1;
    current.lastTransactionDate = tx.date ?? current.lastTransactionDate;
    if (Math.abs(current.quantity) < 1e-10) current.quantity = 0;
    if (Math.abs(current.costValue) < 1e-8) current.costValue = 0;
    byIsin.set(tx.isin, current);

    if (typeof tx.price === "number" && tx.price > 0) {
      latestTradeByIsin.set(tx.isin, { price: tx.price, date: tx.date, datetime: tx.datetime });
    }
  }

  return [...byIsin.values()]
    .filter((position) => position.quantity > 0)
    .map((position) => {
      const latest = latestTradeByIsin.get(position.isin);
      const currentValue =
        latest && typeof latest.price === "number" ? roundCurrency(position.quantity * latest.price) : null;
      const performanceValue =
        typeof currentValue === "number" ? roundCurrency(currentValue - position.costValue) : null;
      return {
        ...position,
        quantity: roundQuantity(position.quantity),
        costValue: roundCurrency(position.costValue),
        buyCostTotal: roundCurrency(position.buyCostTotal),
        sellProceedsTotal: roundCurrency(position.sellProceedsTotal),
        realizedPnL: roundCurrency(position.realizedPnL),
        avgCostPerShare: position.quantity > 0 ? position.costValue / position.quantity : null,
        latestTradePrice: latest?.price ?? null,
        latestTradeDate: latest?.date ?? null,
        currentValue,
        performanceValue,
        performancePct: position.costValue && performanceValue !== null ? performanceValue / position.costValue : null,
      };
    });
}

const monthMap = new Map([
  ["jan", "01"],
  ["jaen", "01"],
  ["j\u00e4n", "01"],
  ["feb", "02"],
  ["maer", "03"],
  ["m\u00e4r", "03"],
  ["mar", "03"],
  ["apr", "04"],
  ["mai", "05"],
  ["jun", "06"],
  ["juni", "06"],
  ["jul", "07"],
  ["juli", "07"],
  ["aug", "08"],
  ["sep", "09"],
  ["sept", "09"],
  ["okt", "10"],
  ["nov", "11"],
  ["dez", "12"],
]);

function parseAustrianDate(value) {
  const match = String(value ?? "").match(/(\d{1,2})\.?\s+([A-Za-zÄÖÜäöüß]+)\.?\s+(20\d{2})/);
  if (!match) return null;
  const monthKey = match[2].toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const month = monthMap.get(monthKey) ?? monthMap.get(match[2].toLowerCase());
  if (!month) return null;
  return `${match[3]}-${month}-${String(match[1]).padStart(2, "0")}`;
}

function parseAccountStatementText(text) {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const periodMatch = normalized.match(/DATUM\s+(.+?)\s*-\s*(.+?)\s+IBAN/i);
  const overviewMatch = normalized.match(
    /Cashkonto\s+€\s*([-\d.,]+)\s+€\s*([-\d.,]+)\s+€\s*([-\d.,]+)\s+€\s*([-\d.,]+)/i,
  );
  return {
    documentType: "account_statement",
    periodStart: parseAustrianDate(periodMatch?.[1]),
    periodEnd: parseAustrianDate(periodMatch?.[2]),
    iban: normalized.match(/\bIBAN\s+([A-Z]{2}\d{2}[A-Z0-9]+)/i)?.[1] ?? null,
    bic: normalized.match(/\bBIC\s+([A-Z0-9]+)/i)?.[1] ?? null,
    createdAtText: normalized.match(/Erstellt am\s+(.+?)\s+Seite\s+1/i)?.[1] ?? null,
    openingBalance: parseGermanNumber(overviewMatch?.[1]),
    paymentIn: parseGermanNumber(overviewMatch?.[2]),
    paymentOut: parseGermanNumber(overviewMatch?.[3]),
    closingBalance: parseGermanNumber(overviewMatch?.[4]),
    rawText: normalized,
  };
}

function parseTaxReportText(text) {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const year =
    normalized.match(/Steuerbescheinigung\s+f[üu]r\s+das\s+Jahr\s+(20\d{2})/i)?.[1] ??
    normalized.match(/Tax Report\s+(20\d{2})/i)?.[1] ??
    path.basename(taxReportPath).match(/(20\d{2})/)?.[1] ??
    null;
  const additionalMatch = normalized.match(
    /Weitere Angaben\s+([-\d.,]+)\s+Noch nicht .*?Eink[üu]nfte.*?([-\d.,]+)\s+-\s+darauf entfallende Kapitalertragsteuer/i,
  );
  return {
    documentType: "tax_report",
    taxYear: year,
    depotNumber: normalized.match(/Depot-Nr\.:\s*([A-Z0-9-]+)/i)?.[1] ?? null,
    accountNumber: normalized.match(/Konto-Nr\.:\s*([A-Z0-9-]+)/i)?.[1] ?? null,
    referenceNumber: normalized.match(/Vorgangs-Nr\.:\s*([A-Z0-9-]+)/i)?.[1] ?? null,
    excessIncomeNotOffset: parseGermanNumber(additionalMatch?.[1]),
    capitalGainsTaxOnExcessIncome: parseGermanNumber(additionalMatch?.[2]),
    rawText: normalized,
  };
}

async function readBaselineDocuments() {
  const [csvContent, accountText, taxText] = await Promise.all([
    fs.readFile(csvPath),
    extractPdfText(accountStatementPath),
    extractPdfText(taxReportPath),
  ]);
  const csvText = csvContent.toString("utf8");
  const csvParsed = parseTransactionCsv(csvText);
  const accountStatement = parseAccountStatementText(accountText);
  const taxReport = parseTaxReportText(taxText);
  return {
    csvText,
    csvHash: sha256(csvContent),
    csvParsed,
    accountText,
    accountHash: sha256(await fs.readFile(accountStatementPath)),
    accountStatement,
    taxText,
    taxHash: sha256(await fs.readFile(taxReportPath)),
    taxReport,
  };
}

async function archiveBaselineFiles() {
  await fs.mkdir(archiveDir, { recursive: true });
  const targets = [
    [csvPath, `${baselineDate}_TradeRepublic_TransactionExport.csv`],
    [accountStatementPath, `${baselineDate}_TradeRepublic_AccountStatement.pdf`],
    [taxReportPath, `${baselineDate}_TradeRepublic_TaxReport2025.pdf`],
  ];
  const archived = [];
  for (const [sourcePath, targetName] of targets) {
    const target = path.join(archiveDir, targetName);
    await fs.copyFile(sourcePath, target);
    archived.push(target);
  }
  return archived;
}

function baselineDocumentIds() {
  return {
    csv: `traderepublic_baseline_${baselineDate}_transaction_export`,
    account: `traderepublic_baseline_${baselineDate}_account_statement`,
    tax: `traderepublic_baseline_${baselineDate}_tax_report_2025`,
  };
}

function positionIdForIsin(isin) {
  return `traderepublic_${String(isin).toUpperCase()}`;
}

async function deleteSourceDocuments(firestore, collection) {
  const docs = (await firestore.listDocuments(collection)).filter((entry) => entry.source === source);
  for (const doc of docs) await firestore.deleteDocument(collection, doc.id);
  return docs.length;
}

async function markOldDocumentsObsolete(firestore, collection, baselineId, now) {
  const docs = (await firestore.listDocuments(collection)).filter((entry) => entry.source === source);
  let count = 0;
  for (const doc of docs) {
    if (String(doc.id).startsWith(`traderepublic_baseline_${baselineDate}`)) continue;
    await firestore.setDocument(collection, doc.id, {
      ...doc,
      status: "OBSOLETE",
      obsoleteSince: now,
      supersededByBaselineId: baselineId,
      obsoleteReason: "Trade-Republic-Status-Quo per manuellem Baseline-Export neu gesetzt",
    });
    count += 1;
  }
  return count;
}

async function writeBaseline(firestore, baseline, archivedPaths) {
  const now = new Date();
  const ids = baselineDocumentIds();
  const baselineId = `traderepublic_baseline_${baselineDate}`;

  const deleted = {
    sourcePositions: await deleteSourceDocuments(firestore, "sourcePositions"),
    sourceDocumentFacts: await deleteSourceDocuments(firestore, "sourceDocumentFacts"),
    transactions: await deleteSourceDocuments(firestore, "transactions"),
    ledgerEntries: await deleteSourceDocuments(firestore, "ledgerEntries"),
    costEvents: await deleteSourceDocuments(firestore, "costEvents"),
  };

  const obsolete = {
    imports: await markOldDocumentsObsolete(firestore, "imports", baselineId, now),
    rawDocuments: await markOldDocumentsObsolete(firestore, "rawDocuments", baselineId, now),
    sourceDocuments: await markOldDocumentsObsolete(firestore, "sourceDocuments", baselineId, now),
  };

  await firestore.setDocument("sourceDocuments", ids.csv, {
    source,
    documentType: "transaction_export",
    parseStatus: "PARSED",
    filePath: csvPath,
    archivePath: archivedPaths[0] ?? null,
    fileName: path.basename(csvPath),
    fileHash: baseline.csvHash,
    baselineId,
    baselineDate,
    rowCount: baseline.csvParsed.rows.length,
    holdingCount: baseline.csvParsed.holdings.length,
    rawText: baseline.csvText,
    updatedAt: now,
  });
  await firestore.setDocument("sourceDocuments", ids.account, {
    source,
    documentType: "account_statement",
    parseStatus: "PARSED",
    filePath: accountStatementPath,
    archivePath: archivedPaths[1] ?? null,
    fileName: path.basename(accountStatementPath),
    fileHash: baseline.accountHash,
    baselineId,
    baselineDate,
    ...baseline.accountStatement,
    rawText: baseline.accountStatement.rawText,
    updatedAt: now,
  });
  await firestore.setDocument("sourceDocuments", ids.tax, {
    source,
    documentType: "tax_report",
    parseStatus: "PARSED",
    filePath: taxReportPath,
    archivePath: archivedPaths[2] ?? null,
    fileName: path.basename(taxReportPath),
    fileHash: baseline.taxHash,
    baselineId,
    baselineDate,
    ...baseline.taxReport,
    rawText: baseline.taxReport.rawText,
    updatedAt: now,
  });

  for (const row of baseline.csvParsed.rows) {
    const tx = row.parsed;
    const factId = `traderepublic_tx_${sanitizeId(tx.transactionId ?? `${baselineDate}_${tx.rowNumber}`)}`;
    await firestore.setDocument("sourceDocumentFacts", factId, {
      source,
      documentId: ids.csv,
      baselineId,
      factType: tx.factType,
      rowNumber: tx.rowNumber,
      date: tx.datetime ?? tx.date,
      bookingDate: tx.date,
      accountType: tx.accountType,
      tradeRepublicCategory: tx.category,
      tradeRepublicType: tx.type,
      assetClass: tx.assetClass,
      name: tx.name,
      isin: tx.isin,
      quantity: tx.shares,
      price: tx.price,
      amount: tx.amount,
      fee: tx.fee,
      tax: tx.tax,
      currency: tx.currency,
      originalAmount: tx.originalAmount,
      originalCurrency: tx.originalCurrency,
      fxRate: tx.fxRate,
      description: tx.description,
      transactionId: tx.transactionId,
      counterpartyName: tx.counterpartyName,
      counterpartyIban: tx.counterpartyIban,
      paymentReference: tx.paymentReference,
      mccCode: tx.mccCode,
      raw: row.raw,
      updatedAt: now,
    });
    await firestore.setDocument("ledgerEntries", factId, {
      source,
      importId: baselineId,
      date: tx.datetime ?? tx.date,
      bookingText: tx.description ?? tx.type ?? "",
      category: tx.factType,
      isin: tx.isin,
      quantity: tx.shares,
      amount: tx.amount,
      fee: tx.fee,
      tax: tx.tax,
      currency: tx.currency,
      transactionId: tx.transactionId,
      sourceDocumentId: ids.csv,
      updatedAt: now,
      raw: row.raw,
    });
    if (tx.factType === "trade") {
      await firestore.setDocument("transactions", factId, {
        source,
        importId: baselineId,
        date: tx.datetime ?? tx.date,
        bookingText: tx.description ?? tx.type ?? "",
        isin: tx.isin,
        name: tx.name,
        quantity: tx.shares,
        price: tx.price,
        amount: tx.amount,
        fee: tx.fee,
        tax: tx.tax,
        category: "trade",
        side: tx.type,
        currency: tx.currency,
        transactionId: tx.transactionId,
        sourceDocumentId: ids.csv,
        updatedAt: now,
        raw: row.raw,
      });
    }
    if (tx.fee) {
      await firestore.setDocument("costEvents", `${factId}_fee`, {
        source,
        importId: baselineId,
        date: tx.datetime ?? tx.date,
        type: "fee",
        amount: tx.fee,
        currency: tx.currency,
        isin: tx.isin,
        transactionId: tx.transactionId,
        sourceDocumentId: ids.csv,
        updatedAt: now,
      });
    }
    if (tx.tax) {
      await firestore.setDocument("costEvents", `${factId}_tax`, {
        source,
        importId: baselineId,
        date: tx.datetime ?? tx.date,
        type: "tax",
        amount: tx.tax,
        currency: tx.currency,
        isin: tx.isin,
        transactionId: tx.transactionId,
        sourceDocumentId: ids.csv,
        updatedAt: now,
      });
    }
  }

  for (const position of baseline.csvParsed.holdings) {
    const positionId = positionIdForIsin(position.isin);
    await firestore.setDocument("sourceDocumentFacts", `traderepublic_position_${sanitizeId(position.isin)}`, {
      source,
      documentId: ids.csv,
      baselineId,
      factType: "position_snapshot",
      isin: position.isin,
      name: position.name,
      assetClass: position.assetClass,
      quantity: position.quantity,
      costValue: position.costValue,
      avgCostPerShare: position.avgCostPerShare,
      latestTradePrice: position.latestTradePrice,
      latestTradeDate: position.latestTradeDate,
      currentValue: position.currentValue,
      performanceValue: position.performanceValue,
      performancePct: position.performancePct,
      realizedPnL: position.realizedPnL,
      firstTransactionDate: position.firstTransactionDate,
      lastTransactionDate: position.lastTransactionDate,
      updatedAt: now,
    });
    await firestore.setDocument("sourcePositions", positionId, {
      source,
      sourceLabel: "Trade Republic",
      accountType: "Broker",
      accountId: "Broker",
      name: position.name,
      isin: position.isin,
      category: position.assetClass ?? "Wertpapier",
      quantity: position.quantity,
      costValue: position.costValue,
      avgCostPerShare: position.avgCostPerShare,
      currentValue: position.currentValue,
      quotePrice: position.latestTradePrice,
      quoteCurrency: "EUR",
      quotePriceEur: position.latestTradePrice,
      quoteStatus: "BASELINE_LAST_TRANSACTION_PRICE",
      valuationDate: position.latestTradeDate,
      valuationMethod: "traderepublic_baseline_transaction_export_v1",
      performanceValue: position.performanceValue,
      performancePct: position.performancePct,
      realizedPnL: position.realizedPnL,
      firstTransactionDate: position.firstTransactionDate,
      lastTransactionDate: position.lastTransactionDate,
      sourceDocumentId: ids.csv,
      accountValueIncluded: true,
      updatedAt: now,
    });
  }

  const cashValue = baseline.accountStatement.closingBalance ?? 0;
  await firestore.setDocument("sourceDocumentFacts", "traderepublic_cash_account_statement", {
    source,
    documentId: ids.account,
    baselineId,
    factType: "cash_account_statement",
    periodStart: baseline.accountStatement.periodStart,
    periodEnd: baseline.accountStatement.periodEnd,
    openingBalance: baseline.accountStatement.openingBalance,
    paymentIn: baseline.accountStatement.paymentIn,
    paymentOut: baseline.accountStatement.paymentOut,
    closingBalance: baseline.accountStatement.closingBalance,
    iban: baseline.accountStatement.iban,
    bic: baseline.accountStatement.bic,
    updatedAt: now,
  });
  await firestore.setDocument("sourcePositions", "traderepublic_cash", {
    source,
    sourceLabel: "Trade Republic",
    accountType: "Broker",
    accountId: "Broker",
    name: "Cashkonto",
    category: "Cash",
    quantity: 1,
    quantityText: "1 Konto",
    currentValue: cashValue,
    costValue: cashValue,
    currency: "EUR",
    valuationDate: baseline.accountStatement.periodEnd,
    valuationMethod: "traderepublic_account_statement_baseline_v1",
    sourceDocumentId: ids.account,
    accountValueIncluded: true,
    updatedAt: now,
  });
  await firestore.setDocument("sourceDocumentFacts", "traderepublic_tax_report_2025", {
    source,
    documentId: ids.tax,
    baselineId,
    factType: "tax_report",
    taxYear: baseline.taxReport.taxYear,
    depotNumber: baseline.taxReport.depotNumber,
    accountNumber: baseline.taxReport.accountNumber,
    referenceNumber: baseline.taxReport.referenceNumber,
    excessIncomeNotOffset: baseline.taxReport.excessIncomeNotOffset,
    capitalGainsTaxOnExcessIncome: baseline.taxReport.capitalGainsTaxOnExcessIncome,
    updatedAt: now,
  });

  const securityValue = roundCurrency(
    baseline.csvParsed.holdings.reduce((sum, position) => sum + (position.currentValue ?? 0), 0),
  );
  const costValue = roundCurrency(baseline.csvParsed.holdings.reduce((sum, position) => sum + (position.costValue ?? 0), 0));
  const netValue = roundCurrency(securityValue + cashValue);
  const performanceValue = roundCurrency(securityValue - costValue);
  await firestore.setDocument("sourceSummaries", source, {
    source,
    displayName: "Trade Republic",
    currentValue: securityValue,
    depotValue: securityValue,
    cashValue,
    netValue,
    costValue,
    performanceValue,
    performancePct: costValue ? performanceValue / costValue : null,
    positionCount: baseline.csvParsed.holdings.length + 1,
    securityPositionCount: baseline.csvParsed.holdings.length,
    baselineId,
    baselineDate,
    valuationDate: baseline.accountStatement.periodEnd ?? baselineDate,
    valuationMethod: "traderepublic_manual_baseline_2026_06_13_v1",
    updatedAt: now,
  });

  await firestore.setDocument("imports", baselineId, {
    source,
    parser: "traderepublic_manual_baseline_v1",
    status: "IMPORTED",
    baselineDate,
    accountStatementPeriodEnd: baseline.accountStatement.periodEnd,
    csvRowCount: baseline.csvParsed.rows.length,
    positionCount: baseline.csvParsed.holdings.length,
    csvDocumentId: ids.csv,
    accountStatementDocumentId: ids.account,
    taxReportDocumentId: ids.tax,
    archivedPaths,
    deleted,
    obsolete,
    updatedAt: now,
  });

  const existingMailStatus = (await firestore.listDocuments("agentStatus")).find((entry) => entry.id === "traderepublic_mail") ?? {};
  await firestore.setDocument("agentStatus", "traderepublic_mail", {
    ...existingMailStatus,
    source,
    status: "OK",
    message: `Trade-Republic-Mail-Agent wartet auf neue Abrechnungen nach Baseline ${baselineDate}`,
    reconciliationCutoffDate: baselineDate,
    baselineId,
    baselinePolicy: "Mail-Duplikate bis inklusive Baseline-Datum werden nicht mehr auf Positionen angewendet",
    updatedAt: now,
  });
  await firestore.setDocument("agentStatus", "traderepublic_baseline", {
    source,
    status: "OK",
    message: `${baseline.csvParsed.rows.length} Transaktionen, ${baseline.csvParsed.holdings.length} Positionen und Cash ${cashValue} EUR als neuer Status-Quo geschrieben`,
    baselineId,
    baselineDate,
    accountStatementPeriodEnd: baseline.accountStatement.periodEnd,
    csvRowCount: baseline.csvParsed.rows.length,
    positionCount: baseline.csvParsed.holdings.length + 1,
    factCount: baseline.csvParsed.rows.length + baseline.csvParsed.holdings.length + 2,
    updatedAt: now,
    lastSuccessAt: now,
  });

  return { deleted, obsolete };
}

async function runQuoteSync() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  await execFileAsync("npm", ["run", "sync:quotes", "--", "--max-instruments=0"], {
    cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."),
    maxBuffer: 1024 * 1024 * 8,
  });
}

const baseline = await readBaselineDocuments();
const summaryBeforeWrite = {
  mode: writeEnabled ? "write" : "dry-run",
  baselineDate,
  files: { csvPath, accountStatementPath, taxReportPath },
  transactionRows: baseline.csvParsed.rows.length,
  holdings: baseline.csvParsed.holdings.map((position) => ({
    isin: position.isin,
    name: position.name,
    quantity: position.quantity,
    costValue: position.costValue,
    latestTradePrice: position.latestTradePrice,
    currentValue: position.currentValue,
  })),
  cash: {
    periodStart: baseline.accountStatement.periodStart,
    periodEnd: baseline.accountStatement.periodEnd,
    closingBalance: baseline.accountStatement.closingBalance,
  },
  tax: {
    taxYear: baseline.taxReport.taxYear,
    excessIncomeNotOffset: baseline.taxReport.excessIncomeNotOffset,
    capitalGainsTaxOnExcessIncome: baseline.taxReport.capitalGainsTaxOnExcessIncome,
  },
};

if (writeEnabled) {
  const archivedPaths = await archiveBaselineFiles();
  const firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  const writeResult = await writeBaseline(firestore, baseline, archivedPaths);
  if (quoteSyncEnabled) await runQuoteSync().catch((error) => console.warn(`[warn] quote sync failed: ${error.message}`));
  console.log(JSON.stringify({ ...summaryBeforeWrite, archivedPaths, ...writeResult }, null, 2));
} else {
  console.log(JSON.stringify(summaryBeforeWrite, null, 2));
  console.log("[dry-run] Firestore wurde nicht geaendert. Fuer Schreiben --write verwenden.");
}
