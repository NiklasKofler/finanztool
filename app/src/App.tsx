import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Cloud,
  Database,
  Eye,
  EyeOff,
  RefreshCcw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { getFirebaseServices, isFirebaseConfigured } from "./firebase/client";
import {
  loadAgentStatuses,
  loadDocumentInboxItems,
  loadSourcePositions,
  loadSourceSummaries,
  loadSystemHealth,
  loadQuoteSyncCommand,
  loadTradeRepublicPortalCommand,
  markDocumentInboxItemDecision,
  requestQuoteSync,
  requestTradeRepublicPortalRefresh,
  type AgentStatusDocument,
  type DocumentInboxItem,
  type SourceSummaryAccount,
  type SourceSummaryDocument,
  type SourceSummaryVbvAccountInformation,
} from "./firebase/sourceSummaries";
import { sourceOverviews } from "./domain/seedData";
import type { PortfolioPosition, SourceOverview, SystemHealth } from "./domain/types";

const currencyFormatter = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("de-AT", {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("de-AT", {
  style: "percent",
  maximumFractionDigits: 1,
});

const sourceSortOrder = [
  "flatex",
  "traderepublic",
  "ginmon",
  "intergold",
  "bitget",
  "capitalcom",
  "vbv",
];
const ownerEmail = "niklas.kofler@gmail.com";
type CommandRequestStatus = "idle" | "requesting" | "requested" | "running" | "error";

const agentStatusIds: Record<string, string | string[]> = {
  flatex: ["flatex", "flatex_documents"],
  traderepublic: ["traderepublic_manual_exports", "traderepublic_portal"],
  ginmon: ["ginmon", "ginmon_documents"],
  intergold: "intergold",
  bitget: ["bitget", "bitget_ledger"],
  capitalcom: "capitalcom",
  vbv: "vbv",
};

const agentStatusMeta: Record<
  string,
  { label: string; tone: "good" | "warn" | "neutral" | "info" }
> = {
  OK: { label: "OK", tone: "good" },
  WARNUNG: { label: "Warnung", tone: "warn" },
  FEHLER: { label: "Fehler", tone: "warn" },
  RUNNING: { label: "Läuft", tone: "info" },
};

const agentDisplayMeta: Record<string, { label: string; responsibility: string }> = {
  bitget: {
    label: "Bitget Import-Agent",
    responsibility: "Bestände, Wallets und aktuelle Bewertung aus der Bitget API",
  },
  bitget_ledger: {
    label: "Bitget Ledger-Agent",
    responsibility: "Transaktionen, Gebühren, Zinsen/Earn und Bewegungen aus dem Ledger",
  },
  capitalcom: {
    label: "Capital.com Agent",
    responsibility: "Kontostand, Cash und offene Positionen aus der Capital.com API",
  },
  flatex: {
    label: "Flatex Broker-Agent",
    responsibility: "Aktuelle Depot- und Kontodaten aus dem Flatex Export",
  },
  flatex_documents: {
    label: "Flatex Dokumenten-Agent",
    responsibility: "CSV- und Postfachdokumente, Bewegungen, Kosten und Dokumentfakten",
  },
  ginmon: {
    label: "Ginmon API-Agent",
    responsibility: "Aktuelle Depotwerte, Kurse, Barwerte und Konten aus der Ginmon API",
  },
  ginmon_documents: {
    label: "Ginmon Dokumenten-Agent",
    responsibility: "Ginmon-Dokumente, Bestandsnachweise, Kosten und Dokumentfakten",
  },
  intergold: {
    label: "Intergold Agent",
    responsibility: "Intergold-Webpreise, Bestand aus Belegen und Metallbewertung",
  },
  traderepublic_mail: {
    label: "Trade Republic Mail-Agent",
    responsibility: "Pausiert: automatische Duplicates-Mails werden aktuell nicht als fachlicher Kanal genutzt",
  },
  traderepublic_manual_exports: {
    label: "Trade Republic Export-Agent",
    responsibility: "Selbst gesendete Exporte ohne Betreff: Net Worth, Transaction Export und Account Statement",
  },
  traderepublic_portal: {
    label: "Trade Republic Portal-Agent",
    responsibility: "Manueller Portal-Refresh: Login, App-Bestaetigung und Transaction-History-Export aus Trade Republic",
  },
  vbv: {
    label: "VBV Agent",
    responsibility: "VBV-Portalstichtag, Kontoinformation-PDF und Vertragswerte",
  },
};

function getTradeRepublicPortalButtonLabel(
  requestStatus: CommandRequestStatus,
  portalStatus?: AgentStatusDocument,
) {
  const message = portalStatus?.message ?? "";
  if (requestStatus === "requesting") return "Anfrage";
  if (requestStatus === "requested") return "Wartet";
  if (requestStatus === "error") return "Erneut starten";
  if (requestStatus !== "running") return "Refresh";

  if (/bestaetigung|bestätigung|freigabe|approve|app/i.test(message)) return "App bestätigen";
  if (/pin/i.test(message)) return "PIN";
  if (/telefon|land|login/i.test(message)) return "Login";
  if (/portal|snapshot|portfolio|transaction|download/i.test(message)) return "Liest Portal";
  return "Läuft";
}

function formatCurrency(value?: number) {
  if (typeof value !== "number") {
    return "—";
  }

  return currencyFormatter.format(value);
}

function maskMoney(value?: number | null) {
  return typeof value === "number" ? "€€€€" : "—";
}

function maskSignedMoney(value?: number | null) {
  if (typeof value !== "number") return "—";
  if (value > 0) return "+€€€€";
  if (value < 0) return "-€€€€";
  return "±€€€€";
}

function formatMoney(value?: number | null, currency = "EUR") {
  if (typeof value !== "number") return "—";

  try {
    return new Intl.NumberFormat("de-AT", {
      style: "currency",
      currency,
      currencyDisplay: currency === "EUR" ? "symbol" : "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

function formatSignedMoney(value?: number | null, currency = "EUR") {
  if (typeof value !== "number") return "—";
  if (value === 0) return `±${formatMoney(0, currency)}`;
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(value), currency)}`;
}

function getPositionPerformance(position: PortfolioPosition) {
  if (typeof position.costValue === "number") {
    return {
      cost: position.costValue,
      performance: position.performanceValue,
      percentage: position.performancePct,
      currency: "EUR",
    };
  }

  if (
    typeof position.costValueQuote === "number" &&
    typeof position.currentValueUsdt === "number"
  ) {
    const performance = position.currentValueUsdt - position.costValueQuote;
    return {
      cost: position.costValueQuote,
      performance,
      percentage: position.costValueQuote ? performance / position.costValueQuote : null,
      currency: position.costCurrency ?? "USDT",
    };
  }

  return {
    cost: position.costValueQuote,
    performance: null,
    percentage: null,
    currency: position.costCurrency ?? "EUR",
  };
}

function formatOptionalText(value?: string | null) {
  return value?.trim() ? value : "—";
}

function getQuoteProviderLabel(position: PortfolioPosition) {
  const provider = [
    position.quoteProvider,
    position.priceSource,
    position.valuationMethod,
    position.brokerQuoteProvider,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (provider.includes("boerse-frankfurt") || provider.includes("frankfurt")) return "Frankfurt";
  if (provider.includes("traderepublic")) return "Broker";
  if (provider.includes("ginmon")) return "Ginmon API";
  if (provider.includes("bitget")) return "Bitget";
  if (provider.includes("intergold")) return "Intergold";
  if (position.quoteVenue?.trim()) return position.quoteVenue.trim();
  return null;
}

function formatQuoteText(position: PortfolioPosition) {
  const quoteText = formatOptionalText(position.quoteText);
  const provider = getQuoteProviderLabel(position);
  if (!provider) return quoteText;
  if (quoteText === "—") return provider;
  return `${quoteText} · ${provider}`;
}

function formatQuantity(position: PortfolioPosition) {
  const formatter = new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 5,
  });

  if (typeof position.quantity === "number") {
    const unit = position.quantityText?.match(/\s([A-Za-zÄÖÜäöüß.]+)\.?$/)?.[1] ?? "Stk.";
    const prefix = position.quantityEstimated ? "ca. " : "";
    return `${prefix}${formatter.format(position.quantity)} ${unit}`;
  }

  const text = position.quantityText?.trim();
  if (!text) return "—";

  const match = text.match(/^(\D*?)(-?[\d.,]+)(.*)$/);
  if (!match) return text;

  const parsed = Number.parseFloat(match[2].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(parsed)) return text;

  return `${match[1]}${formatter.format(parsed)}${match[3]}`.trim();
}

function formatPercent(value?: number | null) {
  if (typeof value !== "number") return "—";
  return percentFormatter.format(value);
}

function formatSignedPercent(value?: number | null) {
  if (typeof value !== "number") return "—";
  if (value === 0) return `±${formatPercent(0)}`;
  return `${value > 0 ? "+" : "-"}${formatPercent(Math.abs(value))}`;
}

function getPositionDayChange(position: PortfolioPosition) {
  const value =
    position.dayChangeValue ??
    position.dailyChangeValue ??
    position.dayChange ??
    (typeof position.previousCloseValue === "number" && typeof position.currentValue === "number"
      ? position.currentValue - position.previousCloseValue
      : null);
  const percentage =
    position.dayChangePct ??
    position.dailyChangePct ??
    position.dayChangePercent ??
    (typeof value === "number" && typeof position.previousCloseValue === "number" && position.previousCloseValue
      ? value / position.previousCloseValue
      : null);

  return { value, percentage };
}

function getPerformanceTone(value?: number | null) {
  if ((value ?? 0) > 0) return "positive";
  if ((value ?? 0) < 0) return "negative";
  return "neutral";
}

function parseUpdatedTimestampParts(
  value?: string | Date | { toDate: () => Date } | { seconds: number } | null,
) {
  if (!value) return { date: "Noch offen", time: "" };

  if (typeof value === "string") {
    const dateOnlyMatch = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return {
        date: `${day}.${month}.${year}`,
        time: "",
      };
    }
  }

  const date =
    value instanceof Date
      ? value
      : typeof value === "object" && "toDate" in value
        ? value.toDate()
        : typeof value === "object" && "seconds" in value
          ? new Date(value.seconds * 1000)
          : new Date(value);
  if (Number.isNaN(date.getTime())) return { date: String(value), time: "" };

  const dateText = new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

  const timeText = new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return { date: dateText, time: timeText };
}

function formatUpdatedAt(
  value?: string | Date | { toDate: () => Date } | { seconds: number } | null,
) {
  const parts = parseUpdatedTimestampParts(value);
  if (!parts.date && !parts.time) {
    return "";
  }

  return `${parts.date}${parts.time ? `\u00A0${parts.time}` : ""}`;
}

function getSourcePrimaryTimestamp(source: SourceOverview) {
  if (source.quoteDataUpdatedAt || source.latestQuoteAsOf) {
    return {
      label: "Kursstand",
      value: source.quoteDataUpdatedAt ?? source.latestQuoteAsOf,
    };
  }
  if (source.sourceDataUpdatedAt || source.valuationDate) {
    return {
      label: source.id === "vbv" ? "VBV-Stand" : "Datenstand",
      value: source.sourceDataUpdatedAt ?? source.valuationDate,
    };
  }
  return {
    label: source.agentStatus && source.agentStatus !== "OK" ? "Letzter Erfolg" : "Aktualisiert",
    value: source.updatedAt,
  };
}

function getPositionDisplayUpdatedAt(position: PortfolioPosition) {
  return position.quoteAsOf ?? position.valuationDate ?? position.updatedAt;
}

function getTrackedTotal(sources: SourceOverview[]) {
  return sources.reduce((sum, source) => sum + (getSourceDisplayValue(source) ?? 0), 0);
}

function getSourceDisplayValue(source: SourceOverview) {
  if (typeof source.netValue === "number") return source.netValue;
  if (typeof source.depotValue === "number" && typeof source.cashValue === "number") {
    return Math.round((source.depotValue + source.cashValue) * 100) / 100;
  }
  return source.currentValue;
}

function getUsedCreditValue(source: SourceOverview) {
  if (source.id !== "flatex" || typeof source.cashValue !== "number" || source.cashValue >= 0) return null;
  return Math.abs(source.cashValue);
}

function getSourceDepotDisplayValue(source: SourceOverview) {
  const usedCreditValue = getUsedCreditValue(source);
  const displayValue = getSourceDisplayValue(source);
  if (typeof displayValue === "number" && typeof usedCreditValue === "number") {
    return Math.round((displayValue + usedCreditValue) * 100) / 100;
  }
  return displayValue ?? source.depotValue;
}

function sourceUsesAuthoritativeSummary(sourceId: string) {
  return sourceId === "bitget";
}

function getAccountLabel(account: SourceSummaryAccount) {
  return (
    account.label?.trim() ||
    account.strategy?.trim() ||
    account.accountNumber?.trim() ||
    account.customerId?.trim() ||
    "Depot"
  );
}

function getPositionSortValue(position: PortfolioPosition) {
  const sourceIndex = sourceSortOrder.indexOf(position.source);
  return sourceIndex === -1 ? Number.MAX_SAFE_INTEGER : sourceIndex;
}

function isCashPosition(position: PortfolioPosition) {
  const name = position.name?.trim().toLowerCase() ?? "";
  const category = position.category?.trim().toLowerCase() ?? "";
  return (
    category.includes("cash") ||
    name.includes("geldkonto") ||
    name.includes("kontostand") ||
    name === "eur" ||
    name === "usdt"
  );
}

function getIncludedPositionValue(position: PortfolioPosition) {
  if (position.accountValueIncluded === false) return 0;
  return typeof position.currentValue === "number" ? position.currentValue : 0;
}

function getPositionAccountKey(position: PortfolioPosition) {
  return (
    position.accountNumber?.trim() ||
    position.accountId?.trim() ||
    position.customerId?.trim() ||
    position.portfolioId?.trim() ||
    "default"
  );
}

function getPositionAccountLabel(position: PortfolioPosition) {
  return (
    position.portfolioLabel?.trim() ||
    position.accountId?.trim() ||
    position.accountNumber?.trim() ||
    position.customerId?.trim() ||
    "Depot"
  );
}

function SourceIcon({ source }: { source: SourceOverview }) {
  switch (source.kind) {
    case "broker":
      return <TrendingUp aria-hidden="true" />;
    case "robo":
      return <Activity aria-hidden="true" />;
    case "crypto":
      return <Wallet aria-hidden="true" />;
    case "metals":
      return <Archive aria-hidden="true" />;
    default:
      return <Database aria-hidden="true" />;
  }
}

function getSourceAgentStatusIds(sourceId: string) {
  const mapped = agentStatusIds[sourceId];
  if (!mapped) return [sourceId];
  return Array.isArray(mapped) ? mapped : [mapped];
}

function getSourceAgentStatuses(
  sourceId: string,
  agentStatuses: Record<string, AgentStatusDocument>,
) {
  return getSourceAgentStatusIds(sourceId)
    .map((id) => agentStatuses[id])
    .filter(Boolean) as AgentStatusDocument[];
}

function getSourceAgentStatus(
  sourceId: string,
  agentStatuses: Record<string, AgentStatusDocument>,
) {
  const statuses = getSourceAgentStatuses(sourceId, agentStatuses);
  if (!statuses.length) return undefined;
  const rank: Record<string, number> = {
    FEHLER: 3,
    WARNUNG: 2,
    RUNNING: 1,
    OK: 0,
  };

  return [...statuses].sort((first, second) => {
    const rankFirst = typeof first.status === "string" ? (rank[first.status] ?? -1) : -1;
    const rankSecond = typeof second.status === "string" ? (rank[second.status] ?? -1) : -1;
    return rankSecond - rankFirst;
  })[0];
}

function getSourceAgentRunViews(
  sourceId: string,
  agentStatuses: Record<string, AgentStatusDocument>,
) {
  return getSourceAgentStatusIds(sourceId).map((id) => {
    const meta = agentDisplayMeta[id] ?? {
      label: id,
      responsibility: "Agentstatus dieser Quelle",
    };
    return {
      id,
      ...meta,
      status: agentStatuses[id],
    };
  });
}

function getAgentRunTimestamp(status?: AgentStatusDocument) {
  return status?.lastAgentRunAt ?? status?.updatedAt ?? status?.lastSuccessAt ?? status?.lastAgentSuccessAt ?? null;
}

function getAgentSuccessTimestamp(status?: AgentStatusDocument) {
  return status?.lastAgentSuccessAt ?? status?.lastSuccessAt ?? null;
}

function getAgentDetailLines(status?: AgentStatusDocument) {
  if (!status) return [];
  const lines: string[] = [];
  if (typeof status.portalDocumentUnresolvedFailureCount === "number" && status.portalDocumentUnresolvedFailureCount > 0) {
    lines.push(`${status.portalDocumentUnresolvedFailureCount} Portal-Dokumentfehler ungelöst`);
  } else if (typeof status.portalDocumentFailedCount === "number" && status.portalDocumentFailedCount > 0) {
    lines.push(`${status.portalDocumentFailedCount} Portal-Dokumentbutton ohne PDF`);
  }
  if (typeof status.portalDocumentDomFallbackCount === "number" && status.portalDocumentDomFallbackCount > 0) {
    lines.push(`${status.portalDocumentDomFallbackCount} DOM-Fallback(s) ausgewertet`);
  }
  if (status.portalDocumentUnknownLabels?.length) {
    lines.push(`Unbekannte Labels: ${status.portalDocumentUnknownLabels.join(", ")}`);
  }
  if (typeof status.unknownCount === "number" && status.unknownCount > 0) {
    lines.push(`${status.unknownCount} unbekannte Dokumente`);
  }
  if (typeof status.warningCount === "number" && status.warningCount > 0 && !lines.length) {
    lines.push(`${status.warningCount} Warnung(en)`);
  }
  return lines.slice(0, 3);
}

function getSourceDisplayName(sourceId: string) {
  return sourceOverviews.find((source) => source.id === sourceId)?.name ?? sourceId;
}

function getDocumentInboxDecisionLabel(item: DocumentInboxItem) {
  const decision = item.reviewDecision?.decision;
  if (decision === "covered") return "Abgedeckt";
  if (decision === "not_relevant") return "Nicht relevant";
  if (decision === "needs_parser") return "Parser nötig";
  return item.severity === "error" ? "Fehler" : "Offen";
}

function getDocumentInboxDecisionTone(item: DocumentInboxItem) {
  if (item.reviewDecision?.decision === "covered" || item.reviewDecision?.decision === "not_relevant") return "good";
  if (item.reviewDecision?.decision === "needs_parser") return "info";
  return item.severity === "error" ? "warn" : "warn";
}

function DocumentInbox({
  items,
  onClassify,
  pendingDecisionId,
}: {
  items: DocumentInboxItem[];
  onClassify: (
    item: DocumentInboxItem,
    decision: "covered" | "not_relevant" | "needs_parser",
    reason: string,
  ) => void;
  pendingDecisionId: string | null;
}) {
  const openItems = items.filter((item) => !item.reviewDecision || item.reviewDecision.decision === "needs_parser");

  if (!items.length) return null;

  return (
    <details className="document-inbox" open>
      <summary>
        <span>Offene Dokumentfälle</span>
        <strong>{numberFormatter.format(openItems.length)}</strong>
      </summary>
      <div className="document-inbox__list">
        {openItems.map((item) => {
          const isPending = pendingDecisionId === item.id;
          const isClosed = Boolean(item.reviewDecision && item.reviewDecision.decision !== "needs_parser");
          return (
            <article className={`document-inbox__row${isClosed ? " document-inbox__row--closed" : ""}`} key={item.id}>
              <div className="document-inbox__main">
                <div className="document-inbox__title">
                  <strong>{item.title}</strong>
                  <span className={`status-badge status-badge--${getDocumentInboxDecisionTone(item)}`}>
                    {getDocumentInboxDecisionLabel(item)}
                  </span>
                </div>
                <p>{item.message}</p>
                <div className="document-inbox__meta">
                  <span>{getSourceDisplayName(item.source)}</span>
                  <span>{formatUpdatedAt(item.date)}</span>
                  {item.label ? <span>{item.label}</span> : null}
                  {item.sourceChannel ? <span>{item.sourceChannel}</span> : null}
                </div>
                {item.reviewDecision?.reason ? (
                  <div className="document-inbox__decision">
                    Entscheidung: {item.reviewDecision.reason}
                  </div>
                ) : null}
              </div>
              {item.documentUrl || !isClosed ? (
                <div className="document-inbox__actions">
                  {item.documentUrl ? (
                    <a
                      className="secondary-button document-inbox__button document-inbox__button--link"
                      href={item.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDF öffnen
                    </a>
                  ) : null}
                  {!isClosed ? (
                    <>
                      <button
                        type="button"
                        className="secondary-button document-inbox__button"
                        disabled={isPending}
                        onClick={() =>
                          onClassify(
                            item,
                            "not_relevant",
                            "Welcome-Dokument; zur Ablage behalten, aber ohne Portfolio-, Kosten-, Steuer- oder Performance-Daten.",
                          )
                        }
                      >
                        Welcome-Dokument
                      </button>
                      <button
                        type="button"
                        className="secondary-button document-inbox__button"
                        disabled={isPending}
                        onClick={() =>
                          onClassify(
                            item,
                            "needs_parser",
                            "Wichtig; fachlich klaeren und Parser/Agent erweitern, bevor der Fall geschlossen wird.",
                          )
                        }
                      >
                        Wichtig
                      </button>
                      <button
                        type="button"
                        className="secondary-button document-inbox__button"
                        disabled={isPending}
                        onClick={() =>
                          onClassify(
                            item,
                            "covered",
                            "Fachlich durch bereits gespeicherte Daten abgedeckt; kein offener Importfehler.",
                          )
                        }
                      >
                        Abgedeckt
                      </button>
                      <button
                        type="button"
                        className="secondary-button document-inbox__button"
                        disabled={isPending}
                        onClick={() =>
                          onClassify(
                            item,
                            "not_relevant",
                            "Einzeldokument fuer Portfolioanalyse, Kosten, Steuern, Performance und Reconciliation bewusst nicht relevant.",
                          )
                        }
                      >
                        Nicht relevant
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </details>
  );
}

function AgentStatusBadge({
  status,
  emptyLabel = "Ohne Agent",
}: {
  status?: string | null;
  emptyLabel?: string;
}) {
  const meta = status ? (agentStatusMeta[status] ?? { label: status, tone: "neutral" as const }) : null;
  if (!meta) return <span className="status-badge status-badge--neutral">{emptyLabel}</span>;

  return <span className={`status-badge status-badge--${meta.tone}`}>{meta.label}</span>;
}

function PositionsTable({
  positions,
  privacyMode,
}: {
  positions: PortfolioPosition[];
  privacyMode: boolean;
}) {
  return (
    <div className="positions-table-wrap positions-table-wrap--embedded">
      <table className="positions-table positions-table--embedded">
        <thead>
          <tr>
            <th>Position</th>
            <th className="numeric">Wert</th>
            <th className="numeric">G/V</th>
            <th className="numeric">Perf.</th>
            <th className="numeric">Heute</th>
            <th className="numeric">Heute %</th>
            <th>Menge</th>
            <th>Kurs</th>
            <th className="numeric">Einstand</th>
            <th>Kategorie</th>
            <th>Aktualisiert</th>
          </tr>
        </thead>
        <tbody>
          {positions.length ? positions.map((position) => {
            const positionPerformance = getPositionPerformance(position);
            const performanceTone = getPerformanceTone(positionPerformance.performance);
            const dayChange = getPositionDayChange(position);

            return (
              <tr key={position.id}>
                <td className="position-name-cell">
                  <strong>{position.name}</strong>
                  <span>
                    {[position.isin, position.wkn].filter(Boolean).join(" / ") || "—"}
                  </span>
                </td>
                <td className="numeric">{privacyMode ? maskMoney(position.currentValue) : formatCurrency(position.currentValue ?? undefined)}</td>
                <td className={`numeric performance-cell performance-cell--${performanceTone}`}>
                  {privacyMode
                    ? maskSignedMoney(positionPerformance.performance)
                    : formatSignedMoney(
                      positionPerformance.performance,
                      positionPerformance.currency,
                    )}
                </td>
                <td className={`numeric performance-cell performance-cell--${performanceTone}`}>
                  {formatSignedPercent(positionPerformance.percentage)}
                </td>
                <td className="numeric">
                  {privacyMode ? maskSignedMoney(dayChange.value) : formatSignedMoney(dayChange.value)}
                </td>
                <td className="numeric">{formatSignedPercent(dayChange.percentage)}</td>
                <td>{formatQuantity(position)}</td>
                <td>{formatQuoteText(position)}</td>
                <td className="numeric">
                  {privacyMode ? maskMoney(positionPerformance.cost) : formatMoney(positionPerformance.cost, positionPerformance.currency)}
                </td>
                <td>{formatOptionalText(position.category)}</td>
                <td className="positions-table__updated-at">
                  {formatUpdatedAt(getPositionDisplayUpdatedAt(position))}
                </td>
              </tr>
            );
          }) : (
            <tr>
              <td className="empty-position-row" colSpan={11}>
                Keine Positionen geladen.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function VbvAccountInformationDetails({
  accountInformation,
  privacyMode,
}: {
  accountInformation: SourceSummaryVbvAccountInformation;
  privacyMode: boolean;
}) {
  const contracts = accountInformation.contracts ?? [];
  const summaryTone = getPerformanceTone(accountInformation.performanceValue);
  return (
    <details className="source-accounts-details vbv-account-details">
      <summary>
        <span>Kontoinformation</span>
        <strong>{numberFormatter.format(contracts.length)}</strong>
      </summary>
      <div className="vbv-account-summary">
        <div>
          <span>Gesamt</span>
          <strong>{privacyMode ? maskMoney(accountInformation.totalValue ?? undefined) : formatCurrency(accountInformation.totalValue ?? undefined)}</strong>
        </div>
        <div>
          <span>Einstand</span>
          <strong>{privacyMode ? maskMoney(accountInformation.costValue ?? undefined) : formatCurrency(accountInformation.costValue ?? undefined)}</strong>
        </div>
        <div>
          <span>G/V</span>
          <strong className={`performance-value performance-value--${summaryTone}`}>
            {privacyMode ? maskSignedMoney(accountInformation.performanceValue) : formatSignedMoney(accountInformation.performanceValue)}
            <small>{formatSignedPercent(accountInformation.performancePct)}</small>
          </strong>
        </div>
        <div>
          <span>Garantiekapital</span>
          <strong>{privacyMode ? maskMoney(accountInformation.guaranteedCapital ?? undefined) : formatCurrency(accountInformation.guaranteedCapital ?? undefined)}</strong>
        </div>
        <div>
          <span>Beiträge</span>
          <strong>{privacyMode ? maskMoney(accountInformation.contributionsTotal ?? undefined) : formatCurrency(accountInformation.contributionsTotal ?? undefined)}</strong>
        </div>
        <div>
          <span>Ergebnis netto</span>
          <strong className="performance-value performance-value--positive">
            {privacyMode ? maskSignedMoney(accountInformation.investmentResultNetTotal) : formatSignedMoney(accountInformation.investmentResultNetTotal)}
          </strong>
        </div>
        <div>
          <span>Kosten</span>
          <strong className="performance-value performance-value--negative">
            {privacyMode ? maskSignedMoney(accountInformation.totalCosts) : formatSignedMoney(accountInformation.totalCosts)}
          </strong>
        </div>
        <div>
          <span>Dokument</span>
          <strong>{formatUpdatedAt(accountInformation.statementDate)}</strong>
        </div>
      </div>
      <div className="vbv-contract-list">
        {contracts.map((contract, index) => {
          const performanceTone = getPerformanceTone(contract.performanceValue);
          return (
            <article className="vbv-contract-card" key={`${contract.employer ?? "vertrag"}-${index}`}>
              <div className="vbv-contract-card__header">
                <strong>{contract.employer ?? `Vertrag ${index + 1}`}</strong>
                <span>{privacyMode ? maskMoney(contract.closingBalance ?? undefined) : formatCurrency(contract.closingBalance ?? undefined)}</span>
              </div>
              <dl>
                <div>
                  <dt>Startwert</dt>
                  <dd>{privacyMode ? maskMoney(contract.openingBalance ?? undefined) : formatCurrency(contract.openingBalance ?? undefined)}</dd>
                </div>
                <div>
                  <dt>Beiträge {contract.contributionYear ?? ""}</dt>
                  <dd>{privacyMode ? maskMoney(contract.contributions ?? undefined) : formatCurrency(contract.contributions ?? undefined)}</dd>
                </div>
                <div>
                  <dt>Einstand</dt>
                  <dd>{privacyMode ? maskMoney(contract.costValue ?? undefined) : formatCurrency(contract.costValue ?? undefined)}</dd>
                </div>
                <div>
                  <dt>Ergebnis netto</dt>
                  <dd className="performance-value performance-value--positive">
                    {privacyMode ? maskSignedMoney(contract.investmentResultNet) : formatSignedMoney(contract.investmentResultNet)}
                  </dd>
                </div>
                <div>
                  <dt>Kosten</dt>
                  <dd className="performance-value performance-value--negative">
                    {privacyMode ? maskSignedMoney(contract.totalCosts) : formatSignedMoney(contract.totalCosts)}
                  </dd>
                </div>
                <div>
                  <dt>G/V</dt>
                  <dd className={`performance-value performance-value--${performanceTone}`}>
                    {privacyMode ? maskSignedMoney(contract.performanceValue) : formatSignedMoney(contract.performanceValue)}
                    <small>{formatSignedPercent(contract.performancePct)}</small>
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </details>
  );
}

function App() {
  const [sourceSummaries, setSourceSummaries] = useState<
    Record<string, SourceSummaryDocument>
  >({});
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatusDocument>>({});
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [documentInboxItems, setDocumentInboxItems] = useState<DocumentInboxItem[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [quoteRequestStatus, setQuoteRequestStatus] = useState<CommandRequestStatus>("idle");
  const [tradeRepublicPortalRequestStatus, setTradeRepublicPortalRequestStatus] =
    useState<CommandRequestStatus>("idle");
  const [tradeRepublicPortalRequestError, setTradeRepublicPortalRequestError] = useState<string | null>(null);
  const [pendingDocumentDecisionId, setPendingDocumentDecisionId] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<
    "auth-required" | "loading" | "live" | "blocked"
  >("auth-required");
  const [privacyMode, setPrivacyMode] = useState(false);

  useEffect(() => {
    const services = getFirebaseServices();
    if (!services) return;

    return onAuthStateChanged(services.auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      setAuthError(null);
      if (!user) {
        setSourceSummaries({});
        setAgentStatuses({});
        setPositions([]);
        setDocumentInboxItems([]);
        setSystemHealth(null);
        setDataStatus("auth-required");
      } else {
        setDataStatus("loading");
      }
    });
  }, []);

  useEffect(() => {
    const services = getFirebaseServices();
    if (!services || !authReady) return;

    if (!authUser) return;

    let isMounted = true;
    void Promise.all([
      loadSourceSummaries(services.db),
      loadAgentStatuses(services.db),
      loadSourcePositions(services.db),
      loadDocumentInboxItems(services.db),
      loadSystemHealth(services.db),
    ])
      .then(([summaries, loadedAgentStatuses, loadedPositions, loadedDocumentInboxItems, health]) => {
        if (!isMounted) return;
        setSourceSummaries(summaries);
        setAgentStatuses(loadedAgentStatuses);
        setPositions(loadedPositions);
        setDocumentInboxItems(loadedDocumentInboxItems);
        setSystemHealth(health);
        setDataStatus("live");
      })
      .catch(() => {
        if (!isMounted) return;
        setDataStatus("blocked");
      });

    return () => {
      isMounted = false;
    };
  }, [authReady, authUser]);

  async function handleGoogleSignIn() {
    const services = getFirebaseServices();
    if (!services) return;

    try {
      setAuthError(null);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ login_hint: ownerEmail });
      await signInWithPopup(services.auth, provider);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google-Anmeldung fehlgeschlagen");
    }
  }

  async function handleSignOut() {
    const services = getFirebaseServices();
    if (!services) return;
    await signOut(services.auth);
  }

  async function refreshPortfolioData() {
    const services = getFirebaseServices();
    if (!services) return;
    const [summaries, loadedAgentStatuses, loadedPositions, loadedDocumentInboxItems, health] = await Promise.all([
      loadSourceSummaries(services.db),
      loadAgentStatuses(services.db),
      loadSourcePositions(services.db),
      loadDocumentInboxItems(services.db),
      loadSystemHealth(services.db),
    ]);
    setSourceSummaries(summaries);
    setAgentStatuses(loadedAgentStatuses);
    setPositions(loadedPositions);
    setDocumentInboxItems(loadedDocumentInboxItems);
    setSystemHealth(health);
  }

  async function handleDocumentDecision(
    item: DocumentInboxItem,
    decision: "covered" | "not_relevant" | "needs_parser",
    reason: string,
  ) {
    const services = getFirebaseServices();
    if (!services || !authUser) return;

    try {
      setPendingDocumentDecisionId(item.id);
      await markDocumentInboxItemDecision(services.db, item, decision, reason, authUser.email, "item");
      const loadedDocumentInboxItems = await loadDocumentInboxItems(services.db);
      setDocumentInboxItems(loadedDocumentInboxItems);
    } finally {
      setPendingDocumentDecisionId(null);
    }
  }

  async function handleRequestQuoteSync() {
    const services = getFirebaseServices();
    if (!services || !authUser) return;

    try {
      setQuoteRequestStatus("requesting");
      await requestQuoteSync(services.db, authUser.email);
      setQuoteRequestStatus("requested");
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 4000));
        const command = await loadQuoteSyncCommand(services.db);
        if (command?.status === "RUNNING") {
          setQuoteRequestStatus("running");
          continue;
        }
        if (command?.status === "DONE") {
          await refreshPortfolioData();
          setQuoteRequestStatus("idle");
          return;
        }
        if (command?.status === "ERROR") {
          await refreshPortfolioData().catch(() => undefined);
          setQuoteRequestStatus("error");
          return;
        }
      }
      await refreshPortfolioData().catch(() => undefined);
      setQuoteRequestStatus("idle");
    } catch {
      setQuoteRequestStatus("error");
    }
  }

  async function handleRequestTradeRepublicPortalRefresh() {
    const services = getFirebaseServices();
    if (!services || !authUser) return;

    try {
      setTradeRepublicPortalRequestError(null);
      setTradeRepublicPortalRequestStatus("requesting");
      await requestTradeRepublicPortalRefresh(services.db, authUser.email);
      setTradeRepublicPortalRequestStatus("requested");
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 4000));
        const [command, loadedAgentStatuses] = await Promise.all([
          loadTradeRepublicPortalCommand(services.db),
          loadAgentStatuses(services.db),
        ]);
        setAgentStatuses(loadedAgentStatuses);
        if (command?.status === "RUNNING") {
          setTradeRepublicPortalRequestStatus("running");
          continue;
        }
        if (command?.status === "DONE") {
          await refreshPortfolioData();
          setTradeRepublicPortalRequestStatus("idle");
          return;
        }
        if (command?.status === "ERROR") {
          await refreshPortfolioData().catch(() => undefined);
          setTradeRepublicPortalRequestError(command.errorMessage ?? "Der lokale Portal-Agent hat den Auftrag mit Fehler beendet.");
          setTradeRepublicPortalRequestStatus("error");
          return;
        }
      }
      await refreshPortfolioData().catch(() => undefined);
      setTradeRepublicPortalRequestStatus("idle");
    } catch (error) {
      setTradeRepublicPortalRequestError(
        error instanceof Error ? error.message : "Der Portal-Refresh konnte nicht angefordert werden.",
      );
      setTradeRepublicPortalRequestStatus("error");
    }
  }

  const positionStatsBySource = useMemo(() => {
    const stats: Record<
      string,
      { count: number; valuedCount: number; value: number; cashValue: number; cashCount: number }
    > = {};
    for (const position of positions) {
      const current =
        stats[position.source] ?? { count: 0, valuedCount: 0, value: 0, cashValue: 0, cashCount: 0 };
      current.count += 1;
      if (position.accountValueIncluded !== false && typeof position.currentValue === "number") {
        const value = getIncludedPositionValue(position);
        current.valuedCount += 1;
        current.value += value;
        if (isCashPosition(position)) {
          current.cashValue += value;
          current.cashCount += 1;
        }
      }
      stats[position.source] = current;
    }
    return stats;
  }, [positions]);

  const sources = useMemo(
    () =>
      sourceOverviews.map((source) => {
        const summary = sourceSummaries[source.summaryId ?? source.id];
        const agentStatus = getSourceAgentStatus(source.id, agentStatuses);
        const positionStats = positionStatsBySource[source.id];
        const useAuthoritativeSummary = sourceUsesAuthoritativeSummary(source.id);
        const positionDerivedValue =
          positionStats && positionStats.valuedCount > 0
            ? Math.round(positionStats.value * 100) / 100
            : undefined;
        const positionCashValue =
          positionStats && positionStats.cashCount > 0
            ? Math.round(positionStats.cashValue * 100) / 100
            : undefined;
        const positionDepotValue =
          positionDerivedValue !== undefined
            ? Math.round((positionDerivedValue - (positionCashValue ?? 0)) * 100) / 100
            : undefined;
        if (!summary) {
          return {
            ...source,
            currentValue: useAuthoritativeSummary
              ? source.currentValue
              : positionDepotValue ?? positionDerivedValue ?? source.currentValue,
            depotValue: useAuthoritativeSummary ? source.depotValue : positionDepotValue ?? source.depotValue,
            cashValue: positionCashValue ?? source.cashValue,
            netValue: useAuthoritativeSummary ? source.netValue : positionDerivedValue ?? source.netValue,
            lastAgentSuccessAt: agentStatus?.lastAgentSuccessAt ?? agentStatus?.lastSuccessAt ?? source.lastAgentSuccessAt,
            agentStatus: agentStatus?.status,
            agentMessage: agentStatus?.message,
            updatedAt: agentStatus?.lastSuccessAt ?? source.updatedAt,
            positionCount: positionStats?.count || source.positionCount,
          };
        }
        return {
          ...source,
          currentValue: useAuthoritativeSummary
            ? summary.currentValue ?? summary.netValue ?? source.currentValue
            : positionDepotValue ?? positionDerivedValue ?? summary.currentValue ?? source.currentValue,
          depotValue: useAuthoritativeSummary
            ? summary.currentValue ?? summary.netValue ?? summary.depotValue ?? source.depotValue
            : positionDepotValue ?? summary.depotValue ?? source.depotValue,
          saleValue: summary.saleValue ?? source.saleValue,
          cashValue: positionCashValue ?? summary.cashValue ?? source.cashValue,
          netValue: useAuthoritativeSummary
            ? summary.netValue ?? summary.currentValue ?? source.netValue
            : positionDerivedValue ?? summary.netValue ?? source.netValue,
          availableCash: summary.availableCash ?? source.availableCash,
          availableWithCredit: summary.availableWithCredit ?? source.availableWithCredit,
          creditLineEstimate: summary.creditLineEstimate ?? source.creditLineEstimate,
          valuationDate: summary.valuationDate ?? source.valuationDate,
          sourceDataUpdatedAt: summary.sourceDataUpdatedAt ?? source.sourceDataUpdatedAt,
          sourceDataProvider: summary.sourceDataProvider ?? source.sourceDataProvider,
          documentDataUpdatedAt: summary.documentDataUpdatedAt ?? source.documentDataUpdatedAt,
          documentDataProvider: summary.documentDataProvider ?? source.documentDataProvider,
          quoteDataUpdatedAt: summary.quoteDataUpdatedAt ?? source.quoteDataUpdatedAt,
          quoteDataProvider: summary.quoteDataProvider ?? source.quoteDataProvider,
          quoteDataChangedAt: summary.quoteDataChangedAt ?? source.quoteDataChangedAt,
          lastAgentRunAt: summary.lastAgentRunAt ?? agentStatus?.lastAgentRunAt ?? source.lastAgentRunAt,
          lastAgentSuccessAt:
            summary.lastAgentSuccessAt ?? agentStatus?.lastAgentSuccessAt ?? agentStatus?.lastSuccessAt ?? source.lastAgentSuccessAt,
          lastDataChangeAt: summary.lastDataChangeAt ?? source.lastDataChangeAt,
          latestQuoteAsOf: summary.latestQuoteAsOf ?? null,
          oldestQuoteAsOf: summary.oldestQuoteAsOf ?? null,
          quoteUpdatedAt: summary.quoteUpdatedAt ?? null,
          quoteFreshness: summary.quoteFreshness ?? null,
          agentStatus: agentStatus?.status,
          agentMessage: agentStatus?.message,
          updatedAt:
            summary.latestQuoteAsOf ??
            summary.valuationDate ??
            agentStatus?.lastSuccessAt ??
            summary.updatedAt ??
            source.updatedAt,
          positionCount:
            positionStats?.count ||
            summary.positionCount ||
            source.positionCount,
        };
      }),
    [agentStatuses, positionStatsBySource, sourceSummaries],
  );

  const trackedTotal = getTrackedTotal(sources);
  const portfolioPerformanceBase = positions.reduce(
    (totals, position) => {
      if (position.accountValueIncluded === false || isCashPosition(position)) return totals;
      const performance = getPositionPerformance(position);
      if (typeof performance.performance !== "number") return totals;
      return {
        cost: totals.cost + (typeof performance.cost === "number" ? performance.cost : 0),
        performance: totals.performance + performance.performance,
        count: totals.count + 1,
      };
    },
    { cost: 0, performance: 0, count: 0 },
  );
  const portfolioPerformance =
    portfolioPerformanceBase.count > 0 ? portfolioPerformanceBase.performance : null;
  const portfolioPerformancePct =
    portfolioPerformanceBase.cost && portfolioPerformance !== null
      ? portfolioPerformance / portfolioPerformanceBase.cost
      : null;
  const portfolioDayChangeBase = positions.reduce((totals, position) => {
    if (position.accountValueIncluded === false) return totals;
    const { value } = getPositionDayChange(position);
    if (typeof value !== "number") return totals;
    return { value: totals.value + value, count: totals.count + 1 };
  }, { value: 0, count: 0 });
  const portfolioDayChange =
    portfolioDayChangeBase.count > 0 ? portfolioDayChangeBase.value : null;
  const portfolioPreviousValue =
    typeof portfolioDayChange === "number" ? trackedTotal - portfolioDayChange : null;
  const portfolioDayChangePct =
    portfolioPreviousValue && portfolioDayChange ? portfolioDayChange / portfolioPreviousValue : null;
  const portfolioPerformanceTone = getPerformanceTone(portfolioPerformance);
  const activeSources = sources.filter(
    (source) =>
      typeof getSourceDisplayValue(source) === "number" ||
      (source.positionCount ?? 0) > 0,
  ).length;
  const displayedPositions = useMemo(
    () =>
      positions
        .sort((left, right) => {
          const sourceDelta = getPositionSortValue(left) - getPositionSortValue(right);
          if (sourceDelta !== 0) return sourceDelta;
          const leftAccount = getPositionAccountKey(left);
          const rightAccount = getPositionAccountKey(right);
          const accountDelta = leftAccount.localeCompare(rightAccount);
          if (accountDelta !== 0) return accountDelta;
          return (right.currentValue ?? 0) - (left.currentValue ?? 0);
        }),
    [positions],
  );
  const displayedPositionsBySource = useMemo(() => {
    const grouped: Record<string, PortfolioPosition[]> = {};
    for (const position of displayedPositions) {
      const group = grouped[position.source] ?? [];
      group.push(position);
      grouped[position.source] = group;
    }
    return grouped;
  }, [displayedPositions]);
  const visibleAlerts = systemHealth?.alerts?.slice(0, 3) ?? [];
  const openDocumentInboxItems = documentInboxItems.filter(
    (item) => !item.reviewDecision || item.reviewDecision.decision === "needs_parser",
  );
  const healthTone =
    systemHealth?.status === "ERROR"
      ? "error"
      : systemHealth?.status === "WARNUNG"
        ? "warn"
        : "good";

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="Projektstatus">
        <div>
          <p className="eyebrow">Personal Asset Intelligence</p>
          <h1>Finanzperformance</h1>
        </div>
        <div className="topbar__status">
          <Cloud aria-hidden="true" />
          <span>
            {dataStatus === "live"
              ? "Firestore-Daten geladen"
              : dataStatus === "loading"
                ? "Lade Firestore"
              : dataStatus === "blocked"
                ? "Firestore blockiert"
              : isFirebaseConfigured
                ? "Google-Anmeldung nötig"
                : "Lokaler Modus"}
          </span>
        </div>
        <label className="privacy-toggle">
          <input
            type="checkbox"
            checked={privacyMode}
            onChange={(event) => setPrivacyMode(event.target.checked)}
          />
          <span className="privacy-toggle__track" aria-hidden="true">
            <span className="privacy-toggle__thumb" />
          </span>
          {privacyMode ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          <span>{privacyMode ? "Privat" : "Sichtbar"}</span>
        </label>
        {dataStatus === "live" ? (
          <button
            type="button"
            className="quote-sync-button"
            onClick={handleRequestQuoteSync}
            disabled={["requesting", "requested", "running"].includes(quoteRequestStatus)}
          >
            <RefreshCcw aria-hidden="true" />
            <span>
              {quoteRequestStatus === "requesting"
                ? "Aktualisierung wird angefordert"
                : quoteRequestStatus === "requested"
                  ? "Aktualisierung angefordert"
                  : quoteRequestStatus === "running"
                    ? "Alles wird aktualisiert"
                  : quoteRequestStatus === "error"
                    ? "Sync fehlgeschlagen"
                    : "Alles aktualisieren"}
            </span>
          </button>
        ) : null}
      </header>

      <section className="summary-grid" aria-label="Aktueller Überblick">
        <article className="metric-card metric-card--total">
          <div className="metric-card__icon">
            <Wallet aria-hidden="true" />
          </div>
          <p>Erfasster Wert</p>
          <strong>{privacyMode ? maskMoney(trackedTotal) : formatCurrency(trackedTotal)}</strong>
          <div className="metric-card__details">
            <span className={`metric-chip metric-chip--${portfolioPerformanceTone}`}>
              G/V {privacyMode ? maskSignedMoney(portfolioPerformance) : formatSignedMoney(portfolioPerformance)}
              <small>{formatSignedPercent(portfolioPerformancePct)}</small>
            </span>
            <span className="metric-chip metric-chip--neutral">
              Heute {privacyMode ? maskSignedMoney(portfolioDayChange) : formatSignedMoney(portfolioDayChange)}
              <small>{formatSignedPercent(portfolioDayChangePct)}</small>
            </span>
          </div>
          <span>Depots, Krypto, Edelmetalle und Vorsorgewerte</span>
        </article>

        <article className="metric-card metric-card--system">
          <div className="metric-card__system-grid">
            <div className="metric-card__system-item">
              <div className="metric-card__icon">
                <Database aria-hidden="true" />
              </div>
              <p>Aktive Quellen</p>
              <strong>{numberFormatter.format(activeSources)}</strong>
              <span>{numberFormatter.format(displayedPositions.length)} Einzelpositionen sichtbar</span>
            </div>
            <div className="metric-card__system-item">
              <div className="metric-card__icon">
                {healthTone === "good" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
              </div>
              <p>Warnungen</p>
              <strong className={`health-status health-status--${healthTone}`}>
                {systemHealth ? systemHealth.alertCount : dataStatus === "live" ? 0 : "—"}
              </strong>
              <span>
                {systemHealth
                  ? `${systemHealth.errorCount} Fehler, ${systemHealth.warningCount} Warnungen`
                  : dataStatus === "live"
                    ? "Keine Health-Daten gefunden"
                    : "Wird nach Login geladen"}
              </span>
            </div>
          </div>
          {visibleAlerts.length ? (
            <ul className="alert-list">
              {visibleAlerts.map((alert) => (
                <li className={`alert-list__item alert-list__item--${alert.severity}`} key={alert.id}>
                  <strong>{alert.title}</strong>
                  <span>{alert.message}</span>
                </li>
              ))}
            </ul>
          ) : systemHealth?.status === "OK" ? (
            <span className="health-ok">Alle Prüfungen aktuell ohne Warnung.</span>
          ) : null}
        </article>
      </section>

      {dataStatus === "live" ? (
        <section className="panel document-inbox-panel" aria-label="Dokumenten-Postfach">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Dokumente</p>
              <h2>Dokumenten-Postfach</h2>
            </div>
            <Archive aria-hidden="true" />
          </div>
          <p className="document-inbox-panel__intro">
            Offene Dokumente, die ein Agent nicht klassifizieren oder verarbeiten konnte.
          </p>
          {openDocumentInboxItems.length ? (
            <DocumentInbox
              items={openDocumentInboxItems}
              pendingDecisionId={pendingDocumentDecisionId}
              onClassify={handleDocumentDecision}
            />
          ) : (
            <div className="document-inbox-panel__empty">
              Keine offenen Dokumentprobleme.
            </div>
          )}
        </section>
      ) : null}

      {dataStatus !== "live" ? (
        <section className="panel auth-panel">
          <div>
            <p className="eyebrow">Firestore</p>
            <h2>Geschützter Zugriff</h2>
            <p>
              Die Finanzdaten werden erst nach Anmeldung mit {ownerEmail} aus Firestore geladen.
            </p>
            {authUser ? (
              <p className="auth-panel__hint">
                Angemeldet als {authUser.email}. Falls das der falsche Account ist, abmelden und
                erneut anmelden.
              </p>
            ) : null}
            {authError ? <p className="auth-panel__error">{authError}</p> : null}
          </div>
          <div className="auth-panel__actions">
            {authUser ? (
              <button type="button" className="secondary-button" onClick={handleSignOut}>
                Abmelden
              </button>
            ) : (
              <button type="button" className="primary-button" onClick={handleGoogleSignIn}>
                Mit Google anmelden
              </button>
            )}
          </div>
        </section>
      ) : null}

      <section className="depot-overview">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Depots</p>
              <h2>Depotübersicht</h2>
            </div>
            <RefreshCcw aria-hidden="true" />
          </div>

          <div className="source-list">
            {sources.map((source) => {
              const sourceSummary = sourceSummaries[source.summaryId ?? source.id];
              const performanceTone = getPerformanceTone(sourceSummary?.performanceValue);
              const sourcePositionsForCard = displayedPositionsBySource[source.id] ?? [];
              const usedCreditValue = getUsedCreditValue(source);
              const sourcePrimaryTimestamp = getSourcePrimaryTimestamp(source);
              const vbvAccountInformation =
                source.id === "vbv" ? sourceSummary?.accountInformation ?? null : null;
              const sourceDayChangeBase = sourcePositionsForCard.reduce(
                (totals, position) => {
                  if (position.accountValueIncluded === false) return totals;
                  const { value } = getPositionDayChange(position);
                  if (typeof value !== "number") return totals;
                  return { value: totals.value + value, count: totals.count + 1 };
                },
                { value: 0, count: 0 },
              );
              const sourceDayChange =
                sourceDayChangeBase.count > 0 ? sourceDayChangeBase.value : null;
              const sourcePreviousValue =
                typeof sourceDayChange === "number" && typeof getSourceDisplayValue(source) === "number"
                  ? (getSourceDisplayValue(source) ?? 0) - sourceDayChange
                  : null;
              const sourceDayChangePct =
                sourcePreviousValue && sourceDayChange ? sourceDayChange / sourcePreviousValue : null;
              const ginmonAccounts =
                source.id === "ginmon" ? (sourceSummary?.accounts ?? []) : [];
              const sourceAgentRuns = getSourceAgentRunViews(source.id, agentStatuses);
              const tradeRepublicPortalButtonLabel = getTradeRepublicPortalButtonLabel(
                tradeRepublicPortalRequestStatus,
                agentStatuses.traderepublic_portal,
              );

              return (
                <article className="source-card" key={source.id}>
                  <div className="source-card__icon">
                    <SourceIcon source={source} />
                  </div>
                  <div className="source-card__body">
                    <div className="source-card__header">
                      <div>
                        <h3>{source.name}</h3>
                        <p>{source.purpose}</p>
                      </div>
                      <div className="source-card__header-actions">
                        <AgentStatusBadge status={source.agentStatus} />
                      </div>
                    </div>

                    {source.id === "traderepublic" ? (
                      <div className="source-card__portal-action source-card__portal-action--primary">
                        <button
                          type="button"
                          className="source-card__refresh-button source-card__refresh-button--wide"
                          onClick={handleRequestTradeRepublicPortalRefresh}
                          disabled={["requesting", "requested", "running"].includes(tradeRepublicPortalRequestStatus)}
                        >
                          <RefreshCcw aria-hidden="true" />
                          <span>Trade Republic: {tradeRepublicPortalButtonLabel}</span>
                        </button>
                        {tradeRepublicPortalRequestStatus === "error" && tradeRepublicPortalRequestError ? (
                          <div className="source-card__portal-error">
                            {tradeRepublicPortalRequestError}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <dl className="source-card__metrics">
                      <div>
                        <dt>Depotwert</dt>
                        <dd>{privacyMode ? maskMoney(getSourceDepotDisplayValue(source)) : formatCurrency(getSourceDepotDisplayValue(source))}</dd>
                      </div>
                      <div>
                        <dt>Cash</dt>
                        <dd>{privacyMode ? maskMoney(source.cashValue) : formatCurrency(source.cashValue)}</dd>
                      </div>
                      <div>
                        <dt>Einstand</dt>
                        <dd>{privacyMode ? maskMoney(sourceSummary?.costValue) : formatCurrency(sourceSummary?.costValue)}</dd>
                      </div>
                      <div>
                        <dt>{sourcePrimaryTimestamp.label}</dt>
                        <dd>
                          <span className="source-card__timestamp-inline">
                            {formatUpdatedAt(sourcePrimaryTimestamp.value)}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>G/V</dt>
                        <dd className={`performance-value performance-value--${performanceTone}`}>
                          {privacyMode ? maskSignedMoney(sourceSummary?.performanceValue) : formatSignedMoney(sourceSummary?.performanceValue)}
                          <span>{formatSignedPercent(sourceSummary?.performancePct)}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>Heute</dt>
                        <dd>
                          {privacyMode ? maskSignedMoney(sourceDayChange) : formatSignedMoney(sourceDayChange)}
                          <span className="inline-percent"> {formatSignedPercent(sourceDayChangePct)}</span>
                        </dd>
                      </div>
                      {source.agentStatus && source.agentStatus !== "OK" ? (
                        <div>
                          <dt>Status</dt>
                          <dd>{source.agentMessage ?? "Agent meldet keinen OK-Status."}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {typeof source.saleValue === "number" ||
                    typeof source.availableWithCredit === "number" ||
                    typeof source.creditLineEstimate === "number" ||
                    typeof usedCreditValue === "number" ? (
                      <dl className="source-card__metrics source-card__metrics--secondary">
                        {typeof source.saleValue === "number" ? (
                          <div>
                            <dt>Verkaufswert</dt>
                            <dd>{privacyMode ? maskMoney(source.saleValue) : formatCurrency(source.saleValue)}</dd>
                          </div>
                        ) : null}
                        {typeof source.availableWithCredit === "number" ? (
                          <div>
                            <dt>Verfügbar inkl. Kredit</dt>
                            <dd>{privacyMode ? maskMoney(source.availableWithCredit) : formatCurrency(source.availableWithCredit)}</dd>
                          </div>
                        ) : null}
                        {typeof source.creditLineEstimate === "number" ? (
                          <div>
                            <dt>Kreditrahmen ca.</dt>
                            <dd>{privacyMode ? maskMoney(source.creditLineEstimate) : formatCurrency(source.creditLineEstimate)}</dd>
                          </div>
                        ) : null}
                        {typeof usedCreditValue === "number" ? (
                          <div>
                            <dt>Kredit in Anspruch</dt>
                            <dd>{privacyMode ? maskMoney(usedCreditValue) : formatCurrency(usedCreditValue)}</dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : null}

                    {sourceAgentRuns.length ? (
                      <div className="source-card__agent-panel">
                        <div className="source-card__agent-panel-title">Agenten</div>
                        <div className="source-card__agent-list">
                          {sourceAgentRuns.map((entry) => {
                            const runTimestamp = getAgentRunTimestamp(entry.status);
                            const successTimestamp = getAgentSuccessTimestamp(entry.status);
                            const runText = formatUpdatedAt(runTimestamp);
                            const successText = formatUpdatedAt(successTimestamp);
                            const showSuccess = successText !== "Noch offen" && successText !== runText;
                            const detailLines = getAgentDetailLines(entry.status);
                            return (
                              <div className="source-card__agent-row" key={entry.id}>
                                <div className="source-card__agent-head">
                                  <strong>{entry.label}</strong>
                                  <AgentStatusBadge status={entry.status?.status} emptyLabel="Kein Status" />
                                </div>
                                <div className="source-card__agent-task">{entry.responsibility}</div>
                                <div className="source-card__agent-meta">
                                  <span>
                                    Lauf{" "}
                                    <span className="source-card__timestamp-inline">
                                      {runText}
                                    </span>
                                  </span>
                                  {showSuccess ? (
                                    <span>
                                      Erfolg{" "}
                                      <span className="source-card__timestamp-inline">
                                        {successText}
                                      </span>
                                    </span>
                                  ) : null}
                                </div>
                                {entry.status?.message && entry.status.status !== "OK" ? (
                                  <div className="source-card__agent-message">{entry.status.message}</div>
                                ) : null}
                                {detailLines.length ? (
                                  <div className="source-card__agent-details">
                                    {detailLines.map((line) => (
                                      <span key={line}>{line}</span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {ginmonAccounts.length ? (
                      <details className="source-accounts-details">
                        <summary>
                          <span>Ginmon-Depots</span>
                          <strong>{numberFormatter.format(ginmonAccounts.length)}</strong>
                        </summary>
                        <div className="source-account-list">
                          <div className="source-account-list__header">
                            <span>Depot</span>
                            <span>Wert</span>
                            <span>Barwert</span>
                            <span>G/V</span>
                          </div>
                        {ginmonAccounts.map((account) => {
                          const accountTone = getPerformanceTone(account.performanceValue);
                          const accountKey = account.accountNumber ?? account.customerId ?? getAccountLabel(account);
                          const accountPositions = sourcePositionsForCard.filter((position) => {
                            const positionAccountKey = getPositionAccountKey(position);
                            return (
                              positionAccountKey === account.accountNumber ||
                              positionAccountKey === account.customerId ||
                              getPositionAccountLabel(position) === getAccountLabel(account)
                            );
                          });
                          return (
                            <details className="source-account-details" key={accountKey}>
                              <summary className="source-account-row">
                                <div className="source-account-row__main">
                                  <strong>{getAccountLabel(account)}</strong>
                                  <span>{account.positionCount ? `${numberFormatter.format(account.positionCount)} Positionen` : "—"}</span>
                                </div>
                                <div className="source-account-row__value">
                                  <strong>{privacyMode ? maskMoney(account.currentValue) : formatCurrency(account.currentValue ?? undefined)}</strong>
                                </div>
                                <div className="source-account-row__value">
                                  <strong>{privacyMode ? maskMoney(account.cashValue) : formatCurrency(account.cashValue ?? undefined)}</strong>
                                </div>
                                <div className="source-account-row__numbers">
                                  <span className={`performance-value performance-value--${accountTone}`}>
                                    {privacyMode ? maskSignedMoney(account.performanceValue) : formatSignedMoney(account.performanceValue)}
                                    <small>{formatSignedPercent(account.performancePct)}</small>
                                  </span>
                                </div>
                              </summary>
                              <PositionsTable positions={accountPositions} privacyMode={privacyMode} />
                            </details>
                          );
                        })}
                        </div>
                      </details>
                    ) : vbvAccountInformation ? (
                      <VbvAccountInformationDetails
                        accountInformation={vbvAccountInformation}
                        privacyMode={privacyMode}
                      />
                    ) : sourcePositionsForCard.length ? (
                      <details className="source-positions-details">
                        <summary>
                          <span>Positionen anzeigen</span>
                          <strong>{numberFormatter.format(sourcePositionsForCard.length)}</strong>
                        </summary>
                        <PositionsTable positions={sourcePositionsForCard} privacyMode={privacyMode} />
                      </details>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

    </main>
  );
}

export default App;
