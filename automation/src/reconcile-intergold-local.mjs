import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import {
  fetchIntergoldPriceHtml,
  INTERGOLD_PRICE_URL,
  parseIntergoldPricesFromHtml,
} from "./intergold-prices.mjs";
import {
  compactIntergoldId,
  convertMetalValue,
  parseIntergoldConfirmation,
} from "./intergold-parser.mjs";
import { extractPdfText } from "./pdf-text.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const saveSnapshot = writeEnabled || process.argv.includes("--snapshot");
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
  path.join(driveRoot, "00_Inbox", "Intergold"),
  path.join(driveRoot, "01_Originale", "Intergold", "Einlagerungsbestaetigungen"),
  path.join(driveRoot, "02_Archiviert", "Intergold", "Einlagerungsbestaetigungen"),
  path.join(driveRoot, "Intergold", "01_Einlagerungsbestätigung"),
  path.join(driveRoot, "Intergold", "Einlagerungsbestaetigungen"),
];
const snapshotDirectory = path.join(driveRoot, "01_Originale", "Intergold", "PreisSnapshots");

function sum(values) {
  return values.reduce((total, value) => total + (typeof value === "number" ? value : 0), 0);
}

function roundCurrency(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

function stableId(...parts) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 20);
}

function priceHistoryId(price) {
  return compactIntergoldId(
    [
      "intergold",
      price.metal,
      price.priceDate,
      price.unit,
      price.saleEur,
      price.buyEur,
    ].join("_"),
  );
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

async function savePriceSnapshot(html, fetchedAt) {
  if (!saveSnapshot) return null;
  await fs.mkdir(snapshotDirectory, { recursive: true });
  const stamp = fetchedAt.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "_");
  const snapshotPath = path.join(snapshotDirectory, `${stamp}_Intergold_Aktuelles.html`);
  await fs.writeFile(snapshotPath, html, "utf8");
  return snapshotPath;
}

function buildHoldings(confirmations, prices) {
  const priceByMetal = new Map(
    prices.filter((price) => price.status === "OK").map((price) => [price.metal.toLowerCase(), price]),
  );
  const holdingsByMetal = new Map();

  for (const confirmation of confirmations) {
    for (const position of confirmation.positions) {
      const key = position.normalizedMetal.toLowerCase();
      const existing =
        holdingsByMetal.get(key) ?? {
          metal: position.normalizedMetal,
          originalMetals: new Set(),
          quantity: 0,
          unit: position.unit,
          lineCostValue: 0,
          allocatedFee: 0,
          costValue: 0,
          sourceDocuments: new Set(),
          invoiceNumbers: new Set(),
        };
      if (existing.unit !== position.unit) {
        existing.unitMismatch = true;
      }
      existing.originalMetals.add(position.metal);
      existing.quantity += position.quantity ?? 0;
      existing.lineCostValue += position.lineCostValue ?? 0;
      existing.allocatedFee += position.allocatedFee ?? 0;
      existing.costValue += position.costValue ?? 0;
      if (position.sourceDocument) existing.sourceDocuments.add(position.sourceDocument);
      if (position.invoiceNumber) existing.invoiceNumbers.add(position.invoiceNumber);
      holdingsByMetal.set(key, existing);
    }
  }

  return [...holdingsByMetal.values()].map((holding) => {
    const price = priceByMetal.get(holding.metal.toLowerCase());
    const currentValueBuy =
      price && convertMetalValue(holding.quantity, holding.unit, price.buyEur, price.unit);
    const currentValueSale =
      price && convertMetalValue(holding.quantity, holding.unit, price.saleEur, price.unit);
    const currentValue = roundCurrency(currentValueBuy);
    const saleValue = roundCurrency(currentValueSale);
    const costValue = roundCurrency(holding.costValue);
    return {
      metal: holding.metal,
      originalMetals: [...holding.originalMetals].sort(),
      quantity: holding.quantity,
      unit: holding.unit,
      lineCostValue: roundCurrency(holding.lineCostValue),
      allocatedFee: roundCurrency(holding.allocatedFee),
      costValue,
      priceUnit: price?.unit ?? null,
      buyEur: price?.buyEur ?? null,
      saleEur: price?.saleEur ?? null,
      priceDate: price?.priceDate ?? null,
      currentValueBuy: currentValue,
      currentValueSale: saleValue,
      performanceValue:
        currentValue != null && costValue != null ? roundCurrency(currentValue - costValue) : null,
      performancePct:
        currentValue != null && costValue ? (currentValue - costValue) / costValue : null,
      sourceDocuments: [...holding.sourceDocuments].sort(),
      invoiceNumbers: [...holding.invoiceNumbers].sort(),
      status:
        holding.unitMismatch || currentValue == null || saleValue == null ? "UNVOLLSTAENDIG" : "VERIFIED",
    };
  });
}

function holdingToPosition(holding) {
  return {
    id: `intergold_${compactIntergoldId(holding.metal)}`,
    source: "intergold",
    name: holding.metal,
    category: "Metall",
    quantityText: `${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 5 }).format(holding.quantity)} ${holding.unit}`,
    currentValue: holding.currentValueBuy,
    saleValue: holding.currentValueSale,
    costValue: holding.costValue,
    performanceValue: holding.performanceValue,
    performancePct: holding.performancePct,
    quoteText:
      holding.buyEur != null && holding.priceUnit
        ? `Ankauf ${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(holding.buyEur)} EUR/${holding.priceUnit}`
        : null,
    valuationDate: holding.priceDate,
    valuationMethod: "intergold_buy_price_v1",
    sourceUrl: INTERGOLD_PRICE_URL,
    accountValueIncluded: true,
  };
}

