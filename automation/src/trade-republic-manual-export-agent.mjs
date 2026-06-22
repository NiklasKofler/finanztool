import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { extractPdfText } from "./pdf-text.mjs";
import { parseCsv, rowsToObjects } from "./summary-utils.mjs";

const execFileAsync = promisify(execFile);
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const source = "traderepublic";
const writeEnabled = process.argv.includes("--write");
const saveMailEnabled = !process.argv.includes("--no-mail");
const firestoreEnabled = !process.argv.includes("--no-firestore");
const quoteSyncEnabled = writeEnabled && !process.argv.includes("--no-quotes");
const forceReapply = process.argv.includes("--force-reapply");
const manualMailFrom = process.env.TR_MANUAL_EXPORT_FROM ?? "niklas.kofler@gmail.com";
const manualMailLookbackDays = Number.parseInt(process.env.TR_MANUAL_EXPORT_LOOKBACK_DAYS ?? "14", 10);
const manualMailTimeoutMs = Number.parseInt(process.env.TR_MANUAL_EXPORT_MAIL_TIMEOUT_MS ?? "30000", 10);
const mailAccountFilter = process.env.TR_MAIL_ACCOUNT ?? "";

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

const inboxDir = path.join(driveRoot, "00_Inbox", "TradeRepublic", "ManualExports");
const originalDir = path.join(driveRoot, "01_Originale", "TradeRepublic", "ManualExports");
const textDir = path.join(driveRoot, "02_Archiviert", "TradeRepublic", "ManualExports", "Text");

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sanitizeId(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sanitizeFileName(value) {
  return sanitizeId(value).slice(0, 180) || "document";
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function clean(value) {
  const result = String(value ?? "").trim();
  return result || null;
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

function detectDelimiter(firstLine) {
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons >= commas ? ";" : ",";
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
  const rows = rowsToObjects(parseCsv(csvText, delimiter)).map((row, index) => ({
    raw: row,
    parsed: {
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
    },
  }));

  return [...rows].sort((left, right) =>
    String(left.parsed.datetime ?? left.parsed.date ?? "").localeCompare(
      String(right.parsed.datetime ?? right.parsed.date ?? ""),
    ),
  );
}

function buildHoldings(rows) {
  const byIsin = new Map();
  const latestTradeByIsin = new Map();

  for (const row of rows) {
    const tx = row.parsed;
    if (!tx.isin || !tx.type) continue;
    const type = String(tx.type).toUpperCase();
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
  const direct = String(value ?? "").match(/(\d{2})\.(\d{2})\.(20\d{2})/);
  if (direct) return `${direct[3]}-${direct[2]}-${direct[1]}`;

  const match = String(value ?? "").match(/(\d{1,2})\.?\s+([A-Za-zÄÖÜäöüß]+)\.?\s+(20\d{2})/);
  if (!match) return null;
  const monthKey = match[2].toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const month = monthMap.get(monthKey) ?? monthMap.get(match[2].toLowerCase());
  if (!month) return null;
  return `${match[3]}-${month}-${String(match[1]).padStart(2, "0")}`;
}

function normalizeText(text) {
  return String(text ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseAccountStatementText(text) {
  const normalized = normalizeText(text);
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
    rawText: normalized.slice(0, 12000),
  };
}

function parseTaxReportText(text) {
  const normalized = normalizeText(text);
  const year =
    normalized.match(/Steuerbescheinigung\s+f[üu]r\s+das\s+Jahr\s+(20\d{2})/i)?.[1] ??
    normalized.match(/Tax Report\s+(20\d{2})/i)?.[1] ??
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
    rawText: normalized.slice(0, 12000),
  };
}

function parseNetWorthText(text) {
  const normalized = normalizeText(text);
  const brokerageValue = parseGermanNumber(normalized.match(/\bBrokerage\s+([-\d\s.,]+?)\s+Private Markets/i)?.[1]);
  const privateMarketsValue = parseGermanNumber(normalized.match(/\bPrivate Markets\s+([-\d\s.,]+?)\s+Cash/i)?.[1]);
  const cashValue = parseGermanNumber(normalized.match(/\bCash\s+([-\d\s.,]+?)\s+GESAMT/i)?.[1]);
  const totalValue = parseGermanNumber(normalized.match(/\bGESAMT\s+([-\d\s.,]+?)\s*EUR/i)?.[1]);
  const snapshotDate =
    parseAustrianDate(normalized.match(/(?:Datum|Date)\s+(\d{2}\.\d{2}\.20\d{2})/i)?.[1]) ??
    parseAustrianDate(normalized.match(/\bzum\s+(\d{2}\.\d{2}\.20\d{2})/i)?.[1]) ??
    parseAustrianDate(normalized.match(/\b(\d{2}\.\d{2}\.20\d{2})\b/)?.[1]);

  const positions = [];
  const lines = String(text ?? "").replace(/\u00a0/g, " ").split(/\r?\n/);
  let currentSection = "Broker";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*PRIVATE MARKETS\s*$/i.test(line)) currentSection = "Private Markets";
    if (/^\s*BROKERAGE\s*$/i.test(line)) currentSection = "Broker";

    const positionMatch = line.match(
      /^\s*([\d .,\u00a0]+)\s+Stk\.\s+(.+?)\s{2,}([\d .,\u00a0]+)\s{2,}([\d .,\u00a0]+)\s*$/,
    );
    if (!positionMatch) continue;

    const blockLines = [line];
    for (let lookAhead = index + 1; lookAhead < Math.min(lines.length, index + 8); lookAhead += 1) {
      const nextLine = lines[lookAhead] ?? "";
      if (/^\s*[\d .,\u00a0]+\s+Stk\./i.test(nextLine) || /ANZAHL POSITIONEN/i.test(nextLine)) break;
      blockLines.push(nextLine);
    }
    const block = blockLines.join(" ");
    const isin = block.match(/ISIN:\s*([A-Z]{2}[A-Z0-9]{10})/i)?.[1]?.toUpperCase() ?? null;
    if (!isin) continue;
    const quoteAsOf = parseAustrianDate(block.match(/\b(\d{2}\.\d{2}\.20\d{2})\b/)?.[1]);
    const quantity = parseGermanNumber(positionMatch[1]);
    const name = positionMatch[2].trim();
    const quotePrice = parseGermanNumber(positionMatch[3]);
    const currentValue = parseGermanNumber(positionMatch[4]);
    const isPrivateMarket = currentSection === "Private Markets" || /private|eltif|markets/i.test(name);
    positions.push({
      isin,
      name,
      quantity,
      quotePrice,
      quoteCurrency: "EUR",
      quotePriceEur: quotePrice,
      quoteAsOf,
      currentValue,
      category: isPrivateMarket ? "Private Markets" : "Wertpapier",
      accountType: isPrivateMarket ? "Private Markets" : "Broker",
      rawText: block.trim(),
    });
  }

  return {
    documentType: "net_worth",
    snapshotDate,
    totalValue,
    brokerageValue,
    privateMarketsValue,
    cashValue,
    positions,
    rawText: normalized.slice(0, 12000),
  };
}

async function ensureDirectories() {
  for (const dir of [inboxDir, originalDir, textDir]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStableFile(filePath) {
  let previousSize = -1;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const stat = await fs.stat(filePath);
    if (stat.size > 0 && stat.size === previousSize) return;
    previousSize = stat.size;
    await sleep(500);
  }
}

async function saveManualMailAttachments() {
  const escapedInbox = inboxDir.replaceAll('"', '\\"');
  const escapedAccount = mailAccountFilter.replaceAll('"', '\\"');
  const escapedFrom = manualMailFrom.replaceAll('"', '\\"');
  const lookbackDays = Number.isFinite(manualMailLookbackDays) && manualMailLookbackDays > 0 ? manualMailLookbackDays : 14;
  const script = `
on sanitizeToken(t)
  set allowedChars to "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
  set outText to ""
  set tText to t as string
  repeat with i from 1 to length of tText
    set c to character i of tText
    if allowedChars contains c then
      set outText to outText & c
    else
      set outText to outText & "_"
    end if
  end repeat
  return outText
end sanitizeToken

tell application "Mail"
  set outputLines to ""
  set cutoffDate to (current date) - (${lookbackDays} * days)
  repeat with acct in accounts
    if "${escapedAccount}" is "" or name of acct contains "${escapedAccount}" then
      try
        set inboxBox to mailbox "INBOX" of acct
        set msgs to messages of inboxBox whose subject is ""
        repeat with msg in msgs
          set subjectText to subject of msg as string
          set senderText to sender of msg as string
          if (date received of msg > cutoffDate) and (subjectText is "" or subjectText is "(No Subject)" or subjectText is "Kein Betreff") and ("${escapedFrom}" is "" or senderText contains "${escapedFrom}") then
            set dateToken to my sanitizeToken(date received of msg as string)
            set msgToken to my sanitizeToken(message id of msg as string)
            repeat with att in mail attachments of msg
              set attName to name of att as string
              if attName ends with ".pdf" or attName ends with ".PDF" or attName ends with ".csv" or attName ends with ".CSV" then
                set targetPath to "${escapedInbox}/" & dateToken & "_" & msgToken & "_" & my sanitizeToken(attName)
                try
                  set fileAlreadyExists to false
                  try
                    do shell script "test -e " & quoted form of targetPath
                    set fileAlreadyExists to true
                  end try
                  if fileAlreadyExists is false then
                    save att in POSIX file targetPath
                  end if
                  set outputLines to outputLines & targetPath & linefeed
                end try
              end if
            end repeat
          end if
        end repeat
      end try
    end if
  end repeat
  return outputLines
end tell
`;
  const { stdout } = await execFileAsync("osascript", ["-e", script], {
    maxBuffer: 1024 * 1024 * 10,
    timeout: Number.isFinite(manualMailTimeoutMs) && manualMailTimeoutMs > 0 ? manualMailTimeoutMs : 30000,
  });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function listImportFiles(directory) {
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listImportFiles(filePath);
      if (!entry.isFile()) return [];
      const ext = path.extname(entry.name).toLowerCase();
      return [".pdf", ".csv"].includes(ext) ? [filePath] : [];
    }),
  );
  return nested.flat().sort();
}

async function archiveOriginal(filePath, documentType, fileHash) {
  const ext = path.extname(filePath).toLowerCase();
  const targetDir = path.join(originalDir, documentType);
  await fs.mkdir(targetDir, { recursive: true });
  const target = path.join(targetDir, `${new Date().toISOString().slice(0, 10)}_${fileHash.slice(0, 16)}_${sanitizeFileName(path.basename(filePath))}`);
  if (!(await pathExists(target))) await fs.copyFile(filePath, target);
  return target;
}

function documentIdFor(documentType, fileHash) {
  return `traderepublic_manual_${documentType}_${fileHash.slice(0, 24)}`;
}

async function readAndClassifyDocument(filePath) {
  await waitForStableFile(filePath);
  const content = await fs.readFile(filePath);
  const fileHash = sha256(content);
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") {
    const csvText = content.toString("utf8");
    const firstLine = csvText.split(/\r?\n/)[0] ?? "";
    if (/transaction_id/i.test(firstLine) && /account_type/i.test(firstLine)) {
      const rows = parseTransactionCsv(csvText);
      const documentType = "transaction_export";
      const archivePath = await archiveOriginal(filePath, documentType, fileHash);
      return {
        filePath,
        fileName: path.basename(filePath),
        fileHash,
        fileType: "csv",
        documentType,
        documentId: documentIdFor(documentType, fileHash),
        parseStatus: rows.length ? "PARSED" : "UNVOLLSTAENDIG",
        archivePath,
        rawText: csvText.slice(0, 12000),
        parsed: { rows },
      };
    }
    const documentType = "unknown_csv";
    const archivePath = await archiveOriginal(filePath, documentType, fileHash);
    return {
      filePath,
      fileName: path.basename(filePath),
      fileHash,
      fileType: "csv",
      documentType,
      documentId: documentIdFor(documentType, fileHash),
      parseStatus: "UNKNOWN",
      archivePath,
      rawText: csvText.slice(0, 12000),
      parsed: {},
    };
  }

  const text = await extractPdfText(filePath);
  const normalized = normalizeText(text);
  let documentType = "unknown_pdf";
  let parsed = {};
  if (/VERM[ÖO]GENS[ÜU]BERSICHT|Net Worth/i.test(normalized) && /Brokerage/i.test(normalized)) {
    documentType = "net_worth";
    parsed = parseNetWorthText(text);
  } else if (/Cashkonto/i.test(normalized) && /\bIBAN\b/i.test(normalized)) {
    documentType = "account_statement";
    parsed = parseAccountStatementText(text);
  } else if (/Tax Report|Steuerbescheinigung/i.test(normalized)) {
    documentType = "tax_report";
    parsed = parseTaxReportText(text);
  }

  const archivePath = await archiveOriginal(filePath, documentType, fileHash);
  const textPath = path.join(textDir, `${fileHash.slice(0, 16)}_${sanitizeFileName(path.basename(filePath, ".pdf"))}.txt`);
  await fs.writeFile(textPath, text);
  const parseStatus =
    documentType === "unknown_pdf"
      ? "UNKNOWN"
      : documentType === "net_worth" && parsed.positions?.length === 0
        ? "UNVOLLSTAENDIG"
        : "PARSED";
  return {
    filePath,
    fileName: path.basename(filePath),
    fileHash,
    fileType: "pdf",
    documentType,
    documentId: documentIdFor(documentType, fileHash),
    parseStatus,
    archivePath,
    textPath,
    rawText: normalized.slice(0, 12000),
    parsed,
  };
}

