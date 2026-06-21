import "dotenv/config";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function runQuoteSync() {
  const result = spawnSync(process.execPath, [path.join(__dirname, "run-quote-sync-local.mjs")], {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Kurs-Sync fehlgeschlagen: Exit ${result.status}`);
}

function runFullRefresh() {
  const result = spawnSync(process.execPath, [path.join(__dirname, "run-full-refresh-local.mjs")], {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Gesamtaktualisierung fehlgeschlagen: Exit ${result.status}`);
}

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});

const [commands, statuses] = await Promise.all([
  firestore.listDocuments("automationCommands"),
  firestore.listDocuments("agentStatus"),
]);
const quoteAgentStatus = statuses.find((status) => status.id === "quotes");
const manualRefreshStatus = statuses.find((status) => status.id === "manual_refresh");
if (quoteAgentStatus?.status === "RUNNING" || manualRefreshStatus?.status === "RUNNING") {
  console.log("[info] Aktualisierung laeuft bereits. Offene Befehle bleiben fuer den naechsten Lauf liegen.");
  process.exit(0);
}
const pendingCommands = commands
  .filter((command) => ["sync_quotes", "full_refresh"].includes(command.type) && command.status === "REQUESTED")
  .sort((left, right) => {
    const leftDate = parseDate(left.requestedAt)?.getTime() ?? 0;
    const rightDate = parseDate(right.requestedAt)?.getTime() ?? 0;
    return leftDate - rightDate;
  });

if (pendingCommands.length === 0) {
  console.log("[ok] Keine offenen Automationsbefehle.");
  process.exit(0);
}

for (const command of pendingCommands) {
  const startedAt = new Date();
  await firestore.setDocument("automationCommands", command.id, {
    ...command,
    status: "RUNNING",
    startedAt,
    updatedAt: startedAt,
  });

  try {
    if (command.type === "sync_quotes") runFullRefresh();
    if (command.type === "full_refresh") runFullRefresh();
    const completedAt = new Date();
    await firestore.setDocument("automationCommands", command.id, {
      ...command,
      status: "DONE",
      startedAt,
      completedAt,
      updatedAt: completedAt,
    });
    console.log(`[ok] Befehl ausgefuehrt: ${command.id}`);
  } catch (error) {
    const failedAt = new Date();
    await firestore.setDocument("automationCommands", command.id, {
      ...command,
      status: "ERROR",
      startedAt,
      failedAt,
      updatedAt: failedAt,
      errorMessage: error instanceof Error ? error.message : "Automationsbefehl fehlgeschlagen",
    });
    throw error;
  }
}
