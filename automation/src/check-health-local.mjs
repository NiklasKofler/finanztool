import "dotenv/config";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";

const expectedSources = ["flatex", "traderepublic", "ginmon", "intergold", "bitget", "capitalcom", "vbv"];
const sourcesWithoutPositions = new Set(["capitalcom", "vbv"]);
const documentValuedInstruments = {
  traderepublic: {
    LU3176111881: {
      name: "Trade Republic Private Equity",
      maxAgeDays: 21,
    },
  },
};
const staleHoursByAgent = {
  flatex: 12,
  traderepublic_mail: 72,
  ginmon: 48,
  intergold: 72,
  bitget: 6,
  capitalcom: 6,
  quotes: 2,
  vbv: 100 * 24,
};

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMaybeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isCashLike(position) {
  const text = `${position.id ?? ""} ${position.name ?? ""} ${position.category ?? ""}`.toLowerCase();
  return (
    position.accountValueIncluded === false ||
    text.includes("cash") ||
    text.includes("geldkonto") ||
    text.includes("kontostand") ||
    /(^|\s)(eur|usdt)($|\s)/.test(text)
  );
}

function documentValuationConfig(position) {
  return documentValuedInstruments[position.source]?.[position.isin] ?? null;
}

function documentValuationDate(position) {
  return parseDate(position.lastTransactionDate ?? position.valuationDate ?? position.updatedAt);
}

function alert(id, severity, title, message, source = null, details = null) {
  return {
    id,
    severity,
    title,
    message,
    source,
    details,
  };
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});

const now = new Date();
const [positions, summaries, statuses, mappings, imports] = await Promise.all([
  firestore.listDocuments("sourcePositions"),
  firestore.listDocuments("sourceSummaries"),
  firestore.listDocuments("agentStatus"),
  firestore.listDocuments("instrumentMappings"),
  firestore.listDocuments("imports"),
]);

const alerts = [];
const statusById = new Map(statuses.map((status) => [status.id, status]));
const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));

for (const source of expectedSources) {
  if (sourcesWithoutPositions.has(source)) continue;
  const sourcePositions = positions.filter((position) => position.source === source);
  if (sourcePositions.length === 0) {
    alerts.push(alert(`missing_positions_${source}`, "error", "Keine Positionen", `${source} hat aktuell keine Positionen in Firestore.`, source));
  }
}

for (const status of statuses) {
  const agentId = status.id;
  if (status.status && status.status !== "OK") {
    alerts.push(
      alert(
        `agent_status_${agentId}`,
        status.status === "WARNUNG" ? "warning" : "error",
        `Agent ${agentId}: ${status.status}`,
        status.message ?? "Agent meldet keinen OK-Status.",
        status.source ?? agentId,
        status.warnings ?? null,
      ),
    );
  }
  const lastRun = parseDate(status.lastSuccessAt ?? status.updatedAt);
  const maxAgeHours = staleHoursByAgent[agentId];
  if (lastRun && maxAgeHours) {
    const ageHours = (now.getTime() - lastRun.getTime()) / 3_600_000;
    if (ageHours > maxAgeHours) {
      alerts.push(
        alert(
          `stale_agent_${agentId}`,
          "warning",
          `Agent seit ${Math.round(ageHours)} h nicht aktualisiert`,
          `${agentId} sollte spaetestens nach ${maxAgeHours} Stunden neue Daten liefern.`,
          status.source ?? agentId,
        ),
      );
    }
  }
}

for (const source of expectedSources) {
  const matchingStatus = [...statusById.values()].find((status) => status.source === source || status.id === source);
  if (!matchingStatus && source !== "traderepublic") {
    alerts.push(alert(`missing_agent_${source}`, "warning", "Agentstatus fehlt", `Fuer ${source} gibt es keinen Agentstatus.`, source));
  }
}

