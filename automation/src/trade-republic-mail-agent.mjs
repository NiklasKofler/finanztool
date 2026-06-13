import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { readLocalSecret } from "./local-secret.mjs";
import { extractPdfText } from "./pdf-text.mjs";

const execFileAsync = promisify(execFile);
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const saveMailEnabled = !process.argv.includes("--no-mail");
const unlockEnabled = !process.argv.includes("--no-unlock");
const firestoreEnabled = !process.argv.includes("--no-firestore");
const quoteSyncEnabled = writeEnabled && !process.argv.includes("--no-quotes");
const mailAccountFilter = process.env.TR_MAIL_ACCOUNT ?? "Niklas.kofler@gmail.com";
const passwordService = "finanztool-traderepublic-pdf-password";
const passwordAccount = process.env.USER ?? "niklaskofler";
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

const source = "traderepublic";
const inboxDir = path.join(driveRoot, "00_Inbox", "TradeRepublic", "MailAttachments");
const encryptedDir = path.join(driveRoot, "01_Originale", "TradeRepublic", "Abrechnungen", "Verschluesselt");
const unlockedDir = path.join(driveRoot, "02_Archiviert", "TradeRepublic", "Abrechnungen", "Entsperrt");
const textDir = path.join(driveRoot, "02_Archiviert", "TradeRepublic", "Abrechnungen", "Text");

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sanitizeFileName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isoDateFromGerman(value) {
  const match = String(value ?? "").match(/(\d{2})\.(\d{2})\.(20\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function ensureDirectories() {
  await Promise.all([inboxDir, encryptedDir, unlockedDir, textDir].map((dir) => fs.mkdir(dir, { recursive: true })));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parsePasswordFromMailBody(body) {
  const normalized = String(body ?? "").replace(/\s+/g, " ");
  const explicit =
    normalized.match(/password[^A-Za-z0-9#@$%&*!?^+=._-]{0,40}([A-Za-z0-9#@$%&*!?^+=._-]{12,})/i)?.[1] ??
    normalized.match(/passwort[^A-Za-z0-9#@$%&*!?^+=._-]{0,40}([A-Za-z0-9#@$%&*!?^+=._-]{12,})/i)?.[1];
  if (explicit) return explicit;

  const candidates = normalized.match(/[A-Za-z0-9#@$%&*!?^+=._-]{12,}/g) ?? [];
  return candidates.find((candidate) => /[A-Z]/.test(candidate) && /[a-z]/.test(candidate) && /\d/.test(candidate)) ?? null;
}

async function writeKeychainPassword(password) {
  await execFileAsync("security", [
    "add-generic-password",
    "-U",
    "-a",
    passwordAccount,
    "-s",
    passwordService,
    "-w",
    password,
  ]);
}

async function updatePasswordFromMail() {
  const script = `
on cleanBody(t)
  set AppleScript's text item delimiters to return
  set parts to text items of t
  set AppleScript's text item delimiters to " "
  set t2 to parts as text
  set AppleScript's text item delimiters to linefeed
  set parts2 to text items of t2
  set AppleScript's text item delimiters to " "
  set t3 to parts2 as text
  set AppleScript's text item delimiters to ""
  return t3
end cleanBody

tell application "Mail"
  set newestDate to missing value
  set newestBody to ""
  repeat with acct in accounts
    if "${mailAccountFilter}" is "" or name of acct contains "${mailAccountFilter}" then
      try
        set inboxBox to mailbox "INBOX" of acct
        set msgs to messages of inboxBox whose subject contains "Password for duplicates"
        repeat with msg in msgs
          if newestDate is missing value or date received of msg > newestDate then
            set newestDate to date received of msg
            set newestBody to my cleanBody(content of msg)
          end if
        end repeat
      end try
    end if
  end repeat
  return newestBody
end tell
`;
  const { stdout } = await execFileAsync("osascript", ["-e", script], { maxBuffer: 1024 * 1024 });
  const password = parsePasswordFromMailBody(stdout);
  if (!password) return { updated: false, reason: "NO_PASSWORD_MAIL_VALUE" };
  await writeKeychainPassword(password);
  return { updated: true };
}

async function getPdfPassword() {
  const fromMail = await updatePasswordFromMail().catch((error) => ({ updated: false, reason: error.message }));
  const password = await readLocalSecret("TR_PDF_PASSWORD", passwordService);
  return { password, passwordMailStatus: fromMail };
}

async function saveMailAttachments() {
  const script = `
on dateTokenFromSubject(theSubject)
  set oldDelimiters to AppleScript's text item delimiters
  try
    set AppleScript's text item delimiters to " of "
    set chunks to text items of theSubject
    set dateText to item -1 of chunks
    set AppleScript's text item delimiters to "."
    set dateParts to text items of dateText
    if (count of dateParts) ≥ 3 then
      set dayText to item 1 of dateParts
      set monthText to item 2 of dateParts
      set yearText to item 3 of dateParts
      set AppleScript's text item delimiters to oldDelimiters
      return yearText & "-" & monthText & "-" & dayText
    end if
  end try
  set AppleScript's text item delimiters to oldDelimiters
  return "unknown-date"
end dateTokenFromSubject

tell application "Mail"
  set outputLines to ""
  repeat with acct in accounts
    if "${mailAccountFilter}" is "" or name of acct contains "${mailAccountFilter}" then
      try
        set inboxBox to mailbox "INBOX" of acct
        set msgs to messages of inboxBox whose subject contains "Duplicates customer"
        repeat with msg in msgs
          set dateToken to my dateTokenFromSubject(subject of msg)
          repeat with att in mail attachments of msg
            set attName to name of att
            if attName ends with ".pdf" then
              set targetPath to "${inboxDir.replaceAll('"', '\\"')}/" & dateToken & "_" & attName
              try
                save att in POSIX file targetPath
                set outputLines to outputLines & targetPath & linefeed
              end try
            end if
          end repeat
        end repeat
      end try
    end if
  end repeat
  return outputLines
end tell
`;
  const { stdout } = await execFileAsync("osascript", ["-e", script], { maxBuffer: 1024 * 1024 * 5 });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function listPdfFiles(directory) {
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
      if (entry.isDirectory()) return listPdfFiles(filePath);
      return entry.isFile() && entry.name.toLowerCase().endsWith(".pdf") ? [filePath] : [];
    }),
  );
  return nested.flat();
}

function targetBaseName(filePath) {
  const base = path.basename(filePath);
  const date = isoDateFromGerman(base) ?? base.match(/(20\d{2}-\d{2}-\d{2})/)?.[1] ?? "unknown-date";
  const id = base.match(/([0-9a-f]{8}-[0-9a-f-]{27,})/i)?.[1] ?? crypto.createHash("sha1").update(base).digest("hex").slice(0, 12);
  return sanitizeFileName(`${date}_TradeRepublic_SecuritiesSettlement_${id}`);
}

async function archiveEncryptedPdf(filePath) {
  const content = await fs.readFile(filePath);
  const fileHash = sha256(content);
  const target = path.join(encryptedDir, `${targetBaseName(filePath)}.pdf`);
  if (!(await pathExists(target))) await fs.copyFile(filePath, target);
  return { encryptedPath: target, fileHash };
}

async function unlockPdf(encryptedPath, password) {
  const unlockedPath = path.join(unlockedDir, path.basename(encryptedPath).replace(/\.pdf$/i, "_decrypted.pdf"));
  if (await pathExists(unlockedPath)) return unlockedPath;
  if (!password) throw new Error("Trade-Republic PDF-Passwort fehlt im Schluesselbund.");

  const tempPasswordFile = path.join(os.tmpdir(), `tr_pdf_password_${process.pid}_${Date.now()}`);
  await fs.writeFile(tempPasswordFile, password, { mode: 0o600 });
  try {
    await execFileAsync("qpdf", [`--password-file=${tempPasswordFile}`, "--decrypt", encryptedPath, unlockedPath]);
  } catch (error) {
    // qpdf exits with code 3 for warnings even when it successfully writes the output file.
    if (error?.code !== 3 || !(await pathExists(unlockedPath))) throw error;
  } finally {
    await fs.rm(tempPasswordFile, { force: true });
  }
  return unlockedPath;
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

function parseSettlementNumber(value) {
  const raw = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");
  if (!raw) return null;

  let normalized = raw;
  if (raw.includes(".") && raw.includes(",")) {
    normalized = raw.replace(/,/g, "");
  } else if (raw.includes(",") && !raw.includes(".")) {
    normalized = raw.replace(",", ".");
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}

function roundQuantity(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1_000_000_000) / 1_000_000_000 : value;
}

function parseSettlementText(text, filePath) {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const positionMatch =
    normalized.match(
      /POSITION\s+ANZAHL\s+DURCHSCHNITTSKURS\s+BETRAG\s+(.+?)\s+ISIN:\s*([A-Z]{2}[A-Z0-9]{10})\s+([\d,.]+)\s+Stk\.\s+([\d,.]+)\s+EUR\s+([\d,.]+)\s+EUR/i,
    ) ??
    normalized.match(/(.+?)\s+ISIN:\s*([A-Z]{2}[A-Z0-9]{10})\s+([\d,.]+)\s+Stk\.\s+([\d,.]+)\s+EUR\s+([\d,.]+)\s+EUR/i);
  const name = positionMatch?.[1]?.replace(/^.*?BETRAG\s+/i, "").trim() ?? null;
  const isin = positionMatch?.[2] ?? normalized.match(/ISIN:\s*([A-Z]{2}[A-Z0-9]{10})/)?.[1] ?? null;
  const quantity = parseSettlementNumber(positionMatch?.[3]);
  const averagePrice = parseSettlementNumber(positionMatch?.[4]);
  const amount = parseSettlementNumber(positionMatch?.[5]);
  const date =
    isoDateFromGerman(normalized.match(/(?:DATUM|Datum|Ausführungstag|Handelstag)\s*[: ]\s*(\d{2}\.\d{2}\.\d{4})/)?.[1]) ??
    isoDateFromGerman(path.basename(filePath));
  const isSell = /\bVERKAUF\b|\bSELL\b/i.test(normalized);
  const isBuy = /\bKAUF\b|\bBUY\b|SPARPLAN|SPARPLANAUSF[ÜU]HRUNG|SAVINGS PLAN/i.test(normalized);
  const side = isSell ? "SELL" : isBuy ? "BUY" : "UNKNOWN";
  const cashAmount = parseSettlementNumber(normalized.match(/BUCHUNG.+?WERTSTELLUNG\s+BETRAG.+?\d{4}-\d{2}-\d{2}\s+(-?[\d,.]+)\s+EUR/i)?.[1]);
  const documentId = path.basename(filePath).match(/([0-9a-f]{8}-[0-9a-f-]{27,})/i)?.[1] ?? sha256(Buffer.from(normalized)).slice(0, 20);
  const parserStatus =
    isin && side !== "UNKNOWN" && typeof quantity === "number" && typeof amount === "number" && date
      ? "PARSED"
      : isin
        ? "PARSED_PARTIAL"
        : "UNPARSED";

  return {
    source,
    documentId,
    date,
    side,
    isin,
    name,
    quantity,
    averagePrice,
    amount,
    cashAmount,
    currency: "EUR",
    parserStatus,
    sourceDocument: filePath,
    rawText: normalized.slice(0, 6000),
  };
}

function positionIdForIsin(isin) {
  return `traderepublic_${String(isin).toUpperCase()}`;
}

function getAverageCost(position) {
  return typeof position?.quantity === "number" && position.quantity > 0 && typeof position?.costValue === "number"
    ? position.costValue / position.quantity
    : 0;
}

function updatedPositionFromSettlement(existing, settlement, now) {
  const currentQuantity = typeof existing?.quantity === "number" ? existing.quantity : 0;
  const currentCost = typeof existing?.costValue === "number" ? existing.costValue : 0;
  const currentRealized = typeof existing?.realizedPnL === "number" ? existing.realizedPnL : 0;
  const side = settlement.side;
  const settlementQuantity = settlement.quantity ?? 0;
  const settlementAmount = settlement.amount ?? 0;
  const averageCost = getAverageCost(existing);

  let quantity = currentQuantity;
  let costValue = currentCost;
  let realizedPnL = currentRealized;
  if (side === "BUY") {
    quantity += settlementQuantity;
    costValue += settlementAmount;
  } else if (side === "SELL") {
    const removedCost = Math.min(currentQuantity, settlementQuantity) * averageCost;
    quantity = Math.max(0, currentQuantity - settlementQuantity);
    costValue = Math.max(0, currentCost - removedCost);
    realizedPnL += settlementAmount - removedCost;
  }

  const quotePriceEur =
    existing?.quoteStatus === "OK" && typeof existing?.quotePriceEur === "number"
      ? existing.quotePriceEur
      : typeof settlement.averagePrice === "number"
        ? settlement.averagePrice
        : typeof existing?.currentValue === "number" && currentQuantity > 0
          ? existing.currentValue / currentQuantity
          : null;
  const currentValue = typeof quotePriceEur === "number" ? roundCurrency(quantity * quotePriceEur) : existing?.currentValue ?? null;
  const performanceValue = typeof currentValue === "number" ? roundCurrency(currentValue - costValue) : existing?.performanceValue ?? null;

  return {
    ...existing,
    source,
    sourceLabel: existing?.sourceLabel ?? "Trade Republic",
    name: existing?.name ?? settlement.name ?? settlement.isin,
    isin: settlement.isin,
    category: existing?.category ?? "ETF / Wertpapier",
    accountType: existing?.accountType ?? "Broker",
    quantity: roundQuantity(quantity),
    costValue: roundCurrency(costValue),
    currentValue,
    quotePrice: existing?.quotePrice ?? quotePriceEur,
    quoteCurrency: existing?.quoteCurrency ?? "EUR",
    quotePriceEur,
    quoteText: typeof quotePriceEur === "number" ? `${quotePriceEur} EUR` : existing?.quoteText ?? null,
    quoteStatus: existing?.quoteStatus ?? "PENDING",
    valuationDate: existing?.valuationDate ?? settlement.date,
    valuationMethod: existing?.valuationMethod ?? "traderepublic_mail_settlement_v1",
    performanceValue,
    performancePct: costValue ? performanceValue / costValue : existing?.performancePct ?? null,
    realizedPnL: roundCurrency(realizedPnL),
    lastTransactionDate: settlement.date,
    lastImportId: `tr_settlement_${settlement.documentId}`,
    updatedAt: now,
  };
}

async function applySettlementPositions(firestore, settlements, now) {
  const positionUpdates = settlements.filter(
    (settlement) =>
      settlement.parserStatus === "PARSED" &&
      settlement.isin &&
      (settlement.side === "BUY" || settlement.side === "SELL") &&
      typeof settlement.quantity === "number" &&
      typeof settlement.amount === "number",
  );
  if (positionUpdates.length === 0) return [];

  const existingPositions = (await firestore.listDocuments("sourcePositions")).filter((position) => position.source === source);
  const positionsByIsin = new Map(existingPositions.filter((position) => position.isin).map((position) => [position.isin, position]));
  const changed = [];

  for (const settlement of positionUpdates) {
    const isin = String(settlement.isin).toUpperCase();
    const existing = positionsByIsin.get(isin) ?? { id: positionIdForIsin(isin) };
    const updated = updatedPositionFromSettlement(existing, { ...settlement, isin }, now);
    const id = existing.id ?? positionIdForIsin(isin);
    await firestore.setDocument("sourcePositions", id, updated);
    positionsByIsin.set(isin, { ...updated, id });
    changed.push({ id, isin, name: updated.name, quantity: updated.quantity, costValue: updated.costValue });
  }

  return changed;
}

async function writeImportResult(firestore, result, now) {
  const importId = `tr_settlement_${result.documentId}`;
  await firestore.setDocument("imports", importId, {
    source,
    parser: "traderepublic_settlement_pdf_v2",
    status: result.parserStatus === "UNPARSED" ? "UNVOLLSTAENDIG" : "IMPORTED",
    filePath: result.sourceDocument,
    fileHash: result.fileHash,
    documentId: result.documentId,
    date: result.date,
    isin: result.isin,
    name: result.name,
    side: result.side,
    quantity: result.quantity,
    averagePrice: result.averagePrice,
    amount: result.amount,
    cashAmount: result.cashAmount,
    updatedAt: now,
  });
  await firestore.setDocument("rawDocuments", importId, {
    source,
    importId,
    fileType: "pdf",
    parserVersion: "traderepublic_settlement_pdf_v2",
    sourceDocument: result.sourceDocument,
    textDocument: result.textPath,
    fileHash: result.fileHash,
    parsed: {
      date: result.date,
      side: result.side,
      isin: result.isin,
      name: result.name,
      quantity: result.quantity,
      averagePrice: result.averagePrice,
      amount: result.amount,
      cashAmount: result.cashAmount,
      parserStatus: result.parserStatus,
    },
    updatedAt: now,
  });
  if (result.parserStatus !== "UNPARSED") {
    await firestore.setDocument("ledgerEntries", importId, {
      source,
      importId,
      date: result.date,
      bookingText: `${result.side} ${result.name ?? result.isin ?? ""}`.trim(),
      category: "trade",
      isin: result.isin,
      quantity: result.quantity,
      amount: result.amount,
      cashAmount: result.cashAmount,
      currency: "EUR",
      transactionId: result.documentId,
      sourceDocument: result.sourceDocument,
      updatedAt: now,
    });
  }
}

async function main() {
  await ensureDirectories();
  const savedAttachments = saveMailEnabled ? await saveMailAttachments() : [];
  const { password, passwordMailStatus } = unlockEnabled
    ? await getPdfPassword()
    : { password: null, passwordMailStatus: { updated: false, reason: "DISABLED" } };

  const inboxPdfs = await listPdfFiles(inboxDir);
  const results = [];
  for (const filePath of inboxPdfs) {
    const { encryptedPath, fileHash } = await archiveEncryptedPdf(filePath);
    const unlockedPath = unlockEnabled ? await unlockPdf(encryptedPath, password) : encryptedPath;
    const text = await extractPdfText(unlockedPath);
    const textPath = path.join(textDir, `${path.basename(unlockedPath, ".pdf")}.txt`);
    await fs.writeFile(textPath, text);
    const parsed = parseSettlementText(text, unlockedPath);
    results.push({ ...parsed, fileHash, encryptedPath, unlockedPath, textPath });
  }

  if (writeEnabled && firestoreEnabled) {
    const firestore = new FirestoreRest({
      projectId,
      accessToken: await getFirebaseCliAccessToken(),
    });
    const now = new Date();
    const [existingImports, existingStatuses] = await Promise.all([
      firestore.listDocuments("imports"),
      firestore.listDocuments("agentStatus"),
    ]);
    const existingImportIds = new Set(existingImports.map((entry) => entry.id));
    const status = existingStatuses.find((entry) => entry.id === "traderepublic_mail");
    const reconciliationCutoffDate = status?.reconciliationCutoffDate ?? null;
    const newResults = results.filter((result) => !existingImportIds.has(`tr_settlement_${result.documentId}`));
    const newApplicableResults = reconciliationCutoffDate
      ? newResults.filter((result) => result.date && result.date > reconciliationCutoffDate)
      : newResults;
    const skippedByReconciliation = newResults.length - newApplicableResults.length;
    for (const result of results) await writeImportResult(firestore, result, now);
    const changedPositions = await applySettlementPositions(firestore, newApplicableResults, now);
    await firestore.setDocument("agentStatus", "traderepublic_mail", {
      ...status,
      source,
      status: results.some((result) => result.parserStatus === "UNPARSED") ? "UNVOLLSTAENDIG" : "OK",
      message: `${results.length} Trade-Republic-Abrechnungs-PDFs verarbeitet, ${newApplicableResults.length} neu auf Positionen angewendet`,
      savedAttachmentCount: savedAttachments.length,
      parsedCount: results.filter((result) => result.parserStatus !== "UNPARSED").length,
      unparsedCount: results.filter((result) => result.parserStatus === "UNPARSED").length,
      newImportCount: newResults.length,
      skippedByReconciliationCount: skippedByReconciliation,
      changedPositionCount: changedPositions.length,
      changedPositions,
      lastSuccessAt: now,
      updatedAt: now,
    });
  }

  if (quoteSyncEnabled) {
    await execFileAsync("npm", ["--prefix", "automation", "run", "sync:quotes", "--", "--max-instruments=0"], {
      cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".."),
    }).catch(() => null);
  }

  const summary = {
    mode: writeEnabled ? "write" : "dry-run",
    savedAttachmentCount: savedAttachments.length,
    inboxPdfCount: inboxPdfs.length,
    processedPdfCount: results.length,
    passwordMailStatus,
    parsedCount: results.filter((result) => result.parserStatus !== "UNPARSED").length,
    unparsedCount: results.filter((result) => result.parserStatus === "UNPARSED").length,
    results: results.map((result) => ({
      documentId: result.documentId,
      date: result.date,
      side: result.side,
      isin: result.isin,
      name: result.name,
      quantity: result.quantity,
      averagePrice: result.averagePrice,
      amount: result.amount,
      cashAmount: result.cashAmount,
      parserStatus: result.parserStatus,
      encryptedPath: result.encryptedPath,
      unlockedPath: result.unlockedPath,
      textPath: result.textPath,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!writeEnabled) console.log("[dry-run] Firestore wurde nicht geaendert. Fuer Schreiben --write verwenden.");
}

await main();
