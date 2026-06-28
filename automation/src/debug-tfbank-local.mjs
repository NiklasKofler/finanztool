import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.join(__dirname, "..", "runtime", "tfbank-debug.ndjson");
const messagesDbPath = path.join(os.homedir(), "Library", "Messages", "chat.db");
const execFileAsync = promisify(execFile);

function formatEventTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("de-AT", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function compact(value, maxLength = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function latest(events, name) {
  return [...events].reverse().find((event) => event.event === name) ?? null;
}

function printLine(label, value) {
  console.log(`${label.padEnd(20)} ${value}`);
}

async function probeMessagesDatabase() {
  const query = `
    SELECT text, date
    FROM message
    WHERE text LIKE '%TF Bank Bestätigungscode ist%'
       OR text LIKE '%TF Bank Bestaetigungscode ist%'
    ORDER BY date DESC
    LIMIT 1;
  `;
  try {
    const { stdout } = await execFileAsync("sqlite3", ["-readonly", "-json", messagesDbPath, query], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    const rows = JSON.parse(stdout || "[]");
    return {
      ok: true,
      rowCount: rows.length,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

let rows = [];
try {
  const raw = await fs.readFile(logPath, "utf8");
  rows = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
} catch (error) {
  if (error?.code === "ENOENT") {
    console.log("TF Bank Debug: Noch kein Debug-Log vorhanden.");
    console.log(`Erwarteter Pfad: ${logPath}`);
    process.exit(0);
  }
  throw error;
}

const lastRunStartIndex = rows.map((row) => row.event).lastIndexOf("run_start");
const runRows = lastRunStartIndex >= 0 ? rows.slice(lastRunStartIndex) : rows;
const runStart = latest(runRows, "run_start");
const runSuccess = latest(runRows, "run_success");
const runError = latest(runRows, "run_error");
const dbRead = latest(runRows, "messages_db_read");
const dbError = latest(runRows, "messages_db_error");
const uiRead = latest(runRows, "messages_tan_read");
const uiError = latest(runRows, "messages_tan_error");
const tanNotReceived = latest(runRows, "tan_not_received");
const tanSettleWait = latest(runRows, "tan_settle_wait");
const submit = latest(runRows, "login_tan_submit");
const attemptError = latest(runRows, "login_attempt_error");
const dbProbe = !dbRead && !dbError ? await probeMessagesDatabase() : null;
const successAfterError =
  runSuccess &&
  (!runError || new Date(runSuccess.at).getTime() >= new Date(runError.at).getTime());

console.log("TF Bank Debug");
console.log("=============");
printLine("Log", logPath);
printLine("Letzter Lauf", formatEventTime(runStart?.at ?? runRows.at(-1)?.at));
printLine("Status", successAfterError ? "OK" : runError ? "FEHLER" : "UNBEKANNT/LAEUFT");

if (runError) {
  printLine("Finaler Fehler", compact(runError.message));
}

console.log("");
console.log("TAN-Erkennung");
console.log("-------------");

if (dbRead) {
  printLine("Messages-DB", dbRead.detected ? `OK, TAN ${dbRead.tan}` : "OK, aber keine TAN gefunden");
  if (dbRead.rowCount != null) printLine("DB-Zeilen", dbRead.rowCount);
} else if (dbError) {
  printLine("Messages-DB", `FEHLER: ${compact(dbError.message, 160)}`);
  if (/authorization denied/i.test(dbError.message ?? "")) {
    printLine("Noetig", "Full Disk Access fuer Codex/Node");
  }
} else if (dbProbe) {
  printLine("Messages-DB", dbProbe.ok ? `OK, Test findet ${dbProbe.rowCount} TF-Bank-Zeile(n)` : `FEHLER: ${compact(dbProbe.message, 160)}`);
  if (!dbProbe.ok && /authorization denied/i.test(dbProbe.message ?? "")) {
    printLine("Noetig", "Full Disk Access fuer Codex/Node");
  }
} else {
  printLine("Messages-DB", "nicht genutzt");
}

if (uiRead) {
  printLine("Messages-UI", uiRead.detected ? `OK, TAN ${uiRead.tan}` : "keine TAN sichtbar");
} else if (uiError) {
  printLine("Messages-UI", `FEHLER: ${compact(uiError.message, 160)}`);
} else {
  printLine("Messages-UI", "nicht genutzt");
}

if (submit) {
  if (tanSettleWait) {
    printLine("Wartezeit vor TAN", `${tanSettleWait.settleMs ?? "-"} ms`);
  }
  printLine("Eingetippt", `TAN ${submit.tan}`);
}

if (tanNotReceived) {
  printLine("Wartefenster", `${tanNotReceived.waitSeconds}s ohne neue TAN`);
}

if (attemptError) {
  console.log("");
  console.log("Portalantwort");
  console.log("-------------");
  printLine("Retryable", attemptError.retryableTan ? "ja" : "nein");
  printLine("Code", attemptError.code ?? "-");
  printLine("Meldung", compact(attemptError.message, 300));
}

console.log("");
console.log("Naechste Diagnose");
console.log("-----------------");
const dbAuthorizationDenied =
  /authorization denied/i.test(dbError?.message ?? "") ||
  /authorization denied/i.test(dbProbe?.message ?? "");

if (dbAuthorizationDenied) {
  console.log("- macOS blockiert aktuell die Messages-Datenbank.");
  console.log("- Full Disk Access fuer Codex und den Node-Binary aktivieren.");
  console.log("- Danach: npm --prefix automation run debug:tfbank:messages-db");
} else if (tanNotReceived && uiRead && !uiRead.detected) {
  console.log("- Messages-UI zeigt aktuell keinen TF-Bank-Code im Accessibility-Text.");
  console.log("- Stabile Loesung ist Messages-DB-Zugriff oder TAN-Datei/stdin als Fallback.");
} else if (attemptError?.retryableTan) {
  console.log("- TAN wurde erkannt/eingetippt, aber das Portal hat sie nicht bestaetigt.");
  console.log("- In diesem Fall pruefen wir Timing, frische Session und Portalzustand.");
} else if (successAfterError) {
  console.log("- Letzter Lauf war erfolgreich.");
} else {
  console.log("- Rohlog bei Bedarf: npm --prefix automation run debug:tfbank:raw");
}
