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

function runScriptStep(script, args = []) {
  try {
    runScript(script, args);
    return { script, status: "OK" };
  } catch (error) {
    return {
      script,
      status: "FEHLER",
      message: error instanceof Error ? error.message : `${script} fehlgeschlagen`,
    };
  }
}

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});

const startedAt = new Date();
await firestore.setDocument("agentStatus", "quotes", {
  source: "quotes",
  status: "RUNNING",
  message: writeHistoryEnabled ? "Kurs-Sync mit 5-Minuten-Historie laeuft" : "Kurs-Sync laeuft",
  startedAt,
  updatedAt: startedAt,
});

try {
  const steps = [];
  steps.push(runScriptStep(
    "sync-equateplus-manual-local.mjs",
    writeHistoryEnabled ? ["--write", "--write-history"] : ["--write"],
  ));
  steps.push(runScriptStep("sync-quotes-local.mjs", writeHistoryEnabled ? ["--write", "--write-history"] : ["--write"]));
  if (writeHistoryEnabled) steps.push(runScriptStep("sync-position-history-local.mjs", ["--write"]));
  const failures = steps.filter((step) => step.status !== "OK");
  const successfulSteps = steps.length - failures.length;
  const finishedAt = new Date();
  const statusDocument = {
    source: "quotes",
    status: failures.length ? (successfulSteps > 0 ? "WARNUNG" : "FEHLER") : "OK",
    message: failures.length
      ? `Kurs-Sync teilweise abgeschlossen: ${failures.map((failure) => failure.message).join("; ")}`
      : writeHistoryEnabled
        ? "Kurse und 5-Minuten-Historie aktualisiert"
        : "Aktuelle Kurse aktualisiert",
    failedSteps: failures,
    stepResults: steps,
    updatedAt: finishedAt,
  };
  if (successfulSteps > 0) statusDocument.lastSuccessAt = finishedAt;
  await firestore.setDocument("agentStatus", "quotes", statusDocument);
  if (successfulSteps === 0) {
    throw new Error(failures.map((failure) => failure.message).join("; ") || "Kurs-Sync fehlgeschlagen");
  }
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