for (const position of positions) {
  if (!expectedSources.includes(position.source)) continue;
  if (position.accountValueIncluded !== false && parseMaybeNumber(position.currentValue) === null) {
    alerts.push(
      alert(
        `missing_value_${position.id}`,
        "error",
        "Position ohne aktuellen Wert",
        `${position.source}: ${position.name ?? position.id} hat keinen aktuellen Wert.`,
        position.source,
      ),
    );
  }
  if (!isCashLike(position) && parseMaybeNumber(position.costValue) === null && parseMaybeNumber(position.costValueQuote) === null) {
    alerts.push(
      alert(
        `missing_cost_${position.id}`,
        "warning",
        "Einstandswert fehlt",
        `${position.source}: ${position.name ?? position.id} hat keinen Einstandswert.`,
        position.source,
      ),
    );
  }
  if (!isCashLike(position) && position.isin && position.quoteStatus && position.quoteStatus !== "OK") {
    const documentConfig = documentValuationConfig(position);
    if (documentConfig) {
      const valuationDate = documentValuationDate(position);
      const ageDays = valuationDate ? (now.getTime() - valuationDate.getTime()) / 86_400_000 : null;
      if (ageDays === null || ageDays > documentConfig.maxAgeDays) {
        alerts.push(
          alert(
            `document_valuation_stale_${position.id}`,
            "warning",
            "Dokumentbewertung veraltet",
            `${documentConfig.name}: letztes Dokument ist ${
              ageDays === null ? "nicht datiert" : `${Math.round(ageDays)} Tage alt`
            }.`,
            position.source,
          ),
        );
      }
      continue;
    }
    alerts.push(
      alert(
        `quote_issue_${position.id}`,
        position.quoteStatus === "MAPPING_REQUIRED" ? "warning" : "error",
        "Kurs-Mapping fehlt",
        `${position.source}: ${position.name ?? position.isin} hat Kursstatus ${position.quoteStatus}.`,
        position.source,
      ),
    );
  }
}

for (const mapping of mappings) {
  if (mapping.status && mapping.status !== "MAPPED") {
    const mappedByDocument = positions.some(
      (position) => position.isin === mapping.isin && documentValuationConfig(position),
    );
    if (mappedByDocument) continue;
    const alreadyCoveredByPosition = positions.some(
      (position) => position.isin === mapping.isin && position.quoteStatus && position.quoteStatus !== "OK",
    );
    if (alreadyCoveredByPosition) continue;
    alerts.push(
      alert(
        `mapping_${mapping.id}`,
        mapping.status === "MAPPING_REQUIRED" ? "warning" : "error",
        "Instrument nicht gemappt",
        `${mapping.name ?? mapping.isin ?? mapping.id} ist bei ${mapping.source ?? "Kursquelle"} nicht automatisch gemappt.`,
        null,
      ),
    );
  }
}

for (const source of expectedSources) {
  const matchingStatus = statusById.get(source) ?? [...statusById.values()].find(
    (status) => status.source === source,
  );
  if (matchingStatus?.status && matchingStatus.status !== "OK") continue;

  const sourcePositions = positions.filter(
    (position) => position.source === source && position.accountValueIncluded !== false,
  );
  const summary = summaryById.get(source);
  if (!summary || sourcePositions.length === 0) continue;
  const positionTotal = roundCurrency(
    sourcePositions.reduce((sum, position) => sum + (parseMaybeNumber(position.currentValue) ?? 0), 0),
  );
  const summaryTotal = parseMaybeNumber(summary.netValue ?? summary.currentValue);
  if (summaryTotal !== null && Math.abs(positionTotal - summaryTotal) > 1) {
    alerts.push(
      alert(
        `summary_mismatch_${source}`,
        "warning",
        "Summary passt nicht zur Positionssumme",
        `${source}: Positionssumme ${positionTotal.toFixed(2)} EUR, Summary ${summaryTotal.toFixed(2)} EUR.`,
        source,
      ),
    );
  }
}

for (const entry of imports) {
  if (["FEHLER", "UNVOLLSTAENDIG", "ERROR"].includes(entry.status)) {
    const matchingStatus = entry.source
      ? statusById.get(entry.source) ?? [...statusById.values()].find((status) => status.source === entry.source)
      : null;
    if (matchingStatus?.status && matchingStatus.status !== "OK") continue;

    alerts.push(
      alert(
        `import_${entry.id}`,
        "error",
        "Importproblem",
        `${entry.source ?? "Quelle"}: ${entry.id} hat Status ${entry.status}.`,
        entry.source ?? null,
      ),
    );
  }
}

const dedupedAlerts = [...new Map(alerts.map((item) => [item.id, item])).values()];
const severityRank = { error: 0, warning: 1, info: 2 };
dedupedAlerts.sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || left.id.localeCompare(right.id));

const health = {
  status: dedupedAlerts.some((item) => item.severity === "error")
    ? "ERROR"
    : dedupedAlerts.some((item) => item.severity === "warning")
      ? "WARNUNG"
      : "OK",
  generatedAt: now,
  alertCount: dedupedAlerts.length,
  errorCount: dedupedAlerts.filter((item) => item.severity === "error").length,
  warningCount: dedupedAlerts.filter((item) => item.severity === "warning").length,
  alerts: dedupedAlerts.slice(0, 50),
};

await firestore.setDocument("systemHealth", "current", health);
console.log(JSON.stringify(health, null, 2));
