import "dotenv/config";
import { createBitgetClientFromLocalSecrets, fetchBitgetPortfolioSnapshot } from "./bitget-client.mjs";
import { applyCostBasisOverrides } from "./cost-basis-overrides.mjs";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const runId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const importId = "api_bitget_latest";

const accessToken = await getFirebaseCliAccessToken();
const firestore = new FirestoreRest({ projectId, accessToken });

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseMaybeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
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

function sum(values) {
  return values.reduce((total, value) => total + (parseMaybeNumber(value) ?? 0), 0);
}

async function writeFailureStatus(error) {
  const now = new Date();
  const existingStatuses = await firestore.listDocuments("agentStatus");
  const existing = existingStatuses.find((status) => status.id === "bitget") ?? {};
  const message = formatError(error);

  await firestore.setDocument("agentStatus", "bitget", {
    ...existing,
    source: "bitget",
    status: "FEHLER",
    message,
    errorName: error?.name ?? null,
    errorCode: error?.code ?? null,
    errorStatus: error?.status ?? null,
    requestPath: error?.requestPath ?? null,
    updatedAt: now,
    failedImportId: importId,
    failedRunId: runId,
  });

  await firestore.setDocument("imports", importId, {
    source: "bitget",
    parser: "bitget_api_v1",
    status: "FEHLER",
    message,
    errorName: error?.name ?? null,
    errorCode: error?.code ?? null,
    errorStatus: error?.status ?? null,
    requestPath: error?.requestPath ?? null,
    runId,
    updatedAt: now,
  });
}

async function main() {
  const client = await createBitgetClientFromLocalSecrets();
  const snapshot = await fetchBitgetPortfolioSnapshot(client);
  const now = new Date();
  const costBasisOverrides = (await firestore.listDocuments("sourceCostBasis")).filter(
    (override) => override.source === "bitget",
  );
  snapshot.positions = applyCostBasisOverrides(snapshot.positions, costBasisOverrides).map((position) =>
    enrichQuoteCostBasis(position, snapshot.usdtToEur),
  );

  const existingPositions = (await firestore.listDocuments("sourcePositions")).filter(
    (position) => position.source === "bitget",
  );
  const currentIds = new Set(snapshot.positions.map((position) => position.id));
  for (const position of existingPositions) {
    if (!currentIds.has(position.id)) await firestore.deleteDocument("sourcePositions", position.id);
  }

  for (const position of snapshot.positions) {
    await firestore.setDocument("sourcePositions", position.id, {
      ...position,
      importId,
      updatedAt: now,
    });
  }

  const totalCostValue = roundCurrency(sum(snapshot.positions.map((position) => position.costValue)));
  const totalPerformanceValue =
    totalCostValue > 0 ? roundCurrency(snapshot.currentValue - totalCostValue) : null;

  await firestore.setDocument("sourceSummaries", "bitget", {
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
    updatedAt: now,
  });

  await firestore.setDocument("imports", importId, {
    source: "bitget",
    parser: "bitget_api_v1",
    status: "IMPORTED",
    positionCount: snapshot.positions.length,
    currentValue: snapshot.currentValue,
    valuationDate: snapshot.valuationDate,
    usdtToEur: snapshot.usdtToEur,
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
    runId,
    updatedAt: now,
  });

  await firestore.setDocument("rawDocuments", importId, {
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
    updatedAt: now,
  });

  await firestore.setDocument("agentStatus", "bitget", {
    source: "bitget",
    status: "OK",
    message: `${snapshot.positions.length} Positionen aktualisiert`,
    lastSuccessAt: now,
    valuationDate: snapshot.valuationDate,
    importId,
  });

  console.log(
    `[ok] Bitget lokal importiert: ${snapshot.positions.length} Positionen, ` +
      `${snapshot.currentValue.toFixed(2)} EUR`,
  );
}

try {
  await main();
} catch (error) {
  await writeFailureStatus(error);
  console.error(`[error] Bitget Import fehlgeschlagen: ${formatError(error)}`);
  process.exitCode = 1;
}