const fetchedAt = new Date();
const html = await fetchIntergoldPriceHtml();
const snapshotPath = await savePriceSnapshot(html, fetchedAt);
const prices = parseIntergoldPricesFromHtml(html);
const files = [...new Set((await Promise.all(sourceDirectories.map(listPdfFiles))).flat())];
const confirmations = [];
const warnings = [];

for (const filePath of files) {
  let text = "";
  try {
    text = await extractPdfText(filePath);
    const confirmation = parseIntergoldConfirmation(text, filePath);
    if (!confirmation.positions.length) {
      warnings.push(`${path.basename(filePath)}: Keine Metallpositionen gefunden`);
      continue;
    }
    confirmations.push(confirmation);
  } catch (error) {
    warnings.push(`${path.basename(filePath)}: ${error.message}`);
  }
}

const holdings = buildHoldings(confirmations, prices);
const positions = holdings.map(holdingToPosition);
const currentValue = roundCurrency(sum(holdings.map((holding) => holding.currentValueBuy)));
const saleValue = roundCurrency(sum(holdings.map((holding) => holding.currentValueSale)));
const costValue = roundCurrency(sum(holdings.map((holding) => holding.costValue)));
const lineCostValue = roundCurrency(sum(holdings.map((holding) => holding.lineCostValue)));
const allocatedFee = roundCurrency(sum(holdings.map((holding) => holding.allocatedFee)));
const missingPrices = holdings.filter((holding) => holding.status !== "VERIFIED").map((holding) => holding.metal);
const latestPriceDate = prices.map((price) => price.priceDate).filter(Boolean).sort().at(-1) ?? null;

const summary = {
  mode: writeEnabled ? "write" : "dry-run",
  priceCount: prices.length,
  okPriceCount: prices.filter((price) => price.status === "OK").length,
  priceDate: latestPriceDate,
  pdfCount: files.length,
  confirmationCount: confirmations.length,
  holdingCount: holdings.length,
  currentValue,
  saleValue,
  costValue,
  lineCostValue,
  allocatedFee,
  missingPrices,
  snapshotPath,
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

const existingPositions = (await firestore.listDocuments("sourcePositions")).filter(
  (position) => position.source === "intergold",
);
const currentPositionIds = new Set(positions.map((position) => position.id));
for (const existing of existingPositions) {
  if (!currentPositionIds.has(existing.id)) await firestore.deleteDocument("sourcePositions", existing.id);
}

for (const position of positions) {
  const { id, ...data } = position;
  await firestore.setDocument("sourcePositions", id, {
    ...data,
    updatedAt: now,
  });
}

for (const holding of holdings) {
  await firestore.setDocument("intergoldHoldings", compactIntergoldId(holding.metal), {
    ...holding,
    updatedAt: now,
  });
}

for (const price of prices) {
  const currentId = compactIntergoldId(price.metal);
  await firestore.setDocument("intergoldPrices", currentId, {
    ...price,
    sourceUrl: INTERGOLD_PRICE_URL,
    lastFetchedAt: fetchedAt,
    updatedAt: now,
  });
  await firestore.setDocument("intergoldPriceHistory", priceHistoryId(price), {
    ...price,
    sourceUrl: INTERGOLD_PRICE_URL,
    fetchedAt,
    importRunId: stableId("intergold", fetchedAt.toISOString()),
    rawSnapshotPath: snapshotPath,
    createdAt: now,
  });
}

const existingSummary = (await firestore.listDocuments("sourceSummaries")).find(
  (document) => document.id === "intergold",
);
const { id: _summaryId, ...existingSummaryData } = existingSummary ?? {};
await firestore.setDocument("sourceSummaries", "intergold", {
  ...existingSummaryData,
  source: "intergold",
  displayName: "Intergold",
  currentValue,
  saleValue,
  costValue,
  lineCostValue,
  allocatedFee,
  performanceValue: currentValue != null && costValue != null ? roundCurrency(currentValue - costValue) : null,
  performancePct: currentValue != null && costValue ? (currentValue - costValue) / costValue : null,
  valuationMethod: "intergold_buy_price_v1",
  valuationDate: latestPriceDate,
  priceDate: latestPriceDate,
  priceSourceUrl: INTERGOLD_PRICE_URL,
  priceSnapshotPath: snapshotPath,
  sourceDocumentCount: confirmations.length,
  positionCount: positions.length,
  missingPrices,
  status: missingPrices.length ? "PARTIAL" : "VERIFIED",
  updatedAt: now,
});

await firestore.setDocument("agentStatus", "intergold", {
  source: "intergold",
  status: missingPrices.length ? "PARTIAL" : "OK",
  message: `${positions.length} Intergold-Positionen, ${prices.length} Preise, ${missingPrices.length} fehlende Preise`,
  lastSuccessAt: now,
  positionCount: positions.length,
  currentValue,
});

console.log(`[ok] Intergold-Abgleich geschrieben: ${positions.length} Positionen, ${currentValue.toFixed(2)} EUR`);
