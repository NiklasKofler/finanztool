import type { AgentStatusDocument, SourceSummaryDocument } from "../firebase/sourceSummaries";
import type { PortfolioPosition, SourceOverview } from "../domain/types";

export type DashboardSourceReadiness =
  | "ready"
  | "empty_ok"
  | "non_blocking_issue"
  | "blocking_issue"
  | "paused";

export interface DashboardSourceConfig {
  id: string;
  label: string;
  group: "depot" | "bank" | "crypto" | "metal" | "pension" | "manual";
  dashboardBlocking: boolean;
  allowEmpty: boolean;
  optionalUntilFunded?: boolean;
  nonBlockingAgentIds?: string[];
  expectedData: string[];
  knownLimits?: string;
}

export interface DashboardSourceContract {
  id: string;
  label: string;
  readiness: DashboardSourceReadiness;
  dashboardBlocking: boolean;
  allowEmpty: boolean;
  isUsableForDashboards: boolean;
  currentValue: number;
  positionCount: number;
  agentStatus: string | null;
  issueCount: number;
  messages: string[];
  expectedData: string[];
  knownLimits?: string;
}

export interface DashboardDataQuality {
  sources: DashboardSourceContract[];
  totalSourceCount: number;
  totalUsableCount: number;
  dashboardRelevantCount: number;
  usableCount: number;
  blockingIssueCount: number;
  nonBlockingIssueCount: number;
  emptyAcceptedCount: number;
  readyForStandardDashboards: boolean;
  blockingSources: DashboardSourceContract[];
  nonBlockingSources: DashboardSourceContract[];
}

export const dashboardSourceConfigs: Record<string, DashboardSourceConfig> = {
  flatex: {
    id: "flatex",
    label: "Flatex",
    group: "depot",
    dashboardBlocking: true,
    allowEmpty: false,
    expectedData: ["Bestand", "Cash", "Kurse", "Einstand", "Kosten", "Steuern", "Dokumente"],
  },
  traderepublic: {
    id: "traderepublic",
    label: "Trade Republic",
    group: "depot",
    dashboardBlocking: true,
    allowEmpty: false,
    expectedData: ["Portalbestand", "Cash", "Kurse", "Einstand", "Zinsen", "Transaktionen"],
  },
  ginmon: {
    id: "ginmon",
    label: "Ginmon",
    group: "depot",
    dashboardBlocking: true,
    allowEmpty: false,
    expectedData: ["Depotwerte", "Barwerte", "Dokumentstand", "API-Kurse", "Kosten"],
  },
  intergold: {
    id: "intergold",
    label: "Intergold",
    group: "metal",
    dashboardBlocking: true,
    allowEmpty: false,
    expectedData: ["Bestand", "Einstand", "Ankaufspreise", "Verkaufspreise", "Belege"],
  },
  bitget: {
    id: "bitget",
    label: "Bitget",
    group: "crypto",
    dashboardBlocking: true,
    allowEmpty: false,
    expectedData: ["Wallets", "Positionen", "Kurse", "Ledger", "Gebuehren", "Earn/Zinsen"],
  },
  capitalcom: {
    id: "capitalcom",
    label: "Capital.com",
    group: "depot",
    dashboardBlocking: false,
    allowEmpty: true,
    optionalUntilFunded: true,
    expectedData: ["Cash", "Offene Positionen", "Transaktionen"],
    knownLimits: "Aktuell zurueckgestellt beziehungsweise 0-Stand; darf Dashboards nicht blockieren.",
  },
  trading212: {
    id: "trading212",
    label: "Trading 212",
    group: "depot",
    dashboardBlocking: false,
    allowEmpty: true,
    optionalUntilFunded: true,
    expectedData: ["Cash", "Positionen", "Dividenden", "Orders", "Transaktionen"],
    knownLimits: "Aktuell angebunden, aber ohne materiellen Bestand; darf Dashboards nicht blockieren.",
  },
  vbv: {
    id: "vbv",
    label: "VBV Vorsorgekasse",
    group: "pension",
    dashboardBlocking: true,
    allowEmpty: false,
    expectedData: ["Kontoinformation", "Beitraege", "Kosten", "Ergebnis", "Garantie"],
  },
  equateplus: {
    id: "equateplus",
    label: "EquatePlus",
    group: "manual",
    dashboardBlocking: true,
    allowEmpty: false,
    expectedData: ["Manuelle Anteile", "Einstand EUR", "SIX-Kurs", "Tagesaenderung"],
  },
  bank_accounts: {
    id: "bank_accounts",
    label: "Bankkonten",
    group: "bank",
    dashboardBlocking: true,
    allowEmpty: true,
    nonBlockingAgentIds: ["bank99", "n26"],
    expectedData: ["Geldstand", "Kreditlinien", "Kreditkarten", "Transaktionen"],
    knownLimits: "bank99 und N26 sind niedrig priorisiert und hart limitiert; Fehler dort blockieren Portfolio-Dashboards nicht.",
  },
};

const statusRank: Record<string, number> = {
  OK: 0,
  RUNNING: 1,
  WARNUNG: 2,
  FEHLER: 3,
  ERROR: 3,
};

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getWorstAgentStatus(statuses: AgentStatusDocument[]) {
  return statuses.reduce<string | null>((worst, status) => {
    const next = status.status ?? null;
    if (!next) return worst;
    if (!worst) return next;
    return (statusRank[next] ?? 1) > (statusRank[worst] ?? 1) ? next : worst;
  }, null);
}

