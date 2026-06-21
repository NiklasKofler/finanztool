import "dotenv/config";
import admin from "firebase-admin";
import fs from "node:fs/promises";
import {
  createBitgetClientFromLocalSecrets,
  fetchBitgetPortfolioSnapshot,
} from "./bitget-client.mjs";
import { applyCostBasisOverrides } from "./cost-basis-overrides.mjs";

const required = ["FIREBASE_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_PATH"];

for (const key of required) {
  if (!process.env[key]) throw new Error(`Fehlende Umgebungsvariable: ${key}`);
}

const serviceAccount = JSON.parse(
  await fs.readFile(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8"),
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

const db = admin.firestore();
const runId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const importId = "api_bitget_latest";

function parseMaybeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

function sum(values) {
  return values.reduce((total, value) => total + (parseMaybeNumber(value) ?? 0), 0);
}

function enrichQuoteCostBasis(position, usdtToEur) {
  const currentValue = parseMaybeNumber(position.currentValue);
  const costValue = parseMaybeNumber(position.costValue);
  if (typeof costValue === "number") return position;

  const costValueQuote = parseMaybeNumber(position.costValueQuote);
  if (
    typeof currentValue !== "number" ||
    typeof costValueQuote !== "number" ||
    typeof usdtToEur !== "number"
  ) {
    return position;
  }

  const convertedCostValue = roundCurrency(costValueQuote * usdtToEur);
  const performanceValue = roundCurrency(currentValue - convertedCostValue);
  return {
    ...position,
    costValue: convertedCostValue,
    costCurrency: position.costCurrency ?? "USDT",
    costValueConvertedFromQuote: true,
    performanceValue,
    performancePct: convertedCostValue ? performanceValue / convertedCostValue : null,
  };
}

function toTimestampMillis(daysAgo) {
  return String(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

async function replaceSourcePositions(source, positions) {
  const existing = await db.collection("sourcePositions").where("source", "==", source).get();
  const batch = db.batch();
  existing.docs.forEach((doc) => batch.delete(doc.ref));
  positions.forEach((position) => {
    batch.set(db.collection("sourcePositions").doc(position.id), {
      ...position,
      importId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

async function writeLedgerEntries(entries) {
  for (let offset = 0; offset < entries.length; offset += 400) {
    const batch = db.batch();
    entries.slice(offset, offset + 400).forEach((entry, index) => {
      const rowNumber = offset + index + 1;
      batch.set(
        db.collection("ledgerEntries").doc(`${importId}_${rowNumber}`),
        {
          source: "bitget",
          importId,
          rowNumber,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          ...entry,
        },
        { merge: true },
      );
    });
    await batch.commit();
  }
}

const client = await createBitgetClientFromLocalSecrets();
const snapshot = await fetchBitgetPortfolioSnapshot(client);
const costBasisSnapshot = await db.collection("sourceCostBasis").where("source", "==", "bitget").get();
snapshot.positions = applyCostBasisOverrides(
  snapshot.positions,
  costBasisSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
).map((position) => enrichQuoteCostBasis(position, snapshot.usdtToEur));

let bills = [];
try {
  bills = await client.getSpotBills({
    startTime: toTimestampMillis(90),
    endTime: String(Date.now()),
    limit: "500",
  });
} catch (error) {
  console.warn(`[warn] Bitget spot bills skipped: ${error.message}`);
}

const ledgerEntries = (bills ?? []).map((bill) => ({
  date: bill.cTime ? new Date(Number(bill.cTime)).toISOString() : null,
  category: bill.groupType ?? "other",
  bookingText: bill.businessType ?? bill.groupType ?? "",
  coin: bill.coin ?? null,
  quantity: Number.parseFloat(bill.size ?? ""),
  amount: Number.parseFloat(bill.size ?? ""),
  fee: Number.parseFloat(bill.fees ?? ""),
  currency: bill.coin ?? null,
  raw: bill,
}));

const totalCostValue = roundCurrency(sum(snapshot.positions.map((position) => position.costValue)));
const totalPerformanceValue =
  totalCostValue > 0 ? roundCurrency(snapshot.currentValue - totalCostValue) : null;

await db.collection("imports").doc(importId).set(
  {
    source: "bitget",
    parser: "bitget_api_v1",
    status: "IMPORTED",
    positionCount: snapshot.positions.length,
    ledgerEntryCount: ledgerEntries.length,
    currentValue: snapshot.currentValue,
    componentsUsdt: snapshot.accountComponents,
    totalAccountValueUsdt: snapshot.totalAccountValueUsdt,
    exchangeAccountValue: snapshot.exchangeAccountValue,
    positionsValue: snapshot.positionsValue,
    includedPositionsValue: snapshot.includedPositionsValue,
    positionSummaryDifference: snapshot.positionSummaryDifference,
    unpricedPositionCount: snapshot.unpricedPositionCount,
    unpricedPositions: snapshot.unpricedPositions,
    excludedPositionCount: snapshot.excludedPositionCount,
    excludedPositions: snapshot.excludedPositions,
    valuationDate: snapshot.valuationDate,
    usdtToEur: snapshot.usdtToEur,
    runId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true },
);

await db.collection("rawDocuments").doc(importId).set(
  {
    source: "bitget",
    importId,
    fileType: "api",
    parserVersion: "bitget_api_v1",
    accountInfo: snapshot.accountInfo,
    accountBalances: snapshot.accountBalances,
    accountComponents: snapshot.accountComponents,
    totalAccountValueUsdt: snapshot.totalAccountValueUsdt,
    exchangeAccountValue: snapshot.exchangeAccountValue,
    positionsValue: snapshot.positionsValue,
    includedPositionsValue: snapshot.includedPositionsValue,
    positionSummaryDifference: snapshot.positionSummaryDifference,
    unpricedPositionCount: snapshot.unpricedPositionCount,
    unpricedPositions: snapshot.unpricedPositions,
    excludedPositionCount: snapshot.excludedPositionCount,
    excludedPositions: snapshot.excludedPositions,
    earnAssets: snapshot.earnAssets,
    rawPositions: snapshot.rawPositions,
    positions: snapshot.positions,
    usdtToEur: snapshot.usdtToEur,
    valuationDate: snapshot.valuationDate,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true },
);

await replaceSourcePositions("bitget", snapshot.positions);
await writeLedgerEntries(ledgerEntries);

await db.collection("sourceSummaries").doc("bitget").set(
  {
    source: "bitget",
    displayName: "Bitget",
    currentValue: snapshot.currentValue,
    netValue: snapshot.currentValue,
    costValue: totalCostValue > 0 ? totalCostValue : null,
    performanceValue: totalPerformanceValue,
    performancePct: totalCostValue > 0 && totalPerformanceValue !== null ? totalPerformanceValue / totalCostValue : null,
    valuationDate: snapshot.valuationDate,
    positionCount: snapshot.positions.length,
    componentsUsdt: snapshot.accountComponents,
    totalAccountValueUsdt: snapshot.totalAccountValueUsdt,
    usdtToEur: snapshot.usdtToEur,
    exchangeAccountValue: snapshot.exchangeAccountValue,
    positionsValue: snapshot.positionsValue,
    includedPositionsValue: snapshot.includedPositionsValue,
    positionSummaryDifference: snapshot.positionSummaryDifference,
    unpricedPositionCount: snapshot.unpricedPositionCount,
    unpricedPositions: snapshot.unpricedPositions,
    excludedPositionCount: snapshot.excludedPositionCount,
    excludedPositions: snapshot.excludedPositions,
    status: snapshot.positions.length ? "VERIFIED" : "UNVOLLSTAENDIG",
    valuationMethod: "bitget_api_v1",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true },
);

console.log(
  `[ok] Bitget importiert: ${snapshot.positions.length} Positionen, ${ledgerEntries.length} Ledger-Eintraege`,
);
