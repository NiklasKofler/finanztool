import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { ensureVbvLogin, launchVbvBrowser, parseVbvBalanceText, readVbvBalance } from "./vbv-browser.mjs";

const execFileAsync = promisify(execFile);
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function roundCurrency(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

async function readCurrentChromeText() {
  const script = `
tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "meinevbv.at" then
        return execute t javascript "document.body ? document.body.innerText : ''"
      end if
    end repeat
  end repeat
end tell
return ""
`;
  const { stdout } = await execFileAsync("osascript", ["-e", script], { maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

async function readManualValue() {
  const value = readArg("--value");
  const valuationDate = readArg("--valuation-date");
  if (!value || !valuationDate) return null;
  const currentValue = Number.parseFloat(value.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(currentValue)) throw new Error("--value konnte nicht als Zahl gelesen werden.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valuationDate)) {
    throw new Error("--valuation-date muss im Format YYYY-MM-DD uebergeben werden.");
  }
  return {
    source: "vbv",
    displayName: "VBV Vorsorgekasse",
    currentValue: roundCurrency(currentValue),
    netValue: roundCurrency(currentValue),
    valuationDate,
    valuationMethod: "manual_quarterly_balance_v1",
    positionCount: 0,
    status: "VERIFIED",
  };
}

async function loadBalance() {
  const manual = await readManualValue();
  if (manual) return manual;

  if (process.argv.includes("--from-current-chrome")) {
    return parseVbvBalanceText(await readCurrentChromeText());
  }

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { context, page } = await launchVbvBrowser();
    try {
      await ensureVbvLogin(page);
      return await readVbvBalance(page);
    } catch (error) {
      lastError = error;
    } finally {
      await context.close().catch(() => {});
    }
  }
  throw lastError;
}

async function writeAgentFailure(error) {
  if (!writeEnabled) return;
  try {
    const firestore = new FirestoreRest({
      projectId,
      accessToken: await getFirebaseCliAccessToken(),
    });
    const previous =
      (await firestore.listDocuments("agentStatus")).find((entry) => entry.id === "vbv") ?? {};
    await firestore.setDocument("agentStatus", "vbv", {
      ...previous,
      source: "vbv",
      status: "FEHLER",
      message: error?.message ?? String(error),
      lastErrorAt: new Date(),
      updatedAt: new Date(),
    });
  } catch {
    // Preserve the original browser/login failure.
  }
}

async function main() {
  const balance = await loadBalance();
  const now = new Date();
  const dryRunSummary = {
    mode: writeEnabled ? "write" : "dry-run",
    source: "vbv",
    currentValue: roundCurrency(balance.currentValue),
    valuationDate: balance.valuationDate,
    valuationMethod: balance.valuationMethod,
  };

  if (!writeEnabled) {
    console.log(JSON.stringify(dryRunSummary, null, 2));
    console.log("[dry-run] Keine Firestore-Daten geaendert. Fuer Schreiben --write verwenden.");
    return;
  }

  const firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  const previousSummary =
    (await firestore.listDocuments("sourceSummaries")).find((summary) => summary.id === "vbv") ?? {};

  await firestore.setDocument("sourceSummaries", "vbv", {
    ...previousSummary,
    source: "vbv",
    displayName: "VBV Vorsorgekasse",
    currentValue: roundCurrency(balance.currentValue),
    netValue: roundCurrency(balance.netValue ?? balance.currentValue),
    valuationDate: balance.valuationDate,
    valuationMethod: balance.valuationMethod,
    positionCount: 0,
    status: "VERIFIED",
    updatedAt: now,
  });

  await firestore.setDocument("agentStatus", "vbv", {
    source: "vbv",
    status: "OK",
    message: `VBV Vorsorgekasse ${roundCurrency(balance.currentValue).toFixed(2)} EUR per ${balance.valuationDate}`,
    lastSuccessAt: now,
    currentValue: roundCurrency(balance.currentValue),
    valuationDate: balance.valuationDate,
  });

  console.log(JSON.stringify({ ...dryRunSummary, written: true }, null, 2));
  console.log(`[ok] VBV-Wert geschrieben: ${roundCurrency(balance.currentValue).toFixed(2)} EUR per ${balance.valuationDate}`);
}

try {
  await main();
} catch (error) {
  await writeAgentFailure(error);
  throw error;
}