function documentSortKey(document) {
  if (document.documentType === "transaction_export") {
    const dates = (document.parsed.rows ?? [])
      .map((row) => row.parsed.date ?? row.parsed.datetime)
      .filter(Boolean)
      .sort();
    return dates.at(-1) ?? "0000-00-00";
  }
  if (document.documentType === "account_statement") return document.parsed.periodEnd ?? "0000-00-00";
  if (document.documentType === "net_worth") return document.parsed.snapshotDate ?? "0000-00-00";
  if (document.documentType === "tax_report") return `${document.parsed.taxYear ?? "0000"}-12-31`;
  return "0000-00-00";
}

function factFromFirestoreDocument(fact) {
  return {
    raw: fact.raw ?? {},
    parsed: {
      rowNumber: fact.rowNumber,
      datetime: fact.date,
      date: fact.bookingDate ?? String(fact.date ?? "").slice(0, 10),
      accountType: fact.accountType,
      category: fact.tradeRepublicCategory,
      type: fact.tradeRepublicType,
      assetClass: fact.assetClass,
      name: fact.name,
      isin: fact.isin,
      shares: fact.quantity,
      price: fact.price,
      amount: fact.amount,
      fee: fact.fee,
      tax: fact.tax,
      currency: fact.currency,
      originalAmount: fact.originalAmount,
      originalCurrency: fact.originalCurrency,
      fxRate: fact.fxRate,
      description: fact.description,
      transactionId: fact.transactionId,
      factType: fact.factType,
    },
  };
}

