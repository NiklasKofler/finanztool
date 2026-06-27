import "dotenv/config";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";

const expectedSources = [
  "flatex",
  "traderepublic",
  "ginmon",
  "intergold",
  "bitget",
  "capitalcom",
  "vbv",
  "equateplus",
  "bank_accounts",
];
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
  traderepublic_portal: 24,
  ginmon: 48,
  intergold: 72,
  bitget: 6,
  bitget_ledger: 26,
  capitalcom: 6,
  quotes: 2,
  vbv: 100 * 24,
  equateplus: 26,
  bank_accounts: 26,
  bank99: 26,
  amazon_visa: 4,
  tfbank: 4,
};
const obsoleteAgentStatusIds = new Set([
  "traderepublic_mail",
  "traderepublic_manual_exports",
]);
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
    text.includes("credit_card") ||
    text.includes("kreditkarte") ||
    text.includes("geldkonto") ||
    text.includes("kontostand") ||
    /(^|\s)(eur|usdt)($|\s)/.test(text)
  );
}

function documentValuationConfig(position) {
  return documentValuedInstruments[position.source]?.[position.isin] ?? null;
}

function documentValuationDate(position) {
  return parseDate(
    position.valuationDate ??
      position.brokerQuoteAsOf ??
      position.quoteAsOf ??
      position.brokerSnapshotDate ??
      position.documentDataUpdatedAt ??
      position.updatedAt,
  );
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

function sanitizeId(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function accountAgentStatusId(account, fallbackSource) {
  const configuredAgent = normalizeId(account.agentStatusId);
  if (configuredAgent) return configuredAgent;

  for (const candidate of [account.providerSource, account.bankKey]) {
    const normalized = normalizeId(candidate);
    if (normalized && staleHoursByAgent[normalized]) return normalized;
  }

  return fallbackSource;
}

function accountHealthLabel(account) {
  return (
    account.label ??
    account.bankName ??
    account.accountId ??
    account.providerAccountId ??
    "Konto"
  );
}

function activeReviewDecisions(decisions) {
  return decisions.filter(
    (decision) =>
      decision.status !== "REVOKED" &&
      ["covered", "not_relevant", "deferred"].includes(decision.decision),
  );
}

function isGenericUnclassifiedDocumentType(documentType) {
  const normalized = String(documentType ?? "").toLowerCase();
  return (
    !normalized ||
    normalized === "unknown" ||
    normalized === "unknown_document" ||
    normalized === "unknown_portal_document" ||
    normalized === "unparsed" ||
    normalized === "unclassified"
  );
}

function reviewDecisionMatchesIssue(decision, issue) {
  if (!decision || decision.source !== issue.source) return false;
  if (decision.scope === "document_type") {
    const issueLabel = issue.portalDocumentLabel ?? issue.fileName ?? issue.documentType;
    const issueType = issue.documentType ?? issue.factType;
    if (
      decision.targetLabel &&
      !isGenericUnclassifiedDocumentType(decision.targetLabel) &&
      decision.targetLabel === issueLabel
    ) {
      return true;
    }
    if (isGenericUnclassifiedDocumentType(decision.targetDocumentType)) return false;
    return Boolean(decision.targetDocumentType && decision.targetDocumentType === issueType);
  }

  return Boolean(
    decision.targetId === issue.id ||
      (decision.targetSignature &&
        decision.targetSignature === (issue.portalTransactionSignature ?? issue.fileHash ?? issue.baselineId)),
  );
}

function isIssueResolvedByDecision(issue, decisions) {
  return decisions.some((decision) => reviewDecisionMatchesIssue(decision, issue));
}

function accountIdFromPosition(position) {
  return (
    position.accountNumber ??
    position.accountId ??
    position.accountKey ??
    position.portfolioId ??
    position.accountType ??
    position.walletType ??
    null
  );
}

function accountLabelFromPosition(position, accountId) {
  return (
    position.portfolioLabel ??
    position.accountLabel ??
    position.accountName ??
    position.accountType ??
    accountId
  );
}

function observedAccountsFromData(summaries, positions) {
  const accounts = new Map();

  for (const summary of summaries) {
    for (const account of summary.accounts ?? []) {
      const accountId = account.accountNumber ?? account.accountId ?? account.customerId ?? account.id;
      if (!accountId) continue;
      const source = summary.source ?? summary.id;
      const id = `${source}_${sanitizeId(accountId)}`;
      accounts.set(id, {
        id,
        source,
        fromSummary: true,
        accountId: String(accountId),
        accountNumber: account.accountNumber ?? null,
        customerId: account.customerId ?? null,
        label: account.label ?? account.strategy ?? account.name ?? String(accountId),
        currentValue: parseMaybeNumber(account.currentValue),
        cashValue: parseMaybeNumber(account.cashValue),
        positionCount: account.positionCount ?? null,
        valuationDate: account.valuationDate ?? summary.valuationDate ?? null,
      });
    }
  }

  for (const position of positions) {
    if (!expectedSources.includes(position.source)) continue;
    const accountId = accountIdFromPosition(position);
    if (!accountId) continue;
    const id = `${position.source}_${sanitizeId(accountId)}`;
    const existing = accounts.get(id);
    const currentValue = parseMaybeNumber(position.currentValue);
    if (existing?.fromSummary) continue;
    accounts.set(id, {
      id,
      source: position.source,
      accountId: String(accountId),
      accountNumber: position.accountNumber ?? existing?.accountNumber ?? null,
      customerId: position.customerId ?? existing?.customerId ?? null,
      label: existing?.label ?? accountLabelFromPosition(position, accountId),
      currentValue: roundCurrency((existing?.currentValue ?? 0) + (currentValue ?? 0)),
      cashValue: existing?.cashValue ?? null,
      positionCount: (existing?.positionCount ?? 0) + 1,
      valuationDate: existing?.valuationDate ?? position.valuationDate ?? null,
    });
  }

  for (const summary of summaries) {
    const source = summary.source ?? summary.id;
    if (!expectedSources.includes(source)) continue;
    if ([...accounts.values()].some((account) => account.source === source)) continue;
    const currentValue = parseMaybeNumber(summary.currentValue ?? summary.netValue);
    if (currentValue === null) continue;
    const id = `${source}_default`;
    accounts.set(id, {
      id,
      source,
      accountId: "default",
      accountNumber: null,
      customerId: null,
      label: summary.displayName ?? source,
      currentValue,
      cashValue: parseMaybeNumber(summary.cashValue),
      positionCount: summary.positionCount ?? null,
      valuationDate: summary.valuationDate ?? null,
    });
  }

  return accounts;
}

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});

