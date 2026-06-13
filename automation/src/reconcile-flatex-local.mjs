import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildPositionMap, parseFlatexCsv } from "./flatex-parser.mjs";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
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

const sourceDirectories = {
  depot: [
    path.join(driveRoot, "00_Inbox", "Flatex", "Depotumsaetze"),
    path.join(driveRoot, "01_Originale", "Flatex", "Depotumsaetze"),
    path.join(driveRoot, "02_Archiviert", "Flatex", "Depotumsaetze"),
  ],
  cash: [
    path.join(driveRoot, "00_Inbox", "Flatex", "Kontoumsaetze"),
    path.join(driveRoot, "01_Originale", "Flatex", "Kontoumsaetze"),
    path.join(driveRoot, "02_Archiviert", "Flatex", "Kontoumsaetze"),
  ],
};

async function listCsvFiles(directory) {
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
      if (entry.isDirectory()) return listCsvFiles(filePath);
      return entry.isFile() && entry.name.toLowerCase().endsWith(".csv") ? [filePath] : [];
    }),
  );
  return nested.flat();
}

function rowIdentity(row) {
  if (row.transactionId) return `ta:${row.transactionId}`;
  const stable = [
    row.date,
    row.bookingText,
    row.label,
    row.isin,
    row.quantity,
    row.amount,
    row.currency,
  ].join("|");
  return `hash:${crypto.createHash("sha256").update(stable).digest("hex")}`;
}

async function readRows(directories) {
  const files = (await Promise.all(directories.map(listCsvFiles))).flat();
  const rows = [];
  const warnings = [];
  for (const filePath of files) {
    const parsed = parseFlatexCsv(await fs.readFile(filePath));
    rows.push(...parsed.rows);
    warnings.push(...parsed.warnings.map((warning) => `${path.basename(filePath)}: ${warning}`));
  }
  return {
    files,
    rows: [...new Map(rows.map((row) => [rowIdentity(row), row])).values()],
    rawRowCount: rows.length,
    warnings,
  };
}

const [depot, cash] = await Promise.all([
  readRows(sourceDirectories.depot),
  readRows(sourceDirectories.cash),
]);
const positions = buildPositionMap(depot.rows).filter((position) => Math.abs(position.quantity) > 1e-8);
const cashValue = cash.rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
const warnings = [...depot.warnings, ...cash.warnings];
const sourcePositions = [
  ...positions.map((position) => ({
    type: "security",
    id: `flatex_${position.isin ?? crypto.createHash("sha1").update(position.key).digest("hex")}`,
    position,
  })),
  {
    type: "cash",
    id: "flatex_cash_eur",
    position: {
      key: "cash_eur",
      label: "Flatex Kontostand",
      quantity: cashValue,
      currency: "EUR",
    },
  },
];

console.log(
  JSON.stringify(
    {
      mode: writeEnabled ? "write" : "dry-run",
      depot: {
        files: depot.files.length,
        rawRows: depot.rawRowCount,
        uniqueRows: depot.rows.length,
        duplicateRows: depot.rawRowCount - depot.rows.length,
        positionCount: positions.length,
      },
      cash: {
        files: cash.files.length,
        rawRows: cash.rawRowCount,
        uniqueRows: cash.rows.length,
        duplicateRows: cash.rawRowCount - cash.rows.length,
        cashValue,
      },
      warnings,
    },
    null,
    2,
  ),
);

if (!writeEnabled) {
  console.log("[dry-run] Keine Firestore-Daten geaendert. Fuer Schreiben --write verwenden.");
  process.exit(0);
}

const accessToken = await getFirebaseCliAccessToken();
const firestore = new FirestoreRest({ projectId, accessToken });
const now = new Date();
const existingPositions = (await firestore.listDocuments("sourcePositions")).filter(
  (position) => position.source === "flatex",
);
const existingByIsin = new Map(existingPositions.map((position) => [position.isin, position]));
const currentIds = new Set();

for (const entry of sourcePositions) {
  const { id, position } = entry;
  currentIds.add(id);
  if (entry.type === "cash") {
    await firestore.setDocument("sourcePositions", id, {
      source: "flatex",
      name: position.label,
      category: "Cash",
      quantity: 1,
      quantityText: "1 Konto",
      currency: "EUR",
      currentValue: cashValue,
      accountValueIncluded: true,
      valuationMethod: "flatex_cash_transactions_dedup_v1",
      updatedAt: now,
    });
    continue;
  }
  const existing = existingByIsin.get(position.isin) ?? {};
  const { id: _existingId, ...existingData } = existing;
  await firestore.setDocument("sourcePositions", id, {
    ...existingData,
    source: "flatex",
    name: existing.name ?? position.label,
    isin: position.isin,
    category: existing.category ?? "Wertpapier",
    quantity: position.quantity,
    quantityText: `${position.quantity} Stück`,
    quantityMethod: "flatex_depot_transactions_dedup_v1",
    updatedAt: now,
  });
}

for (const existing of existingPositions) {
  if (!currentIds.has(existing.id)) await firestore.deleteDocument("sourcePositions", existing.id);
}

const summary = (await firestore.listDocuments("sourceSummaries")).find(
  (document) => document.id === "flatex",
);
const { id: _summaryId, ...summaryData } = summary ?? {};
const depotValue = Number.parseFloat(String(summary?.currentValue ?? ""));
await firestore.setDocument("sourceSummaries", "flatex", {
  ...summaryData,
  source: "flatex",
  displayName: "Flatex",
  currentValue: Number.isFinite(depotValue) ? depotValue : null,
  cashValue,
  netValue: Number.isFinite(depotValue) ? depotValue + cashValue : null,
  positionCount: sourcePositions.length,
  transactionCount: depot.rows.length,
  cashTransactionCount: cash.rows.length,
  quantityMethod: "flatex_depot_transactions_dedup_v1",
  updatedAt: now,
});

await firestore.setDocument("agentStatus", "flatex", {
  source: "flatex",
  status: warnings.length ? "WARNUNG" : "OK",
  message: warnings.length
    ? `${positions.length} Positionen und ${cash.rows.length} Kontoumsaetze abgeglichen, ${warnings.length} Parser-Warnungen`
    : `${positions.length} Positionen und ${cash.rows.length} Kontoumsaetze abgeglichen`,
  lastSuccessAt: now,
  positionCount: positions.length,
  cashValue,
  warningCount: warnings.length,
  warnings: warnings.slice(0, 20),
});

console.log(`[ok] Flatex-Abgleich geschrieben: ${positions.length} Positionen, Cash ${cashValue} EUR`);