function positionIdForIsin(isin) {
  return `traderepublic_${String(isin).toUpperCase()}`;
}

async function writeTransactionRows(firestore, document, now) {
  const existingFacts = (await firestore.listDocuments("sourceDocumentFacts")).filter(
    (entry) => entry.source === source && String(entry.id).startsWith("traderepublic_tx_"),
  );
  const existingFactIds = new Set(existingFacts.map((entry) => entry.id));
  let newCount = 0;
  let duplicateCount = 0;
  let maxBookingDate = null;

  for (const row of document.parsed.rows) {
    const tx = row.parsed;
    const factId = `traderepublic_tx_${sanitizeId(tx.transactionId ?? `${document.fileHash}_${tx.rowNumber}`)}`;
    if (existingFactIds.has(factId)) duplicateCount += 1;
    else newCount += 1;
    existingFactIds.add(factId);
    if (tx.date && (!maxBookingDate || tx.date > maxBookingDate)) maxBookingDate = tx.date;

    await firestore.setDocument("sourceDocumentFacts", factId, {
      source,
      documentId: document.documentId,
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
      importId: document.documentId,
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
      sourceDocumentId: document.documentId,
      updatedAt: now,
      raw: row.raw,
    });

    if (tx.factType === "trade") {
      await firestore.setDocument("transactions", factId, {
        source,
        importId: document.documentId,
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
        sourceDocumentId: document.documentId,
        updatedAt: now,
        raw: row.raw,
      });
    }

    if (tx.fee) {
      await firestore.setDocument("costEvents", `${factId}_fee`, {
        source,
        importId: document.documentId,
        date: tx.datetime ?? tx.date,
        type: "fee",
        amount: tx.fee,
        currency: tx.currency,
        isin: tx.isin,
        transactionId: tx.transactionId,
        sourceDocumentId: document.documentId,
        updatedAt: now,
      });
    }
    if (tx.tax) {
      await firestore.setDocument("costEvents", `${factId}_tax`, {
        source,
        importId: document.documentId,
        date: tx.datetime ?? tx.date,
        type: "tax",
        amount: tx.tax,
        currency: tx.currency,
        isin: tx.isin,
        transactionId: tx.transactionId,
        sourceDocumentId: document.documentId,
        updatedAt: now,
      });
    }
    if (["interest", "dividend", "bonus"].includes(tx.factType) && typeof tx.amount === "number") {
      await firestore.setDocument("incomeEvents", factId, {
        source,
        importId: document.documentId,
        date: tx.datetime ?? tx.date,
        type: tx.factType,
        amount: tx.amount,
        currency: tx.currency,
        isin: tx.isin,
        name: tx.name,
        transactionId: tx.transactionId,
        sourceDocumentId: document.documentId,
        updatedAt: now,
      });
    }
    if (["fee", "tax"].includes(tx.factType) && typeof tx.amount === "number") {
      await firestore.setDocument("costEvents", factId, {
        source,
        importId: document.documentId,
        date: tx.datetime ?? tx.date,
        type: tx.factType,
        amount: tx.amount,
        currency: tx.currency,
        isin: tx.isin,
        transactionId: tx.transactionId,
        sourceDocumentId: document.documentId,
        updatedAt: now,
      });
    }
  }

  return { newCount, duplicateCount, maxBookingDate };
}

