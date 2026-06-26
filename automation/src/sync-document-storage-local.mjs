import "dotenv/config";
import admin from "firebase-admin";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const writeEnabled = args.includes("--write");
const forceUpload = args.includes("--force");

function argValue(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

const sourceFilter = argValue("--source");
const limit = Number.parseInt(argValue("--limit") ?? "0", 10);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? "finanzperformance-tool.firebasestorage.app";
const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
  path.join(repoRoot, "secrets", "firebase-service-account.json");

const allowedRoots = [
  path.join(
    os.homedir(),
    "Library",
    "CloudStorage",
    "GoogleDrive-niklas.kofler@gmail.com",
    "My Drive",
    "Depot",
  ),
  path.join(os.homedir(), "Downloads"),
  path.join(os.homedir(), "Library", "Mobile Documents"),
].map((root) => path.resolve(root));

const contentTypes = new Map([
  [".pdf", "application/pdf"],
  [".csv", "text/csv; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

function isPathAllowed(filePath) {
  const resolved = path.resolve(filePath);
  return allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
}

function sanitizePathSegment(value) {
  return String(value ?? "unknown")
    .normalize("NFKD")
    .replace(/[^\w .()ÄÖÜäöüß-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160) || "document";
}

function contentTypeFor(filePath) {
  return contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId,
  storageBucket,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();
const snapshot = await db.collection("sourceDocuments").get();

const stats = {
  writeEnabled,
  forceUpload,
  sourceFilter: sourceFilter ?? null,
  scanned: 0,
  eligible: 0,
  skippedExistingStorage: 0,
  skippedMissingPath: 0,
  skippedOutsideAllowedRoots: 0,
  skippedMissingFile: 0,
  uploaded: 0,
  ensuredDownloadTokens: 0,
  wouldUpload: 0,
  errors: [],
};

async function ensureDownloadToken(file) {
  const [metadata] = await file.getMetadata();
  const customMetadata = metadata.metadata ?? {};
  if (customMetadata.firebaseStorageDownloadTokens) return false;
  await file.setMetadata({
    metadata: {
      ...customMetadata,
      firebaseStorageDownloadTokens: crypto.randomUUID(),
    },
  });
  return true;
}

for (const docSnapshot of snapshot.docs) {
  if (limit > 0 && stats.eligible >= limit) break;
  const document = docSnapshot.data();
  stats.scanned += 1;

  if (sourceFilter && document.source !== sourceFilter) continue;
  if (document.storagePath && !forceUpload) {
    stats.skippedExistingStorage += 1;
    if (writeEnabled) {
      try {
        const file = bucket.file(document.storagePath);
        const tokenAdded = await ensureDownloadToken(file);
        if (tokenAdded) {
          stats.ensuredDownloadTokens += 1;
          await docSnapshot.ref.set(
            {
              storageDownloadTokenStatus: "AVAILABLE",
              storageDownloadTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
      } catch (error) {
        stats.errors.push({ id: docSnapshot.id, storagePath: document.storagePath, error: error.message });
      }
    }
    continue;
  }
  if (!document.filePath) {
    stats.skippedMissingPath += 1;
    continue;
  }
  if (!isPathAllowed(document.filePath)) {
    stats.skippedOutsideAllowedRoots += 1;
    continue;
  }

  let content;
  try {
    content = await fs.readFile(document.filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      stats.skippedMissingFile += 1;
      continue;
    }
    stats.errors.push({ id: docSnapshot.id, filePath: document.filePath, error: error.message });
    continue;
  }

  stats.eligible += 1;
  const fileHash = document.fileHash ?? document.contentHash ?? sha256(content);
  const fileName = sanitizePathSegment(document.fileName ?? path.basename(document.filePath));
  const source = sanitizePathSegment(document.source ?? "unknown");
  const targetPath = document.storagePath ?? `sourceDocuments/${source}/${docSnapshot.id}/${fileName}`;

  if (!writeEnabled) {
    stats.wouldUpload += 1;
    continue;
  }

  try {
    const file = bucket.file(targetPath);
    const [exists] = await file.exists();
    if (!exists || forceUpload) {
      await file.save(content, {
        resumable: false,
        metadata: {
          contentType: contentTypeFor(document.filePath),
          metadata: {
            sourceDocumentId: docSnapshot.id,
            source: document.source ?? "",
            fileHash,
            firebaseStorageDownloadTokens: crypto.randomUUID(),
          },
        },
      });
    }
    await docSnapshot.ref.set(
      {
        storagePath: targetPath,
        storageBucket: bucket.name,
        storageStatus: "UPLOADED",
        storageDownloadTokenStatus: "AVAILABLE",
        storageUploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        fileHash,
      },
      { merge: true },
    );
    stats.uploaded += 1;
  } catch (error) {
    stats.errors.push({ id: docSnapshot.id, filePath: document.filePath, error: error.message });
  }
}

console.log(JSON.stringify(stats, null, 2));
