import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { ensureGinmonLogin, launchGinmonBrowser } from "./ginmon-browser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeFirestore = process.argv.includes("--write");
const writeDocumentsOnly = process.argv.includes("--write-documents-only");
const reconcileAfterDownload = writeFirestore || writeDocumentsOnly || process.argv.includes("--reconcile");
const forceReconcile = process.argv.includes("--force-reconcile") || process.argv.includes("--reconcile");
const verbose = process.argv.includes("--verbose");
const pageLimit = Number.parseInt(readArg("--page-limit") ?? "100", 10);
const maxDocuments = Number.parseInt(readArg("--max-documents") ?? "0", 10);
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
const targetDirectory = path.join(driveRoot, "01_Originale", "Ginmon", "Reports");
const ginmonSearchDirectories = [
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

function sanitize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function fileNameForDocument(document) {
  const linkName = decodeURIComponent(new URL(document.link).pathname.split("/").pop() ?? "document.pdf");
  const date = document.publishDate ?? document.relevanceDate ?? "unknown-date";
  return [
    date,
    "Ginmon",
    sanitize(document.category),
    `customer-${document.customerId ?? "unknown"}`,
    `doc-${document.id}`,
    sanitize(linkName),
  ].join("_");
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => String(left).localeCompare(String(right))));
}

function compactDownloadSummary(summary) {
  const downloaded = summary.results.filter((result) => result.status === "downloaded");
  const skipped = summary.results.filter((result) => result.status === "skipped");
  return {
    totalCount: summary.totalCount,
    seen: summary.seen,
    downloaded: summary.downloaded,
    skipped: summary.skipped,
    byStatus: countBy(summary.results, (result) => result.status),
    byCategory: countBy(summary.results, (result) => result.category),
    byCustomerId: countBy(summary.results, (result) => result.customerId),
    downloadedSample: downloaded.slice(0, 10).map((result) => ({
      id: result.id,
      category: result.category,
      customerId: result.customerId,
      publishDate: result.publishDate,
      targetPath: result.targetPath,
    })),
    skippedSample: skipped.slice(0, 10),
  };
}

async function findExistingDocumentIds(directory) {
  const ids = new Set();
  async function walk(current) {
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) return walk(entryPath);
        const match = entry.name.match(/_doc-([0-9]+)_/);
        if (match) ids.add(match[1]);
      }),
    );
  }
  await walk(directory);
  return ids;
}

async function findExistingDocumentIdsEverywhere() {
  const sets = await Promise.all(ginmonSearchDirectories.map(findExistingDocumentIds));
  return new Set(sets.flatMap((set) => [...set]));
}

async function uniqueTargetPath(targetPath) {
  let candidate = targetPath;
  const extension = path.extname(targetPath);
  const base = targetPath.slice(0, -extension.length);
  let index = 2;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = `${base}_${index}${extension}`;
      index += 1;
    } catch (error) {
      if (error?.code === "ENOENT") return candidate;
      throw error;
    }
  }
}

async function captureAuthorization(page) {
  let authorization = null;
  page.on("request", (request) => {
    if (authorization) return;
    if (!request.url().includes("api.ginmon.de/inbox/documents?")) return;
    authorization = request.headers().authorization ?? null;
  });
  await page.goto("https://app.ginmon.de/documents", { waitUntil: "domcontentloaded" });
  const startedAt = Date.now();
  while (!authorization && Date.now() - startedAt < 20000) {
    await page.waitForTimeout(500);
  }
  if (!authorization) throw new Error("Ginmon API Authorization Header nicht gefunden.");
  return authorization;
}