async function rebuildPositionsFromTransactionFacts(firestore, documentId, now) {
  const [facts, existingPositions] = await Promise.all([
    firestore.listDocuments("sourceDocumentFacts"),
    firestore.listDocuments("sourcePositions"),
  ]);
  const transactionFacts = facts
    .filter((entry) => entry.source === source && String(entry.id).startsWith("traderepublic_tx_"))
    .map(factFromFirestoreDocument);
  const holdings = buildHoldings(transactionFacts);
  const activeIsins = new Set(holdings.map((position) => String(position.isin).toUpperCase()));
  const existingById = new Map(existingPositions.filter((position) => position.source === source).map((position) => [position.id, position]));

  for (const position of holdings) {
    const id = positionIdForIsin(position.isin);
    const existing = existingById.get(id) ?? {};
    const quotePriceEur =
      existing.quoteStatus === "OK" && typeof existing.quotePriceEur === "number"
        ? existing.quotePriceEur
        : position.latestTradePrice;
    const currentValue = typeof quotePriceEur === "number" ? roundCurrency(position.quantity * quotePriceEur) : position.currentValue;
    const performanceValue = typeof currentValue === "number" ? roundCurrency(currentValue - position.costValue) : position.performanceValue;
    await firestore.setDocument("sourcePositions", id, {
      ...existing,
      source,
      sourceLabel: "Trade Republic",
      accountType: existing.accountType ?? "Broker",
      accountId: existing.accountId ?? "Broker",
      name: position.name,
      isin: position.isin,
      category: position.assetClass ?? existing.category ?? "Wertpapier",
      quantity: position.quantity,
      costValue: position.costValue,
      avgCostPerShare: position.avgCostPerShare,
      currentValue,
      quotePrice: existing.quoteStatus === "OK" ? existing.quotePrice ?? quotePriceEur : position.latestTradePrice,
      quoteCurrency: existing.quoteCurrency ?? "EUR",
      quotePriceEur,
      quoteStatus: existing.quoteStatus === "OK" ? existing.quoteStatus : "TRANSACTION_LAST_PRICE",
      quoteText:
        existing.quoteStatus === "OK" && existing.quoteText
          ? existing.quoteText
          : typeof position.latestTradePrice === "number"
            ? `${position.latestTradePrice} EUR`
            : existing.quoteText ?? null,
      valuationDate: existing.valuationDate ?? position.latestTradeDate,
      valuationMethod: existing.valuationMethod ?? "traderepublic_transaction_export_v1",
      performanceValue,
      performancePct: position.costValue && typeof performanceValue === "number" ? performanceValue / position.costValue : null,
      realizedPnL: position.realizedPnL,
      firstTransactionDate: position.firstTransactionDate,
      lastTransactionDate: position.lastTransactionDate,
      sourceDocumentId: documentId,
      accountValueIncluded: true,
      updatedAt: now,
    });
  }

  for (const position of existingPositions.filter((entry) => entry.source === source && entry.isin)) {
    const isin = String(position.isin).toUpperCase();
    if (activeIsins.has(isin)) continue;
    if (/private/i.test(String(position.category ?? position.accountType ?? ""))) continue;
    await firestore.setDocument("sourcePositions", position.id, {
      ...position,
      quantity: 0,
      currentValue: 0,
      performanceValue: 0,
      accountValueIncluded: false,
      closeStatus: "closed_by_transaction_export",
      closedAt: now,
      updatedAt: now,
    });
  }

  return holdings;
}

