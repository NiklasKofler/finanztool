import "dotenv/config";
import chokidar from "chokidar";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import admin from "firebase-admin";
import { buildPositionMap, parseFlatexCsv } from "./flatex-parser.mjs";

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

function sourceFromPath(filePath) {
  const normalized = filePath.toLowerCase();
  if (normalized.includes("/flatex/")) return "flatex";
  if (normalized.includes("/traderepublic/")) return "traderepublic";
  if (normalized.includes("/ginmon/")) return "ginmon";
  if (normalized.includes("/intergold/")) return "intergold";
  if (normalized.includes("/bitget/")) return "bitget";
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

function sanitizeId(value) {
  return value.replace(/[^\w.-]/g, "_");
}

async function uploadOriginal(source, fileHash, filePath, content) {
  const fileName = path.basename(filePath);
  const targetPath = `raw/${source}/${fileHash}_${fileName}`;
  const file = bucket.file(targetPath);
  await file.save(content, {
    metadata: {
      contentType: fileName.toLowerCase().endsWith(".csv") ? "text/csv" : "application/pdf",
    },
    resumable: false,
  });
  return targetPath;
}

async function processFlatexCsv(importId, source, filePath, fileHash, content, importRef) {
  const csvText = content.toString("utf8");
  const parsed = parseFlatexCsv(csvText);
  const totalAmount = parsed.rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const positions = buildPositionMap(parsed.rows);
  const rawStoragePath = await uploadOriginal(source, fileHash, filePath, content);

  await importRef.set({
    source,
    filePath,
    fileName: path.basename(filePath),
    fileHash,
    status: "IMPORTED",
    rawStoragePath,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    transactionCount: parsed.rows.length,
    skippedRows: parsed.skippedRows,
    warnings: parsed.warnings,
    totalAmount,
  });

  const batch = db.batch();
  parsed.rows.forEach((row, index) => {
    const txRef = db.collection("transactions").doc(`${importId}_${index + 1}`);
    batch.set(txRef, {
      source,
      importId,
      date: row.date,
      bookingText: row.bookingText,
      isin: row.isin,
      quantity: row.quantity,
      amount: row.amount,
      currency: row.currency || "EUR",
      raw: row.raw,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
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

async function processGenericDocument(importId, source, filePath, fileHash, content, importRef) {
  const rawStoragePath = await uploadOriginal(source, fileHash, filePath, content);
  await importRef.set({
    source,
    filePath,
    fileName: path.basename(filePath),
    fileHash,
    status: "STORED",
    rawStoragePath,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    fileType: path.extname(filePath).toLowerCase(),
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
      console.log(`[skip] duplicate ${path.basename(filePath)} (${importId})`);
      return;
    }

    if (source === "flatex" && filePath.toLowerCase().endsWith(".csv")) {
      await processFlatexCsv(importId, source, filePath, hash, content, ref);
      console.log(`[ok] flatex csv imported ${path.basename(filePath)} (${importId})`);
      return;
    }

    await processGenericDocument(importId, source, filePath, hash, content, ref);
    console.log(`[ok] stored ${path.basename(filePath)} (${source}, ${importId})`);
  } catch (error) {
    console.error(`[error] ${filePath}`);
    console.error(error);
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
  const directories = ["Flatex", "TradeRepublic", "Ginmon", "Intergold", "Bitget"];
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
  await scanExistingFiles();

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
