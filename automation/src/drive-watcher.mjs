import "dotenv/config";
import chokidar from "chokidar";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import admin from "firebase-admin";
import { buildPositionMap, parseFlatexCsv } from "./flatex-parser.mjs";
import { parseTradeRepublicCsv } from "./trade-republic-parser.mjs";

const required = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_SERVICE_ACCOUNT_PATH",
  "DEPOT_ROOT",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Fehlende Umgebungsvariable: ${key}`);
  }
}

const depotRoot = process.env.DEPOT_ROOT;
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
try {
  await fs.access(serviceAccountPath);
} catch {
  throw new Error(
    `Firebase Service Account fehlt: ${serviceAccountPath}. ` +
      "Lege dort die JSON-Datei aus Firebase Console > Project settings > Service accounts ab.",
  );
}

const serviceAccountRaw = await fs.readFile(serviceAccountPath, "utf8");
const serviceAccount = JSON.parse(serviceAccountRaw);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();
const processing = new Set();
const processExistingOnStart = process.env.PROCESS_EXISTING_ON_START === "true";
const enableStorageUpload = process.env.ENABLE_STORAGE_UPLOAD === "true";
const exitAfterInitialScan = process.env.EXIT_AFTER_INITIAL_SCAN === "true";
const archiveImportedFiles = process.env.ARCHIVE_IMPORTED_FILES === "true";
const archiveRoot = process.env.ARCHIVE_ROOT || path.join(path.dirname(depotRoot), "02_Archiviert");

async function isStorageAvailable() {
  if (!enableStorageUpload) return false;
  try {
    const [exists] = await bucket.exists();
    return exists;
  } catch {
    return false;
  }
}

const storageAvailable = await isStorageAvailable();

function sourceFromPath(filePath) {
  const normalized = filePath.toLowerCase();
  if (normalized.includes("/flatex/")) return "flatex";
  if (normalized.includes("/traderepublic/")) return "traderepublic";
  if (normalized.includes("/ginmon/")) return "ginmon";
  if (normalized.includes("/intergold/")) return "intergold";
  if (normalized.includes("/bitget/")) return "bitget";
  if (normalized.includes("/equateplus/")) return "equateplus";
  return "unknown";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hashFile(filePath) {
  const content = await fs.readFile(filePath);
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return { content, hash };
}

async function ensureNotDuplicate(fileHash) {
  const importId = `file_${fileHash.slice(0, 24)}`;
  const ref = db.collection("imports").doc(importId);
  const snap = await ref.get();
  return { importId, ref, exists: snap.exists };
}

function explainFirebaseError(error) {
  if (error?.code === 5) {
    return (
      "Firebase meldet NOT_FOUND. Sehr wahrscheinlich ist die Firestore-Datenbank " +
      "im Projekt noch nicht angelegt. Oeffne Firebase Console -> Firestore Database -> " +
      "Datenbank erstellen, danach den Agent neu starten."
    );
  }

  if (error?.code === 7) {
    return (
      "Firebase meldet PERMISSION_DENIED. Pruefe, ob der Service Account Zugriff auf " +
      "Firestore und Storage im Projekt finanzperformance-tool hat."
    );
  }

  return error?.message ?? String(error);
}

async function verifyFirebaseAccess() {
  try {
    await db.collection("imports").limit(1).get();
  } catch (error) {
    throw new Error(explainFirebaseError(error));
  }
}

function sanitizeId(value) {
  return value.replace(/[^\w.-]/g, "_");
}

function chunkText(value, maxLength = 700_000) {
  if (!value) return [];
  const chunks = [];
  for (let offset = 0; offset < value.length; offset += maxLength) {
    chunks.push(value.slice(offset, offset + maxLength));
  }
  return chunks;
}

function classifyLedgerEntry(bookingText, amount) {
  const text = String(bookingText ?? "").toLowerCase();
  if (text.includes("steuer") || text.includes("tax")) return "tax";
  if (text.includes("gebuehr") || text.includes("gebühr") || text.includes("fee")) return "fee";
  if (text.includes("dividend")) return "dividend";
  if (text.includes("zins") || text.includes("interest")) return "interest";
  if (
    text.includes("kauf") ||
    text.includes("verkauf") ||
    text.includes("abrechnung") ||
    text.includes("transaktion")
  ) {
    return "trade";
  }
  if (amount !== null && amount > 0) return "cash_in";
  if (amount !== null && amount < 0) return "cash_out";
  return "other";
}

async function writeRawDocument(importId, payload) {
  await db.collection("rawDocuments").doc(importId).set(
    {
      ...payload,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function writeDocumentTextChunks(importId, text) {
  const chunks = chunkText(text);
  if (!chunks.length) return;
  const batch = db.batch();
  chunks.forEach((chunk, index) => {
    batch.set(
      db.collection("rawDocuments").doc(importId).collection("textChunks").doc(String(index + 1)),
      {
        index: index + 1,
        content: chunk,
      },
      { merge: true },
    );
  });
  await batch.commit();
}

async function writeCsvRows(importId, rows) {
  if (!rows.length) return;
  for (let offset = 0; offset < rows.length; offset += 400) {
    const slice = rows.slice(offset, offset + 400);
    const batch = db.batch();
    slice.forEach((row, index) => {
      const rowNumber = offset + index + 1;
      batch.set(
        db.collection("imports").doc(importId).collection("rawRows").doc(String(rowNumber)),
        {
          rowNumber,
          ...row,
        },
        { merge: true },
      );
    });
    await batch.commit();
  }
}

async function uploadOriginal(source, fileHash, filePath, content) {
  if (!storageAvailable) return { rawStoragePath: null, storageStatus: "SKIPPED" };

  const fileName = path.basename(filePath);
  const targetPath = `raw/${source}/${fileHash}_${fileName}`;
  const file = bucket.file(targetPath);
  await file.save(content, {
    metadata: {
      contentType: fileName.toLowerCase().endsWith(".csv") ? "text/csv" : "application/pdf",
    },
    resumable: false,
  });
  return { rawStoragePath: targetPath, storageStatus: "UPLOADED" };
}

async function archiveImportedFile(filePath, source) {
  if (!archiveImportedFiles) {
    return { archiveStatus: "DISABLED", archivePath: null };
  }
  const relative = path.relative(depotRoot, filePath);
  if (relative.startsWith("..")) {
    return { archiveStatus: "SKIPPED_OUTSIDE_ROOT", archivePath: null };
  }

  const targetPath = path.join(archiveRoot, relative);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  try {
    await fs.rename(filePath, targetPath);
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    await fs.copyFile(filePath, targetPath);
    await fs.unlink(filePath);
  }

  return { archiveStatus: "ARCHIVED", archivePath: targetPath, archiveSource: source };
}

async function processFlatexCsv(importId, source, filePath, fileHash, content, importRef) {
  const parsed = parseFlatexCsv(content);
  const totalAmount = parsed.rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const positions = buildPositionMap(parsed.rows);
  const { rawStoragePath, storageStatus } = await uploadOriginal(source, fileHash, filePath, content);

  await importRef.set({
    source,
    filePath,
    fileName: path.basename(filePath),
    fileHash,
    status: "IMPORTED",
    rawStoragePath,
    storageStatus,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    transactionCount: parsed.rows.length,
    skippedRows: parsed.skippedRows,
    warnings: parsed.warnings,
    totalAmount,
  });

  await writeRawDocument(importId, {
    source,
    importId,
    filePath,
    fileHash,
    fileType: "csv",
    parserVersion: "flatex_csv_v2",
    rowCount: parsed.rows.length,
    skippedRows: parsed.skippedRows,
    warnings: parsed.warnings,
  });

  await writeCsvRows(importId, parsed.rows);

  const batch = db.batch();
  parsed.rows.forEach((row, index) => {
    const category = classifyLedgerEntry(row.bookingText, row.amount);
    const txRef = db.collection("transactions").doc(`${importId}_${index + 1}`);
    batch.set(txRef, {
      source,
      importId,
      date: row.date,
      bookingText: row.bookingText,
      isin: row.isin,
      quantity: row.quantity,
      amount: row.amount,
      category,
      currency: row.currency || "EUR",
      raw: row.raw,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const ledgerRef = db.collection("ledgerEntries").doc(`${importId}_${index + 1}`);
    batch.set(ledgerRef, {
      source,
      importId,
      date: row.date,
      bookingText: row.bookingText,
      category,
      isin: row.isin,
      quantity: row.quantity,
      amount: row.amount,
      currency: row.currency || "EUR",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      raw: row.raw,
    });

    if (category === "tax" || category === "fee") {
      const costRef = db.collection("costEvents").doc(`${importId}_${index + 1}`);
      batch.set(costRef, {
        source,
        importId,
        date: row.date,
        type: category,
        bookingText: row.bookingText,
        amount: row.amount,
        currency: row.currency || "EUR",
        isin: row.isin,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  positions.forEach((position) => {
    const id = sanitizeId(`flatex_${position.key}`);
    const posRef = db.collection("positions").doc(id);
    batch.set(
      posRef,
      {
        source: "flatex",
        isin: position.isin,
        label: position.label,
        quantity: position.quantity,
        currency: position.currency,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  const snapshotRef = db.collection("snapshots").doc(`flatex_${Date.now()}`);
  batch.set(snapshotRef, {
    source: "flatex",
    importId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    totalAmount,
    transactionCount: parsed.rows.length,
    positionCount: positions.length,
  });

  await batch.commit();
}

async function processTradeRepublicCsv(importId, source, filePath, fileHash, content, importRef) {
  const csvText = content.toString("utf8");
  const parsed = parseTradeRepublicCsv(csvText);
  const { rawStoragePath, storageStatus } = await uploadOriginal(source, fileHash, filePath, content);

  await importRef.set({
    source,
    filePath,
    fileName: path.basename(filePath),
    fileHash,
    status: "IMPORTED",
    rawStoragePath,
    storageStatus,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    rowCount: parsed.rows.length,
    holdingCount: parsed.holdings.length,
    warnings: parsed.warnings,
  });

  await writeRawDocument(importId, {
    source,
    importId,
    filePath,
    fileHash,
    fileType: "csv",
    parserVersion: "traderepublic_csv_v1",
    rowCount: parsed.rows.length,
    holdingCount: parsed.holdings.length,
    warnings: parsed.warnings,
  });

  const rawRows = parsed.rows.map((row) => ({
    ...row,
    raw: row,
  }));
  await writeCsvRows(importId, rawRows);

  const batch = db.batch();
  parsed.rows.forEach((row, index) => {
    const entry = row.parsed;
    const category = entry.category || "other";
    const id = `${importId}_${index + 1}`;

    batch.set(
      db.collection("ledgerEntries").doc(id),
      {
        source,
        importId,
        date: entry.datetime,
        bookingText: entry.description ?? entry.type ?? "",
        category,
        symbol: entry.symbol,
        isin: null,
        quantity: entry.shares,
        amount: entry.amount,
        fee: entry.fee,
        tax: entry.tax,
        currency: entry.currency || "EUR",
        transactionId: entry.transactionId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        raw: row,
      },
      { merge: true },
    );

    if (category === "trade") {
      batch.set(
        db.collection("transactions").doc(id),
        {
          source,
          importId,
          date: entry.datetime,
          bookingText: entry.description ?? entry.type ?? "",
          isin: null,
          symbol: entry.symbol,
          quantity: entry.shares,
          amount: entry.amount,
          category,
          currency: entry.currency || "EUR",
          raw: row,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    if ((entry.fee ?? 0) !== 0) {
      batch.set(
        db.collection("costEvents").doc(`${id}_fee`),
        {
          source,
          importId,
          date: entry.datetime,
          type: "fee",
          bookingText: entry.description ?? entry.type ?? "",
          amount: entry.fee,
          currency: entry.currency || "EUR",
          symbol: entry.symbol,
          transactionId: entry.transactionId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    if ((entry.tax ?? 0) !== 0) {
      batch.set(
        db.collection("costEvents").doc(`${id}_tax`),
        {
          source,
          importId,
          date: entry.datetime,
          type: "tax",
          bookingText: entry.description ?? entry.type ?? "",
          amount: entry.tax,
          currency: entry.currency || "EUR",
          symbol: entry.symbol,
          transactionId: entry.transactionId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  });

  parsed.holdings.forEach((position) => {
    const posId = sanitizeId(`traderepublic_${position.symbol}`);
    batch.set(
      db.collection("sourcePositions").doc(posId),
      {
        source: "traderepublic",
        symbol: position.symbol,
        label: position.name ?? position.symbol,
        assetClass: position.assetClass ?? null,
        quantity: position.quantity,
        costValue: position.costValue,
        avgCostPerShare: position.avgCostPerShare,
        realizedPnL: position.realizedPnL,
        buyCostTotal: position.buyCostTotal,
        buyQuantityTotal: position.buyQuantityTotal,
        sellProceedsTotal: position.sellProceedsTotal,
        sellQuantityTotal: position.sellQuantityTotal,
        currency: "EUR",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  await batch.commit();
}

async function processGenericDocument(importId, source, filePath, fileHash, content, importRef) {
  const { rawStoragePath, storageStatus } = await uploadOriginal(
    source,
    fileHash,
    filePath,
    content,
  );
  await importRef.set({
    source,
    filePath,
    fileName: path.basename(filePath),
    fileHash,
    status: "STORED",
    rawStoragePath,
    storageStatus,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    fileType: path.extname(filePath).toLowerCase(),
  });

  const fileType = path.extname(filePath).toLowerCase();
  if (fileType === ".pdf") {
    let extractedText = "";
    try {
      const { extractPdfText } = await import("./pdf-text.mjs");
      extractedText = await extractPdfText(filePath);
    } catch (error) {
      extractedText = "";
      console.warn(`[warn] pdf text extraction failed for ${path.basename(filePath)}: ${error.message}`);
    }

    await writeRawDocument(importId, {
      source,
      importId,
      filePath,
      fileHash,
      fileType,
      parserVersion: "raw_pdf_v1",
      extractedTextLength: extractedText.length,
      textChunkCount: chunkText(extractedText).length,
    });
    await writeDocumentTextChunks(importId, extractedText);
    return;
  }

  await writeRawDocument(importId, {
    source,
    importId,
    filePath,
    fileHash,
    fileType,
    parserVersion: "raw_binary_v1",
  });
}

async function handleFile(filePath) {
  if (processing.has(filePath)) return;
  if (!filePath.toLowerCase().endsWith(".csv") && !filePath.toLowerCase().endsWith(".pdf")) return;

  processing.add(filePath);
  try {
    await sleep(1500);
    const source = sourceFromPath(filePath);
    const { content, hash } = await hashFile(filePath);
    const { importId, ref, exists } = await ensureNotDuplicate(hash);

    if (exists) {
      if (source === "traderepublic" && filePath.toLowerCase().endsWith(".csv")) {
        await processTradeRepublicCsv(importId, source, filePath, hash, content, ref);
        const archiveResult = await archiveImportedFile(filePath, source);
        await ref.set(
          {
            archiveStatus: archiveResult.archiveStatus,
            archivePath: archiveResult.archivePath ?? null,
            archivedAt:
              archiveResult.archiveStatus === "ARCHIVED"
                ? admin.firestore.FieldValue.serverTimestamp()
                : null,
          },
          { merge: true },
        );
        console.log(`[ok] trade republic csv refreshed ${path.basename(filePath)} (${importId})`);
        return;
      }
      console.log(`[skip] duplicate ${path.basename(filePath)} (${importId})`);
      const archiveResult = await archiveImportedFile(filePath, source);
      if (archiveResult.archiveStatus === "ARCHIVED") {
        await ref.set(
          {
            archiveStatus: "ARCHIVED",
            archivePath: archiveResult.archivePath,
            archivedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      return;
    }

    if (source === "flatex" && filePath.toLowerCase().endsWith(".csv")) {
      await processFlatexCsv(importId, source, filePath, hash, content, ref);
      const archiveResult = await archiveImportedFile(filePath, source);
      await ref.set(
        {
          archiveStatus: archiveResult.archiveStatus,
          archivePath: archiveResult.archivePath ?? null,
          archivedAt:
            archiveResult.archiveStatus === "ARCHIVED"
              ? admin.firestore.FieldValue.serverTimestamp()
              : null,
        },
        { merge: true },
      );
      console.log(`[ok] flatex csv imported ${path.basename(filePath)} (${importId})`);
      return;
    }

    if (source === "traderepublic" && filePath.toLowerCase().endsWith(".csv")) {
      await processTradeRepublicCsv(importId, source, filePath, hash, content, ref);
      const archiveResult = await archiveImportedFile(filePath, source);
      await ref.set(
        {
          archiveStatus: archiveResult.archiveStatus,
          archivePath: archiveResult.archivePath ?? null,
          archivedAt:
            archiveResult.archiveStatus === "ARCHIVED"
              ? admin.firestore.FieldValue.serverTimestamp()
              : null,
        },
        { merge: true },
      );
      console.log(`[ok] trade republic csv imported ${path.basename(filePath)} (${importId})`);
      return;
    }

    await processGenericDocument(importId, source, filePath, hash, content, ref);
    const archiveResult = await archiveImportedFile(filePath, source);
    await ref.set(
      {
        archiveStatus: archiveResult.archiveStatus,
        archivePath: archiveResult.archivePath ?? null,
        archivedAt:
          archiveResult.archiveStatus === "ARCHIVED"
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,
      },
      { merge: true },
    );
    console.log(`[ok] stored ${path.basename(filePath)} (${source}, ${importId})`);
  } catch (error) {
    console.error(`[error] ${filePath}`);
    console.error(explainFirebaseError(error));
  } finally {
    processing.delete(filePath);
  }
}

async function walkFiles(rootDir) {
  const files = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkFiles(fullPath);
      files.push(...nested);
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function scanExistingFiles() {
  const directories = ["Flatex", "TradeRepublic", "Ginmon", "Intergold", "Bitget", "EquatePlus"];
  for (const dir of directories) {
    const target = path.join(depotRoot, dir);
    try {
      const files = await walkFiles(target);
      for (const fullPath of files) {
        if (fullPath.toLowerCase().endsWith(".csv") || fullPath.toLowerCase().endsWith(".pdf")) {
          await handleFile(fullPath);
        }
      }
    } catch (error) {
      console.warn(`[warn] scan skipped for ${target}`);
      console.warn(error.message);
    }
  }
}

async function main() {
  console.log(`[boot] watching depot root: ${depotRoot}`);
  await verifyFirebaseAccess();
  if (!storageAvailable) {
    console.log("[boot] storage upload disabled or unavailable; originals stay in Drive");
  }

  if (processExistingOnStart) {
    console.log("[boot] scanning existing files because PROCESS_EXISTING_ON_START=true");
    await scanExistingFiles();
    if (exitAfterInitialScan) {
      console.log("[boot] initial scan finished; exiting because EXIT_AFTER_INITIAL_SCAN=true");
      return;
    }
  } else {
    console.log("[boot] existing files are ignored; watching only new or changed files");
  }

  const watcher = chokidar.watch(`${depotRoot}/**/*.{csv,pdf}`, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1800,
      pollInterval: 250,
    },
  });

  watcher.on("add", (filePath) => {
    void handleFile(filePath);
  });
  watcher.on("change", (filePath) => {
    void handleFile(filePath);
  });
  watcher.on("error", (error) => {
    console.error("[watcher-error]", error);
  });
}

await main();
