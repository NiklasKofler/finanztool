import "dotenv/config";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { readLocalSecret } from "./local-secret.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";

const steps = [
  { id: "bitget", label: "Bitget Snapshot", script: "import-bitget-local.mjs" },
  { id: "bitget_ledger", label: "Bitget Ledger", script: "sync-bitget-ledger-local.mjs" },
  { id: "flatex", label: "Flatex Umsaetze und Broker-Snapshot", script: "download-flatex-local.mjs", args: ["--write"] },
  { id: "traderepublic_portal", label: "Trade Republic Portal", script: "download-traderepublic-local.mjs", args: ["--write", "--headless"] },
  { id: "ginmon", label: "Ginmon API", script: "sync-ginmon-current-api.mjs", args: ["--write"] },
  { id: "ginmon_documents", label: "Ginmon Dokumente", script: "download-ginmon-local.mjs", args: ["--write-documents-only"] },
  { id: "intergold", label: "Intergold Bestand und Preise", script: "reconcile-intergold-local.mjs", args: ["--write"] },
  { id: "vbv", label: "VBV Vorsorgekasse", script: "sync-vbv-local.mjs", args: ["--write"] },
  { id: "bank_accounts", label: "Bankkonten", script: "sync-sparkasse-george-local.mjs", args: ["--banks=erste,revolut,paypal", "--write", "--transactions"] },
  { id: "quotes", label: "Aktuelle Kurse und 5-Minuten-Historie", script: "run-quote-sync-local.mjs", args: ["--write-history"] },
  { id: "event_model", label: "Event-Modell-Normalisierung", script: "backfill-event-model-local.mjs", args: ["--write"] },
  { id: "health", label: "Health-Check", script: "check-health-local.mjs" },
];

const [trading212ApiKey, trading212ApiSecret] = await Promise.all([
  readLocalSecret("TRADING212_API_KEY", "finanztool-trading212-api-key"),
  readLocalSecret("TRADING212_API_SECRET", "finanztool-trading212-api-secret"),
]);
if (trading212ApiKey && trading212ApiSecret) {
  steps.splice(2, 0, {
    id: "trading212",
    label: "Trading 212",
    script: "sync-trading212-local.mjs",
    args: ["--write"],
  });
}

function runStep(step) {
  const startedAt = new Date();
  const result = spawnSync(process.execPath, [path.join(__dirname, step.script), ...(step.args ?? [])], {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const finishedAt = new Date();
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    id: step.id,
    label: step.label,
    script: step.script,
    status: result.status === 0 ? "OK" : "FEHLER",
    exitCode: result.status,
    startedAt,
    finishedAt,
    message:
      result.status === 0
        ? `${step.label} abgeschlossen`
        : `${step.label} fehlgeschlagen: Exit ${result.status}`,
    stderrTail: result.stderr ? result.stderr.slice(-2000) : null,
  };
}

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});

const startedAt = new Date();
await firestore.setDocument("agentStatus", "manual_refresh", {
  source: "manual_refresh",
  status: "RUNNING",
  message: "Manuelle Gesamtaktualisierung laeuft",
  startedAt,
  updatedAt: startedAt,
});

const results = [];
for (const step of steps) {
  console.log(`[run] ${step.label}`);
  const result = runStep(step);
  results.push(result);
  await firestore.setDocument("agentStatus", "manual_refresh", {
    source: "manual_refresh",
    status: "RUNNING",
    message: `${result.label}: ${result.status}`,
    startedAt,
    updatedAt: new Date(),
    steps: results,
  });
}

const failed = results.filter((result) => result.status !== "OK");
const finishedAt = new Date();
await firestore.setDocument("agentStatus", "manual_refresh", {
  source: "manual_refresh",
  status: failed.length ? "FEHLER" : "OK",
  message: failed.length
    ? `${failed.length} Teilaktualisierung(en) fehlgeschlagen`
    : "Alle Quellen, Kurse und Health aktualisiert",
  startedAt,
  finishedAt,
  lastSuccessAt: failed.length ? null : finishedAt,
  updatedAt: finishedAt,
  steps: results,
});

if (failed.length) {
  console.error(JSON.stringify({ status: "FEHLER", failed }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "OK", steps: results.length }, null, 2));