function isIssueStatus(status?: string | null) {
  return status === "WARNUNG" || status === "FEHLER" || status === "ERROR";
}

function getIssueMessage(status: AgentStatusDocument) {
  return status.message ?? status.runSummary ?? `${status.id} meldet ${status.status ?? "keinen OK-Status"}.`;
}

export function getDashboardSourceConfig(sourceId: string): DashboardSourceConfig {
  return (
    dashboardSourceConfigs[sourceId] ?? {
      id: sourceId,
      label: sourceId,
      group: "depot",
      dashboardBlocking: true,
      allowEmpty: false,
      expectedData: ["Wert", "Positionen", "Aktualisierungsstand"],
    }
  );
}

export function buildDashboardDataQuality(input: {
  sources: SourceOverview[];
  summaries: Record<string, SourceSummaryDocument>;
  positionsBySource: Record<string, PortfolioPosition[]>;
  agentStatuses: Record<string, AgentStatusDocument>;
  sourceAgentIds: Record<string, string | string[]>;
}): DashboardDataQuality {
  const contracts = input.sources.map<DashboardSourceContract>((source) => {
    const config = getDashboardSourceConfig(source.id);
    const summary = input.summaries[source.summaryId ?? source.id];
    const positions = input.positionsBySource[source.id] ?? [];
    const agentIds = input.sourceAgentIds[source.id];
    const agentIdList = Array.isArray(agentIds) ? agentIds : agentIds ? [agentIds] : [];
    const agentStatusDocs = agentIdList
      .map((id) => input.agentStatuses[id])
      .filter((status): status is AgentStatusDocument => Boolean(status));
    const nonBlockingIds = new Set(config.nonBlockingAgentIds ?? []);
    const blockingIssues = agentStatusDocs.filter(
      (status) => isIssueStatus(status.status) && !nonBlockingIds.has(status.id),
    );
    const nonBlockingIssues = agentStatusDocs.filter(
      (status) => isIssueStatus(status.status) && nonBlockingIds.has(status.id),
    );
    const currentValue = toFiniteNumber(
      summary?.currentValue ?? summary?.netValue ?? summary?.depotValue ?? source.currentValue ?? source.netValue,
    );
    const hasValue = Math.abs(currentValue) > 0.005;
    const hasPositions = positions.length > 0 || toFiniteNumber(summary?.positionCount) > 0;
    const emptyButAccepted = !hasValue && !hasPositions && config.allowEmpty;
    const agentStatus = getWorstAgentStatus(agentStatusDocs) ?? source.agentStatus ?? null;

    let readiness: DashboardSourceReadiness = "ready";
    if (blockingIssues.length > 0 && config.dashboardBlocking) {
      readiness = "blocking_issue";
    } else if (nonBlockingIssues.length > 0 || blockingIssues.length > 0) {
      readiness = "non_blocking_issue";
    } else if (emptyButAccepted) {
      readiness = "empty_ok";
    } else if (!hasValue && !hasPositions && !config.allowEmpty) {
      readiness = config.dashboardBlocking ? "blocking_issue" : "paused";
    }

    const issueMessages = [
      ...blockingIssues.map(getIssueMessage),
      ...nonBlockingIssues.map(getIssueMessage),
    ];
    if (readiness === "blocking_issue" && issueMessages.length === 0) {
      issueMessages.push("Keine verwertbaren Werte oder Positionen vorhanden.");
    }
    if (readiness === "empty_ok" && config.knownLimits) {
      issueMessages.push(config.knownLimits);
    }

    return {
      id: source.id,
      label: config.label,
      readiness,
      dashboardBlocking: config.dashboardBlocking,
      allowEmpty: config.allowEmpty,
      isUsableForDashboards: readiness !== "blocking_issue" || !config.dashboardBlocking,
      currentValue,
      positionCount: positions.length || summary?.positionCount || 0,
      agentStatus,
      issueCount: blockingIssues.length + nonBlockingIssues.length,
      messages: issueMessages,
      expectedData: config.expectedData,
      knownLimits: config.knownLimits,
    };
  });

  const dashboardRelevant = contracts.filter((source) => source.dashboardBlocking);
  const blockingSources = contracts.filter((source) => source.readiness === "blocking_issue" && source.dashboardBlocking);
  const nonBlockingSources = contracts.filter(
    (source) => source.readiness === "non_blocking_issue" || (!source.dashboardBlocking && source.readiness === "blocking_issue"),
  );

  return {
    sources: contracts,
    totalSourceCount: contracts.length,
    totalUsableCount: contracts.filter((source) => source.isUsableForDashboards).length,
    dashboardRelevantCount: dashboardRelevant.length,
    usableCount: dashboardRelevant.filter((source) => source.isUsableForDashboards).length,
    blockingIssueCount: blockingSources.length,
    nonBlockingIssueCount: nonBlockingSources.length,
    emptyAcceptedCount: contracts.filter((source) => source.readiness === "empty_ok").length,
    readyForStandardDashboards: blockingSources.length === 0,
    blockingSources,
    nonBlockingSources,
  };
}
