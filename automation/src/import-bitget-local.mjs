import "dotenv/config";
import { createBitgetClientFromLocalSecrets, fetchBitgetPortfolioSnapshot } from "./bitget-client.mjs";
import { applyCostBasisOverrides } from "./cost-basis-overrides.mjs";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const runId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const importId = `api_bitget_${runId.slice(0, 8)}`;

const client = await createBitgetClientFromLocalSecrets();
const snapshot = await fetchBitgetPortfolioSnapshot(client);
const accessToken = await getFirebaseCliAccessToken();
const firestore = new FirestoreRest({ projectId, accessToken });
const now = new Date();
const costBasisOverrides = (await firestore.listDocuments("sourceCostBasis")).filter(
  (override) => override.source === "bitget",
);
snapshot.positions = applyCostBasisOverrides(snapshot.positions, costBasisOverrides);

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

await firestore.setDocument("sourceSummaries", "bitget", {
  source: "bitget",
  displayName: "Bitget",
  currentValue: snapshot.currentValue,
  valuationDate: snapshot.valuationDate,
  positionCount: snapshot.positions.length,
  componentsUsdt: snapshot.accountComponents,
  totalAccountValueUsdt: snapshot.totalAccountValueUsdt,
  additionalValue: snapshot.additionalValue,
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
  additionalValue: snapshot.additionalValue,
  runId,
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