async function applyAccountStatement(firestore, document, now) {
  const account = document.parsed;
  const cashValue = account.closingBalance ?? 0;
  await firestore.setDocument("sourceDocumentFacts", "traderepublic_cash_account_statement", {
    source,
    documentId: document.documentId,
    factType: "cash_account_statement",
    periodStart: account.periodStart,
    periodEnd: account.periodEnd,
    openingBalance: account.openingBalance,
    paymentIn: account.paymentIn,
    paymentOut: account.paymentOut,
    closingBalance: account.closingBalance,
    iban: account.iban,
    bic: account.bic,
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
    valuationDate: account.periodEnd,
    valuationMethod: "traderepublic_account_statement_v1",
    sourceDocumentId: document.documentId,
    accountValueIncluded: true,
    updatedAt: now,
  });
  return { cashValue, periodEnd: account.periodEnd };
}

async function applyNetWorth(firestore, document, now) {
  const parsed = document.parsed;
  const existingPositions = (await firestore.listDocuments("sourcePositions")).filter((position) => position.source === source);
  const existingById = new Map(existingPositions.map((position) => [position.id, position]));
  const changed = [];
  for (const snapshot of parsed.positions ?? []) {
    const id = positionIdForIsin(snapshot.isin);
    const existing = existingById.get(id) ?? {};
    const isPrivateMarket = /private/i.test(snapshot.category ?? snapshot.accountType ?? "");
    const useBrokerValue =
      isPrivateMarket ||
      existing.quoteStatus !== "OK" ||
      typeof existing.currentValue !== "number" ||
      existing.accountValueIncluded === false;
    const quoteDrivenValue =
      typeof existing.quotePriceEur === "number" && typeof snapshot.quantity === "number"
        ? roundCurrency(existing.quotePriceEur * snapshot.quantity)
        : existing.currentValue;
    const currentValue = useBrokerValue ? snapshot.currentValue : quoteDrivenValue;
    const quotePrice = useBrokerValue ? snapshot.quotePrice : existing.quotePrice;
    const quotePriceEur = useBrokerValue ? snapshot.quotePriceEur : existing.quotePriceEur;
    const quoteProvider = useBrokerValue ? "traderepublic_net_worth" : existing.quoteProvider ?? null;
    const performanceValue =
      typeof currentValue === "number" && typeof existing.costValue === "number"
        ? roundCurrency(currentValue - existing.costValue)
        : existing.performanceValue ?? null;

    await firestore.setDocument("sourceDocumentFacts", `traderepublic_broker_snapshot_${sanitizeId(snapshot.isin)}`, {
      source,
      documentId: document.documentId,
      factType: "broker_position_snapshot",
      snapshotDate: parsed.snapshotDate,
      ...snapshot,
      updatedAt: now,
    });
    await firestore.setDocument("sourcePositions", id, {
      ...existing,
      source,
      sourceLabel: "Trade Republic",
      accountType: snapshot.accountType ?? existing.accountType ?? "Broker",
      accountId: snapshot.accountType ?? existing.accountId ?? "Broker",
      name: existing.name ?? snapshot.name,
      isin: snapshot.isin,
      category: existing.category ?? snapshot.category,
      quantity: snapshot.quantity ?? existing.quantity ?? null,
      currentValue,
      quotePrice,
      quoteCurrency: useBrokerValue ? "EUR" : existing.quoteCurrency ?? "EUR",
      quotePriceEur,
      quoteText:
        useBrokerValue && typeof snapshot.quotePrice === "number"
          ? `${snapshot.quotePrice} EUR`
          : existing.quoteText ?? null,
      quoteProvider,
      quoteStatus: useBrokerValue ? "OK" : existing.quoteStatus ?? null,
      quoteAsOf: useBrokerValue ? snapshot.quoteAsOf : existing.quoteAsOf ?? null,
      valuationDate: useBrokerValue ? snapshot.quoteAsOf ?? parsed.snapshotDate : existing.valuationDate ?? null,
      valuationMethod: useBrokerValue ? "traderepublic_net_worth_v1" : existing.valuationMethod ?? null,
      performanceValue,
      performancePct:
        typeof existing.costValue === "number" && existing.costValue && typeof performanceValue === "number"
          ? performanceValue / existing.costValue
          : existing.performancePct ?? null,
      brokerQuotePrice: snapshot.quotePrice,
      brokerQuoteAsOf: snapshot.quoteAsOf,
      brokerCurrentValue: snapshot.currentValue,
      brokerQuoteProvider: "traderepublic_net_worth",
      brokerSnapshotDate: parsed.snapshotDate,
      sourceDocumentId: document.documentId,
      accountValueIncluded: true,
      updatedAt: now,
    });
    changed.push({ isin: snapshot.isin, name: snapshot.name, useBrokerValue });
  }

  await firestore.setDocument("sourceDocumentFacts", "traderepublic_net_worth_snapshot", {
    source,
    documentId: document.documentId,
    factType: "net_worth_snapshot",
    snapshotDate: parsed.snapshotDate,
    totalValue: parsed.totalValue,
    brokerageValue: parsed.brokerageValue,
    privateMarketsValue: parsed.privateMarketsValue,
    cashValue: parsed.cashValue,
    positionCount: parsed.positions?.length ?? 0,
    updatedAt: now,
  });
  if (typeof parsed.cashValue === "number") {
    await firestore.setDocument("sourcePositions", "traderepublic_cash", {
      source,
      sourceLabel: "Trade Republic",
      accountType: "Broker",
      accountId: "Broker",
      name: "Cashkonto",
      category: "Cash",
      quantity: 1,
      quantityText: "1 Konto",
      currentValue: parsed.cashValue,
      costValue: parsed.cashValue,
      currency: "EUR",
      valuationDate: parsed.snapshotDate,
      valuationMethod: "traderepublic_net_worth_cash_v1",
      sourceDocumentId: document.documentId,
      accountValueIncluded: true,
      updatedAt: now,
    });
  }
  return changed;
}

