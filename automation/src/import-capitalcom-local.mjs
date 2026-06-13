import "dotenv/config";
import { createCapitalComClientFromLocalSecrets, fetchCapitalComPortfolioSnapshot } from "./capitalcom-client.mjs";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const runId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const importId = `api_capitalcom_${runId.slice(0, 8)}`;

const client = await createCapitalComClientFromLocalSecrets();
const snapshot = await fetchCapitalComPortfolioSnapshot(client);
const accessToken = await getFirebaseCliAccessToken();
const firestore = new FirestoreRest({ projectId, accessToken });
const now = new Date();

const existingPositions = (await firestore.listDocuments("sourcePositions")).filter(
  (position) => position.source === "capitalcom",
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

await firestore.setDocument("sourceSummaries", "capitalcom", {
  source: "capitalcom",
  displayName: "Capital.com",
  currentValue: snapshot.currentValue,
  cashValue: snapshot.cashValue,
  netValue: snapshot.netValue,
  valuationDate: snapshot.valuationDate,
  positionCount: snapshot.positionCount,
  accounts: snapshot.accounts,
  accountId: snapshot.accountId,
  demo: snapshot.demo,
  nonEurAccountCount: snapshot.nonEurAccountCount,
  status: snapshot.status,
  valuationMethod: "capitalcom_api_v1",
  updatedAt: now,
});

await firestore.setDocument("imports", importId, {
  source: "capitalcom",
  parser: "capitalcom_api_v1",
  status: snapshot.status === "VERIFIED" ? "IMPORTED" : "WARNUNG",
  positionCount: snapshot.positionCount,
  currentValue: snapshot.currentValue,
  valuationDate: snapshot.valuationDate,
  accountCount: snapshot.accounts.length,
  nonEurAccountCount: snapshot.nonEurAccountCount,
  runId,
  updatedAt: now,
});

await firestore.setDocument("agentStatus", "capitalcom", {
  source: "capitalcom",
  status: snapshot.status === "VERIFIED" ? "OK" : "WARNUNG",
  message: `${snapshot.accounts.length} Konto/Konten, ${snapshot.positionCount} offene CFD-Positionen`,
  lastSuccessAt: now,
  valuationDate: snapshot.valuationDate,
  currentValue: snapshot.currentValue,
  importId,
});

console.log(
  `[ok] Capital.com lokal importiert: ${snapshot.accounts.length} Konto/Konten, ` +
    `${snapshot.positionCount} Positionen, ${snapshot.currentValue.toFixed(2)} EUR`,
);
