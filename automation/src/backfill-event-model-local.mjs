import "dotenv/config";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { EVENT_COLLECTIONS, normalizeEventDocument } from "./event-model.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const now = new Date();
const importId = `event_model_${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});

function eventCoverage(document) {
  return {
    hasEventGroupId: Boolean(document.eventGroupId),
    hasEventDate: Boolean(document.eventDate),
    hasAllocationStatus: Boolean(document.allocationStatus),
    hasFinancialImpactEur: typeof document.financialImpactEur === "number",
    hasComparisonScope: Boolean(document.comparisonScope),
  };
}

function mergeCoverage(totals, coverage) {
  for (const [key, value] of Object.entries(coverage)) {
    if (value) totals[key] = (totals[key] ?? 0) + 1;
  }
  return totals;
}

const summary = {
  mode: writeEnabled ? "write" : "dry-run",
  eventModelVersion: "event_model_v1_2026-06-27",
  collections: {},
  total: 0,
  updated: 0,
};

const modelFields = [
  "eventModelVersion",
  "eventCollection",
  "eventKind",
  "eventType",
  "eventDate",
  "eventGroupId",
  "dedupeKey",
  "sourceAccountId",
  "instrumentId",
  "amountEur",
  "amountAbsEur",
  "grossAmountEur",
  "netAmountEur",
  "taxAmountEur",
  "feeAmountEur",
  "financialImpactEur",
  "allocationLevel",
  "allocationStatus",
  "allocationMethod",
  "allocationConfidence",
  "comparisonScope",
  "providerComparisonRelevant",
  "costClass",
  "incomeClass",
];

function comparable(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

function needsUpdate(original, normalized) {
  return modelFields.some((field) => comparable(original[field]) !== comparable(normalized[field]));
}

for (const collection of EVENT_COLLECTIONS) {
  const documents = await firestore.listDocuments(collection);
  const normalized = documents.map((document) => normalizeEventDocument(collection, document, now));
  const changed = normalized.filter((document, index) => needsUpdate(documents[index], document));
  const coverage = normalized.reduce((totals, document) => mergeCoverage(totals, eventCoverage(document)), {});
  summary.collections[collection] = {
    count: normalized.length,
    changed: changed.length,
    coverage,
    allocationStatus: normalized.reduce((counts, document) => {
      const key = document.allocationStatus ?? "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
    comparisonScope: normalized.reduce((counts, document) => {
      const key = document.comparisonScope ?? "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
  };
  summary.total += normalized.length;

  if (writeEnabled) {
    for (const document of changed) {
      const { id, ...data } = document;
      await firestore.setDocument(collection, id, data);
      summary.updated += 1;
    }
  }
}

if (writeEnabled) {
  await firestore.setDocument("imports", importId, {
    source: "event_model",
    parser: "event_model_backfill_v1",
    status: "OK",
    updatedCollections: EVENT_COLLECTIONS,
    eventCount: summary.total,
    updatedCount: summary.updated,
    summary,
    updatedAt: now,
  });
  await firestore.setDocument("agentStatus", "event_model", {
    source: "event_model",
    status: "OK",
    message: `${summary.updated} Event-Dokumente mit kanonischem Zuordnungsmodell aktualisiert`,
    lastAgentRunAt: now,
    lastAgentSuccessAt: now,
    eventModelVersion: summary.eventModelVersion,
    updatedCollections: EVENT_COLLECTIONS,
    eventCount: summary.total,
    updatedCount: summary.updated,
    updatedAt: now,
  });
}

console.log(JSON.stringify(summary, null, 2));
if (!writeEnabled) {
  console.log("[dry-run] Keine Firestore-Daten geaendert. Fuer Schreiben --write verwenden.");
}