async function recalculateSummary(firestore, now, context = {}) {
  const [positions, summaries] = await Promise.all([
    firestore.listDocuments("sourcePositions"),
    firestore.listDocuments("sourceSummaries"),
  ]);
  const sourcePositions = positions.filter((position) => position.source === source && position.accountValueIncluded !== false);
  const isCash = (position) => /cash/i.test(String(position.category ?? "")) || /cashkonto/i.test(String(position.name ?? ""));
  const cashValue = roundCurrency(sourcePositions.filter(isCash).reduce((sum, position) => sum + (position.currentValue ?? 0), 0));
  const netValue = roundCurrency(sourcePositions.reduce((sum, position) => sum + (position.currentValue ?? 0), 0));
  const depotValue = roundCurrency(netValue - cashValue);
  const costValue = roundCurrency(
    sourcePositions
      .filter((position) => !isCash(position))
      .reduce((sum, position) => sum + (typeof position.costValue === "number" ? position.costValue : 0), 0),
  );
  const performanceValue = typeof costValue === "number" && costValue > 0 ? roundCurrency(depotValue - costValue) : null;
  const existing = summaries.find((entry) => entry.id === source) ?? {};
  await firestore.setDocument("sourceSummaries", source, {
    ...existing,
    source,
    displayName: "Trade Republic",
    currentValue: depotValue,
    depotValue,
    cashValue,
    netValue,
    costValue,
    performanceValue,
    performancePct: costValue && typeof performanceValue === "number" ? performanceValue / costValue : null,
    positionCount: sourcePositions.length,
    securityPositionCount: sourcePositions.filter((position) => !isCash(position)).length,
    sourceDataUpdatedAt: context.sourceDataUpdatedAt ?? existing.sourceDataUpdatedAt ?? null,
    sourceDataProvider: context.sourceDataProvider ?? existing.sourceDataProvider ?? "traderepublic_manual_exports",
    documentDataUpdatedAt: context.documentDataUpdatedAt ?? existing.documentDataUpdatedAt ?? null,
    documentDataProvider: "traderepublic_manual_exports",
    brokerSnapshotDate: context.brokerSnapshotDate ?? existing.brokerSnapshotDate ?? null,
    brokerSnapshotValue: context.brokerSnapshotValue ?? existing.brokerSnapshotValue ?? null,
    brokerageValue: context.brokerageValue ?? existing.brokerageValue ?? null,
    privateMarketsValue: context.privateMarketsValue ?? existing.privateMarketsValue ?? null,
    brokerCashValue: context.brokerCashValue ?? existing.brokerCashValue ?? null,
    valuationMethod: "traderepublic_manual_exports_plus_quote_sync_v1",
    updatedAt: now,
  });
}

async function writeSourceDocument(firestore, document, now, extra = {}) {
  await firestore.setDocument("sourceDocuments", document.documentId, {
    source,
    documentType: document.documentType,
    parseStatus: document.parseStatus,
    fileType: document.fileType,
    fileName: document.fileName,
    filePath: document.filePath,
    archivePath: document.archivePath,
    textPath: document.textPath ?? null,
    fileHash: document.fileHash,
    rowCount: document.parsed.rows?.length ?? null,
    positionCount: document.parsed.positions?.length ?? null,
    snapshotDate: document.parsed.snapshotDate ?? null,
    periodEnd: document.parsed.periodEnd ?? null,
    taxYear: document.parsed.taxYear ?? null,
    rawText: document.rawText,
    ...extra,
    updatedAt: now,
  });
}