const now = new Date();
const [positions, summaries, statuses, mappings, imports, sourceAccounts, sourceDocuments, sourceDocumentFacts, documentReviewDecisions] = await Promise.all([
  firestore.listDocuments("sourcePositions"),
  firestore.listDocuments("sourceSummaries"),
  firestore.listDocuments("agentStatus"),
  firestore.listDocuments("instrumentMappings"),
  firestore.listDocuments("imports"),
  firestore.listDocuments("sourceAccounts"),
  firestore.listDocuments("sourceDocuments"),
  firestore.listDocuments("sourceDocumentFacts"),
  firestore.listDocuments("documentReviewDecisions"),
]);

const alerts = [];
const statusById = new Map(statuses.map((status) => [status.id, status]));
const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
const observedAccounts = observedAccountsFromData(summaries, positions);
const previousAccountsById = new Map(sourceAccounts.map((account) => [account.id, account]));
const observedSources = new Set([...observedAccounts.values()].map((account) => account.source));
const activeDecisions = activeReviewDecisions(documentReviewDecisions);
const portalSuccessSignatures = new Set(
  sourceDocumentFacts
    .filter((fact) => fact.source === "traderepublic")
    .filter((fact) => ["traderepublic_portal_web", "traderepublic_portal_dom"].includes(fact.sourceChannel))
    .filter((fact) => !["portal_document_failure", "portal_document_application"].includes(fact.factType))
    .map((fact) => fact.portalTransactionSignature)
    .filter(Boolean),
);
const unresolvedPortalFailures = sourceDocumentFacts.filter(
  (fact) =>
    fact.source === "traderepublic" &&
    fact.factType === "portal_document_failure" &&
    !portalSuccessSignatures.has(fact.portalTransactionSignature) &&
    !isIssueResolvedByDecision(fact, activeDecisions),
);

