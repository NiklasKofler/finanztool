import "dotenv/config";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const host = process.env.DOCUMENT_SERVER_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.DOCUMENT_SERVER_PORT ?? "5176", 10);
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
const allowedRoots = [
  path.resolve(driveRoot),
  path.resolve(os.homedir(), "Downloads"),
  path.resolve(os.homedir(), "Library", "Mobile Documents"),
];

let firestore = null;
let documentCache = { loadedAt: 0, byId: new Map() };

function isPathAllowed(filePath) {
  const resolved = path.resolve(filePath);
  return allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".csv") return "text/csv; charset=utf-8";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function attachmentName(document) {
  const name = String(document.fileName ?? path.basename(document.filePath ?? "document.pdf"));
  return name.replace(/[^\w .()ÄÖÜäöüß-]+/g, "_");
}

async function getFirestore() {
  if (firestore) return firestore;
  firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  return firestore;
}

async function getSourceDocument(documentId) {
  const now = Date.now();
  if (now - documentCache.loadedAt > 30_000) {
    const client = await getFirestore();
    const documents = await client.listDocuments("sourceDocuments");
    documentCache = {
      loadedAt: now,
      byId: new Map(documents.map((document) => [document.id, document])),
    };
  }
  return documentCache.byId.get(documentId) ?? null;
}

async function sendDocument(request, response, documentId) {
  const document = await getSourceDocument(documentId);
  if (!document?.filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Dokument oder filePath nicht gefunden.");
    return;
  }

  if (!isPathAllowed(document.filePath)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Dokumentpfad liegt ausserhalb der erlaubten lokalen Depot-Pfade.");
    return;
  }

  const file = await fs.readFile(document.filePath);
  response.writeHead(200, {
    "Content-Type": contentTypeFor(document.filePath),
    "Content-Disposition": `inline; filename=\"${attachmentName(document)}\"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(file);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/health") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ status: "OK", service: "finanztool-document-server" }));
      return;
    }

    const match = url.pathname.match(/^\/documents\/([^/]+)$/);
    if (request.method === "GET" && match) {
      await sendDocument(request, response, decodeURIComponent(match[1]));
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Nicht gefunden.");
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Server error");
  }
});

server.listen(port, host, () => {
  console.log(`Finanztool Dokumentserver läuft auf http://${host}:${port}/`);
});