function shouldReapplyKnownDocument(existingDocument, document) {
  if (!existingDocument?.appliedAt) return true;
  if (document.parseStatus !== "PARSED") return false;
  if (existingDocument.parseStatus !== "PARSED") return true;

  if (document.documentType === "net_worth") {
    const nextPositionCount = document.parsed.positions?.length ?? 0;
    const previousPositionCount = typeof existingDocument.positionCount === "number" ? existingDocument.positionCount : 0;
    return nextPositionCount > previousPositionCount;
  }

  if (document.documentType === "transaction_export") {
    const nextRowCount = document.parsed.rows?.length ?? 0;
    const previousRowCount = typeof existingDocument.rowCount === "number" ? existingDocument.rowCount : 0;
    return nextRowCount > previousRowCount;
  }

  if (document.documentType === "account_statement") {
    return Boolean(document.parsed.periodEnd && existingDocument.periodEnd !== document.parsed.periodEnd);
  }

  if (document.documentType === "tax_report") {
    return Boolean(document.parsed.taxYear && existingDocument.taxYear !== document.parsed.taxYear);
  }

  return false;
}

function effectiveParseStatus(existingDocument, document) {
  if (document.parseStatus === "PARSED") return "PARSED";
  if (existingDocument?.parseStatus === "PARSED" && existingDocument?.appliedAt) return "PARSED";
  return document.parseStatus;
}

async function updateReconciliationCutoff(firestore, maxBookingDate, now) {
  if (!maxBookingDate) return;
  const existingStatus = (await firestore.listDocuments("agentStatus")).find((entry) => entry.id === "traderepublic_mail") ?? {};
  const previousCutoff = existingStatus.reconciliationCutoffDate ?? null;
  const nextCutoff = previousCutoff && previousCutoff > maxBookingDate ? previousCutoff : maxBookingDate;
  await firestore.setDocument("agentStatus", "traderepublic_mail", {
    ...existingStatus,
    source,
    reconciliationCutoffDate: nextCutoff,
    baselinePolicy: "Settlement-PDFs bis inklusive letztem Transaction-Export-Datum werden nicht erneut auf Positionen angewendet",
    updatedAt: now,
  });
}

async function runQuoteSync() {
  await execFileAsync("npm", ["--prefix", "automation", "run", "sync:quotes", "--", "--max-instruments=0"], {
    cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".."),
    maxBuffer: 1024 * 1024 * 8,
  });
}