for (const account of observedAccounts.values()) {
  const { fromSummary: _fromSummary, ...accountData } = account;
  const previous = previousAccountsById.get(account.id);
  const sourceHadBaseline = sourceAccounts.some((entry) => entry.source === account.source);
  if (!previous && sourceHadBaseline) {
    alerts.push(
      alert(
        `new_account_${account.id}`,
        "warning",
        "Neues Depot erkannt",
        `${accountData.source}: ${accountData.label ?? accountData.accountId} wurde neu erkannt.`,
        accountData.source,
        accountData,
      ),
    );
  }
  await firestore.setDocument("sourceAccounts", account.id, {
    ...previous,
    ...accountData,
    status: "ACTIVE",
    firstSeenAt: previous?.firstSeenAt ?? now,
    lastSeenAt: now,
    missingSince: null,
    updatedAt: now,
  });
}

for (const previous of sourceAccounts) {
  if (!observedSources.has(previous.source)) continue;
  if (observedAccounts.has(previous.id)) continue;
  alerts.push(
    alert(
      `missing_account_${previous.id}`,
      "warning",
      "Depot nicht mehr gefunden",
      `${previous.source}: ${previous.label ?? previous.accountId ?? previous.id} wurde im aktuellen Lauf nicht mehr gefunden.`,
      previous.source,
      previous,
    ),
  );
  await firestore.setDocument("sourceAccounts", previous.id, {
    ...previous,
    status: "MISSING",
    missingSince: previous.missingSince ?? now,
    updatedAt: now,
  });
}

for (const source of expectedSources) {
  if (sourcesWithoutPositions.has(source)) continue;
  const sourcePositions = positions.filter((position) => position.source === source);
  if (sourcePositions.length === 0) {
    alerts.push(alert(`missing_positions_${source}`, "error", "Keine Positionen", `${source} hat aktuell keine Positionen in Firestore.`, source));
  }
}

