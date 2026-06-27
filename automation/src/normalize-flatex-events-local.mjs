import "dotenv/config";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { buildFlatexEventsFromFacts, replaceFlatexEvents } from "./flatex-event-normalizer.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});

const facts = (await firestore.listDocuments("sourceDocumentFacts")).filter((fact) => fact.source === "flatex");
const now = new Date();
const events = buildFlatexEventsFromFacts(facts, now);

const summary = {
  mode: writeEnabled ? "write" : "dry-run",
  sourceFacts: facts.length,
  transactions: events.transactions.length,
  ledgerEntries: events.ledgerEntries.length,
  costEvents: events.costEvents.length,
  incomeEvents: events.incomeEvents.length,
  costEventsByType: Object.fromEntries(
    Object.entries(
      events.costEvents.reduce((counts, event) => {
        counts[event.type] = (counts[event.type] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort(([left], [right]) => left.localeCompare(right)),
  ),
  incomeEventsByType: Object.fromEntries(
    Object.entries(
      events.incomeEvents.reduce((counts, event) => {
        counts[event.type] = (counts[event.type] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort(([left], [right]) => left.localeCompare(right)),
  ),
};

if (!writeEnabled) {
  console.log(JSON.stringify(summary, null, 2));
  console.log("[dry-run] Keine Firestore-Daten geaendert. Fuer Schreiben --write verwenden.");
  process.exit(0);
}

const result = await replaceFlatexEvents(firestore, facts, now);
await firestore.setDocument("agentStatus", "flatex_documents", {
  source: "flatex",
  status: "OK",
  message: `${facts.length} Flatex-Fakten normalisiert: ${result.written.transactions} Transaktionen, ${result.written.ledgerEntries} Ledger, ${result.written.costEvents} Kosten, ${result.written.incomeEvents} Ertraege`,
  lastSuccessAt: now,
  lastAgentRunAt: now,
  normalizedAt: now,
  normalizedFactCount: facts.length,
  normalizedTransactions: result.written.transactions,
  normalizedLedgerEntries: result.written.ledgerEntries,
  normalizedCostEvents: result.written.costEvents,
  normalizedIncomeEvents: result.written.incomeEvents,
});

console.log(JSON.stringify({ ...summary, deleted: result.deleted, written: result.written }, null, 2));
