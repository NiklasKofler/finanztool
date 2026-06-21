import "dotenv/config";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeHistoryEnabled =
  process.argv.includes("--write-history") ||
  ["1", "true", "yes"].includes(String(process.env.QUOTE_WRITE_HISTORY ?? "").toLowerCase());

function runScript(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`${script} fehlgeschlagen: Exit ${result.status}`);
}

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});

const startedAt = new Date();
await firestore.setDocument("agentStatus", "quotes", {
  source: "quotes",
  status: "RUNNING",
  message: writeHistoryEnabled ? "Kurs-Sync mit Tageshistorie laeuft" : "Kurs-Sync laeuft",
  startedAt,
  updatedAt: startedAt,
});

try {
  runScript("sync-quotes-local.mjs", writeHistoryEnabled ? ["--write", "--write-history"] : ["--write"]);
  if (writeHistoryEnabled) runScript("sync-position-history-local.mjs", ["--write"]);
  const finishedAt = new Date();
  await firestore.setDocument("agentStatus", "quotes", {
    source: "quotes",
    status: "OK",
    message: writeHistoryEnabled
      ? "Kurse und Tageshistorie aktualisiert"
      : "Aktuelle Kurse aktualisiert",
    lastSuccessAt: finishedAt,
    updatedAt: finishedAt,
  });
  runScript("check-health-local.mjs");
} catch (error) {
  const failedAt = new Date();
  await firestore.setDocument("agentStatus", "quotes", {
    source: "quotes",
    status: "FEHLER",
    message: error instanceof Error ? error.message : "Kurs-Sync fehlgeschlagen",
    failedAt,
    updatedAt: failedAt,
  });
  throw error;
}