for (const status of statuses) {
  const agentId = status.id;
  if (obsoleteAgentStatusIds.has(agentId)) continue;
  const reviewedTradeRepublicPortalWarning =
    agentId === "traderepublic_portal" &&
    status.status === "WARNUNG" &&
    unresolvedPortalFailures.length === 0 &&
    (status.portalDocumentUnresolvedFailureCount ?? 0) > 0;
  if (status.status && status.status !== "OK" && status.status !== "RUNNING" && !reviewedTradeRepublicPortalWarning) {
    alerts.push(
      alert(
        `agent_status_${agentId}`,
        "error",
        `Agent ${agentId}: FEHLER`,
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
          "error",
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
    alerts.push(alert(`missing_agent_${source}`, "error", "Agentstatus fehlt", `Fuer ${source} gibt es keinen Agentstatus.`, source));
  }
}

const bankAccountsSummary = summaryById.get("bank_accounts");
for (const account of bankAccountsSummary?.accounts ?? []) {
  const agentId = accountAgentStatusId(account, "bank_accounts");
  const agentStatus = statusById.get(agentId);
  if (!agentStatus) {
    const label = accountHealthLabel(account);
    alerts.push(
      alert(
        `missing_account_agent_${sanitizeId(agentId)}_${sanitizeId(account.accountId ?? account.providerAccountId ?? label)}`,
        "error",
        "Konto-Agentstatus fehlt",
        `${label}: ${agentId} hat keinen Agentstatus.`,
        "bank_accounts",
        {
          accountId: account.accountId ?? null,
          providerAccountId: account.providerAccountId ?? null,
          label,
          bankKey: account.bankKey ?? null,
          providerSource: account.providerSource ?? null,
          agentStatusId: agentId,
        },
      ),
    );
  }
}

for (const position of positions) {
  if (!expectedSources.includes(position.source)) continue;
  if (position.source === "bitget" && position.quoteStatus === "NO_BITGET_PRICE") {
    alerts.push(
      alert(
        `bitget_no_price_${position.id}`,
        "warning",
        "Bitget-Position ohne Bitget-Kurs",
        `Bitget liefert ${position.name ?? position.id} als Bestand, aber keinen Bitget-Kurs fuer die EUR-Bewertung.`,
        "bitget",
        {
          id: position.id,
          name: position.name ?? null,
          quantity: position.quantity ?? null,
          accountType: position.accountType ?? null,
        },
      ),
    );
  }
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

const bitgetSummary = summaryById.get("bitget");
if (bitgetSummary) {
  const bitgetDifference = parseMaybeNumber(bitgetSummary.positionSummaryDifference);
  const bitgetAccountValue = parseMaybeNumber(
    bitgetSummary.exchangeAccountValue ?? bitgetSummary.netValue ?? bitgetSummary.currentValue,
  );
  const allowedDifference =
    bitgetAccountValue !== null ? Math.max(10, Math.abs(bitgetAccountValue) * 0.01) : 10;

  if (bitgetDifference !== null && Math.abs(bitgetDifference) > allowedDifference) {
    alerts.push(
      alert(
        "bitget_summary_position_mismatch",
        "warning",
        "Bitget-Kontowert weicht von Positionssumme ab",
        `Bitget-Kontowert und bewertete Positionssumme unterscheiden sich um ${roundCurrency(
          bitgetDifference,
        ).toFixed(2)} EUR.`,
        "bitget",
        {
          accountValue: bitgetAccountValue,
          includedPositionsValue: parseMaybeNumber(bitgetSummary.includedPositionsValue),
          positionsValue: parseMaybeNumber(bitgetSummary.positionsValue),
          allowedDifference,
        },
      ),
    );
  }
}

const flatexSummary = summaryById.get("flatex");
if (flatexSummary) {
  const depotValue = parseMaybeNumber(flatexSummary.depotValue ?? flatexSummary.currentValue);
  const brokerPositionValue = parseMaybeNumber(flatexSummary.brokerPositionValue);
  const brokerPositionDifference = parseMaybeNumber(flatexSummary.brokerPositionSummaryDifference);
  const externalQuoteValue = parseMaybeNumber(flatexSummary.externalQuoteDepotValue);
  const externalQuoteDifference = parseMaybeNumber(flatexSummary.externalQuoteDifference);
  const allowedBrokerDifference = depotValue !== null ? Math.max(5, Math.abs(depotValue) * 0.0025) : 5;
  const allowedQuoteDifference = depotValue !== null ? Math.max(500, Math.abs(depotValue) * 0.02) : 500;

  if (brokerPositionDifference !== null && Math.abs(brokerPositionDifference) > allowedBrokerDifference) {
    alerts.push(
      alert(
        "flatex_broker_position_mismatch",
        "warning",
        "Flatex-Brokerwert passt nicht zur Positionsliste",
        `Flatex Depotwert und Broker-Positionssumme unterscheiden sich um ${roundCurrency(
          brokerPositionDifference,
        ).toFixed(2)} EUR.`,
        "flatex",
        {
          depotValue,
          brokerPositionValue,
          allowedBrokerDifference,
        },
      ),
    );
  }

  if (externalQuoteDifference !== null && Math.abs(externalQuoteDifference) > allowedQuoteDifference) {
    alerts.push(
      alert(
        "flatex_external_quote_mismatch",
        "warning",
        "Flatex-Brokerwert weicht von Marktkurs-Bewertung ab",
        `Flatex Brokerwert und Boerse-Frankfurt-Bewertung unterscheiden sich um ${roundCurrency(
          externalQuoteDifference,
        ).toFixed(2)} EUR.`,
        "flatex",
        {
          depotValue,
          externalQuoteValue,
          allowedQuoteDifference,
        },
      ),
    );
  }
}

const unclassifiedDocuments = sourceDocuments.filter(
  (document) =>
    expectedSources.includes(document.source) &&
    !isIssueResolvedByDecision(document, activeDecisions) &&
    (document.documentType === "unknown" ||
      document.documentType === "unknown_portal_document" ||
      document.parseStatus === "UNKNOWN" ||
      document.parseStatus === "UNPARSED"),
);

if (unclassifiedDocuments.length) {
  alerts.push(
    alert(
      "unclassified_documents",
      "warning",
      "Unbekannte Dokumente im Postfach",
      `${unclassifiedDocuments.length} unbekannte Dokumente im Postfach.`,
      null,
      unclassifiedDocuments.slice(0, 12).map((document) => ({
        id: document.id,
        source: document.source,
        fileName: document.fileName,
        documentType: document.documentType,
        parseStatus: document.parseStatus,
        customerId: document.customerId ?? null,
        accountNumber: document.accountNumber ?? null,
        depotNumber: document.depotNumber ?? null,
        baselineId: document.baselineId ?? null,
      })),
    ),
  );
}

const unknownFacts = sourceDocumentFacts.filter(
  (fact) =>
    expectedSources.includes(fact.source) &&
    !isIssueResolvedByDecision(fact, activeDecisions) &&
    (fact.factType === "unknown" ||
      fact.factType === "unknown_portal_document" ||
      fact.parseStatus === "UNKNOWN" ||
      fact.parseStatus === "UNPARSED"),
);

if (unknownFacts.length) {
  alerts.push(
    alert(
      "unknown_document_facts",
      "warning",
      "Unbekannte Dokumentfakten erkannt",
      `${unknownFacts.length} Dokumentfakt(en) passen nicht in die bisherige Datenstruktur.`,
      null,
      unknownFacts.slice(0, 12).map((fact) => ({
        id: fact.id,
        source: fact.source,
        sourceChannel: fact.sourceChannel ?? null,
        factType: fact.factType,
        parseStatus: fact.parseStatus ?? null,
        portalDocumentLabel: fact.portalDocumentLabel ?? null,
      })),
    ),
  );
}

if (unresolvedPortalFailures.length) {
  alerts.push(
    alert(
      "traderepublic_portal_unresolved_document_failures",
      "warning",
      "Trade-Republic-Portal-Dokumente nicht abrufbar",
      `${unresolvedPortalFailures.length} Portal-Dokumentbutton(s) liefern weder PDF noch auswertbaren DOM-Fallback.`,
      "traderepublic",
      unresolvedPortalFailures.slice(0, 10).map((fact) => ({
        id: fact.id,
        label: fact.portalDocumentLabel,
        transactionTitle: fact.transactionTitle,
        transactionPortalDate: fact.transactionPortalDate,
        message: fact.message,
      })),
    ),
  );
}

for (const source of expectedSources) {
  if (source === "bitget") continue;
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
    const failedAt = parseDate(entry.updatedAt ?? entry.createdAt ?? entry.valuationDate);
    const lastSuccessAt = parseDate(matchingStatus?.lastSuccessAt ?? matchingStatus?.valuationDate);
    if (matchingStatus?.status === "OK" && failedAt && lastSuccessAt && lastSuccessAt > failedAt) {
      continue;
    }

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