async function main() {
  await ensureDirectories();
  const explicitInbox = readArg("--inbox-dir");
  const scanDir = explicitInbox ?? inboxDir;
  const savedAttachments = saveMailEnabled ? await saveManualMailAttachments() : [];
  const files = await listImportFiles(scanDir);
  const documents = [];
  for (const file of files) {
    documents.push(await readAndClassifyDocument(file));
  }

  const summary = {
    mode: writeEnabled ? "write" : "dry-run",
    savedAttachmentCount: savedAttachments.length,
    fileCount: files.length,
    documentCount: documents.length,
    parsedCount: documents.filter((document) => document.parseStatus === "PARSED").length,
    warningCount: documents.filter((document) => document.parseStatus !== "PARSED").length,
    documents: documents.map((document) => ({
      documentId: document.documentId,
      documentType: document.documentType,
      parseStatus: document.parseStatus,
      fileName: document.fileName,
      rowCount: document.parsed.rows?.length ?? null,
      positionCount: document.parsed.positions?.length ?? null,
      snapshotDate: document.parsed.snapshotDate ?? null,
      periodEnd: document.parsed.periodEnd ?? null,
    })),
  };

  if (writeEnabled && firestoreEnabled) {
    const firestore = new FirestoreRest({
      projectId,
      accessToken: await getFirebaseCliAccessToken(),
    });
    const now = new Date();
    const existingSourceDocuments = await firestore.listDocuments("sourceDocuments");
    const existingSourceDocumentById = new Map(existingSourceDocuments.map((document) => [document.id, document]));
    let transactionStats = { newCount: 0, duplicateCount: 0, maxBookingDate: null };
    let accountStats = null;
    let netWorthStats = null;
    let skippedKnownDocumentCount = 0;
    let reappliedKnownDocumentCount = 0;
    const effectiveDocuments = [];

    for (const document of [...documents].sort((left, right) => documentSortKey(left).localeCompare(documentSortKey(right)))) {
      if (document.documentType === "transaction_export") {
        const documentMaxDate = documentSortKey(document);
        transactionStats = {
          ...transactionStats,
          maxBookingDate: [transactionStats.maxBookingDate, documentMaxDate].filter(Boolean).sort().at(-1) ?? null,
        };
      }
      const existingDocument = existingSourceDocumentById.get(document.documentId);
      const effectiveStatus = effectiveParseStatus(existingDocument, document);
      effectiveDocuments.push({ ...document, effectiveParseStatus: effectiveStatus });
      if (existingDocument?.appliedAt && !forceReapply && !shouldReapplyKnownDocument(existingDocument, document)) {
        skippedKnownDocumentCount += 1;
        continue;
      }
      if (existingDocument?.appliedAt) reappliedKnownDocumentCount += 1;
      await writeSourceDocument(firestore, document, now);
      if (document.parseStatus !== "PARSED") continue;
      if (document.documentType === "transaction_export") {
        const stats = await writeTransactionRows(firestore, document, now);
        transactionStats = {
          newCount: transactionStats.newCount + stats.newCount,
          duplicateCount: transactionStats.duplicateCount + stats.duplicateCount,
          maxBookingDate:
            [transactionStats.maxBookingDate, stats.maxBookingDate].filter(Boolean).sort().at(-1) ?? null,
        };
        await rebuildPositionsFromTransactionFacts(firestore, document.documentId, now);
      }
      if (document.documentType === "account_statement") {
        accountStats = await applyAccountStatement(firestore, document, now);
      }
      if (document.documentType === "net_worth") {
        netWorthStats = {
          changedPositions: await applyNetWorth(firestore, document, now),
          snapshotDate: document.parsed.snapshotDate,
          totalValue: document.parsed.totalValue,
          brokerageValue: document.parsed.brokerageValue,
          privateMarketsValue: document.parsed.privateMarketsValue,
          cashValue: document.parsed.cashValue,
        };
      }
      if (document.documentType === "tax_report") {
        await firestore.setDocument("sourceDocumentFacts", `traderepublic_tax_report_${document.parsed.taxYear ?? document.fileHash.slice(0, 8)}`, {
          source,
          documentId: document.documentId,
          factType: "tax_report",
          taxYear: document.parsed.taxYear,
          depotNumber: document.parsed.depotNumber,
          accountNumber: document.parsed.accountNumber,
          referenceNumber: document.parsed.referenceNumber,
          excessIncomeNotOffset: document.parsed.excessIncomeNotOffset,
          capitalGainsTaxOnExcessIncome: document.parsed.capitalGainsTaxOnExcessIncome,
          updatedAt: now,
        });
      }
      await writeSourceDocument(firestore, document, now, { appliedAt: now });
    }

    await updateReconciliationCutoff(firestore, transactionStats.maxBookingDate, now);
    await recalculateSummary(firestore, now, {
      sourceDataUpdatedAt: transactionStats.maxBookingDate ?? accountStats?.periodEnd ?? netWorthStats?.snapshotDate ?? now,
      sourceDataProvider: "traderepublic_manual_exports",
      documentDataUpdatedAt: netWorthStats?.snapshotDate ?? accountStats?.periodEnd ?? transactionStats.maxBookingDate ?? now,
      brokerSnapshotDate: netWorthStats?.snapshotDate ?? null,
      brokerSnapshotValue: netWorthStats?.totalValue ?? null,
      brokerageValue: netWorthStats?.brokerageValue ?? null,
      privateMarketsValue: netWorthStats?.privateMarketsValue ?? null,
      brokerCashValue: netWorthStats?.cashValue ?? null,
    });

    const status = effectiveDocuments.some((document) => document.effectiveParseStatus === "UNKNOWN" || document.effectiveParseStatus === "UNVOLLSTAENDIG")
      ? "WARNUNG"
      : "OK";
    await firestore.setDocument("agentStatus", "traderepublic_manual_exports", {
      source,
      status,
      message:
        status === "OK"
          ? `${documents.length} selbst gesendete Trade-Republic-Exportdokument(e) geprueft`
          : `${documents.length} Exportdokument(e) geprueft, ${effectiveDocuments.filter((document) => document.effectiveParseStatus !== "PARSED").length} nicht vollstaendig verarbeitet`,
      savedAttachmentCount: savedAttachments.length,
      documentCount: documents.length,
      skippedKnownDocumentCount,
      reappliedKnownDocumentCount,
      parsedCount: effectiveDocuments.filter((document) => document.effectiveParseStatus === "PARSED").length,
      recoveredKnownDocumentCount: effectiveDocuments.filter(
        (document) => document.parseStatus !== "PARSED" && document.effectiveParseStatus === "PARSED",
      ).length,
      unknownDocuments: effectiveDocuments
        .filter((document) => document.effectiveParseStatus !== "PARSED")
        .map((document) => ({
          fileName: document.fileName,
          documentType: document.documentType,
          parseStatus: document.parseStatus,
          effectiveParseStatus: document.effectiveParseStatus,
        })),
      transactionNewCount: transactionStats.newCount,
      transactionDuplicateCount: transactionStats.duplicateCount,
      latestTransactionDate: transactionStats.maxBookingDate,
      lastAgentRunAt: now,
      lastAgentSuccessAt: now,
      updatedAt: now,
    });
  }

  if (quoteSyncEnabled) await runQuoteSync().catch(() => null);

  console.log(JSON.stringify(summary, null, 2));
  if (!writeEnabled) console.log("[dry-run] Firestore wurde nicht geaendert. Fuer Schreiben --write verwenden.");
}

async function writeAgentFailure(error) {
  if (!writeEnabled || !firestoreEnabled) return;
  try {
    const firestore = new FirestoreRest({
      projectId,
      accessToken: await getFirebaseCliAccessToken(),
    });
    const now = new Date();
    await firestore.setDocument("agentStatus", "traderepublic_manual_exports", {
      source,
      status: "FEHLER",
      message: error?.message ?? String(error),
      lastAgentRunAt: now,
      lastErrorAt: now,
      updatedAt: now,
    });
  } catch {
    // Keep the original failure visible in stderr.
  }
}

try {
  await main();
} catch (error) {
  await writeAgentFailure(error);
  throw error;
}