async function fetchJson(url, authorization) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization,
    },
  });
  if (!response.ok) {
    throw new Error(`Ginmon API Fehler ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function downloadFile(url, targetPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download Fehler ${response.status}: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, buffer, { flag: "wx" });
  return buffer.length;
}

async function downloadAllDocuments(authorization) {
  await fs.mkdir(targetDirectory, { recursive: true });
  const existingIds = await findExistingDocumentIdsEverywhere();
  const documents = [];
  let totalCount = Infinity;
  for (let offset = 0; offset < totalCount; offset += pageLimit) {
    const url = new URL("https://api.ginmon.de/inbox/documents");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(pageLimit));
    url.searchParams.set("filter", "all");
    const page = await fetchJson(url, authorization);
    totalCount = page.totalCount ?? page.items?.length ?? 0;
    documents.push(...(page.items ?? []));
    if (maxDocuments > 0 && documents.length >= maxDocuments) break;
    if (!page.items?.length) break;
  }

  const selectedDocuments = maxDocuments > 0 ? documents.slice(0, maxDocuments) : documents;
  const results = [];
  for (const document of selectedDocuments) {
    if (!document.link || !document.id) {
      results.push({ id: document.id ?? null, status: "skipped", reason: "missing-link" });
      continue;
    }
    if (existingIds.has(String(document.id))) {
      results.push({ id: document.id, status: "skipped", reason: "exists" });
      continue;
    }
    const targetPath = await uniqueTargetPath(path.join(targetDirectory, fileNameForDocument(document)));
    const bytes = await downloadFile(document.link, targetPath);
    results.push({
      id: document.id,
      category: document.category,
      customerId: document.customerId,
      publishDate: document.publishDate,
      status: "downloaded",
      bytes,
      targetPath,
    });
  }

  return {
    totalCount,
    seen: selectedDocuments.length,
    downloaded: results.filter((result) => result.status === "downloaded").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    results,
  };
}

function reconcile() {
  const reconcileArgs = [path.join(__dirname, "reconcile-ginmon-local.mjs")];
  if (writeDocumentsOnly) reconcileArgs.push("--write-documents-only");
  else if (writeFirestore) reconcileArgs.push("--write");
  const reconcileResult = spawnSync(process.execPath, reconcileArgs, {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  });
  if (reconcileResult.status !== 0) {
    throw new Error(`Ginmon-Abgleich fehlgeschlagen: Exit ${reconcileResult.status}`);
  }

  if (!writeFirestore || writeDocumentsOnly) return;
  const currentResult = spawnSync(process.execPath, [path.join(__dirname, "sync-ginmon-current-api.mjs"), "--write"], {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  });
  if (currentResult.status !== 0) {
    throw new Error(`Ginmon Live-Abgleich fehlgeschlagen: Exit ${currentResult.status}`);
  }
}

async function ginmonAgentStatus() {
  const firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  return {
    firestore,
    status: (await firestore.listDocuments("agentStatus")).find((document) => document.id === "ginmon_documents"),
  };
}

async function recordNoNewDocuments(downloadSummary) {
  if (!writeFirestore && !writeDocumentsOnly) return;
  const { firestore, status: existing } = await ginmonAgentStatus();
  const now = new Date();
  const { id: _id, ...existingData } = existing ?? {};
  await firestore.setDocument("agentStatus", "ginmon_documents", {
    ...existingData,
    source: "ginmon",
    status: "OK",
    message: `Keine neuen Ginmon-Dokumente gefunden; ${downloadSummary.skipped} bekannte Dokumente uebersprungen`,
    lastAgentRunAt: now,
    updatedAt: now,
    lastDownloadCheckAt: now,
    lastDownloadSeen: downloadSummary.seen,
    lastDownloadSkipped: downloadSummary.skipped,
    lastDownloadNew: downloadSummary.downloaded,
  });
}

const { context, page, headless } = await launchGinmonBrowser();
let downloadSummary;
try {
  await ensureGinmonLogin(page, { allowManual: !headless });
  const authorization = await captureAuthorization(page);
  downloadSummary = await downloadAllDocuments(authorization);
} finally {
  await context.close().catch(() => {});
}

console.log(
  JSON.stringify(
    {
      source: "ginmon",
      targetDirectory,
      ...(verbose ? downloadSummary : compactDownloadSummary(downloadSummary)),
      reconcileAfterDownload,
      writeFirestore,
      writeDocumentsOnly,
    },
    null,
    2,
  ),
);

if (reconcileAfterDownload) {
  const { status: existingStatus } = await ginmonAgentStatus();
  const hasParsedState = typeof existingStatus?.factCount === "number" && existingStatus.factCount > 0;
  if (forceReconcile || downloadSummary.downloaded > 0 || !hasParsedState) {
    reconcile();
  } else {
    await recordNoNewDocuments(downloadSummary);
    console.log("[ok] Keine neuen Ginmon-Dokumente. Reconcile uebersprungen.");
  }
}
