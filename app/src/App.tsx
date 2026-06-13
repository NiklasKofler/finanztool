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
  loadSourcePositions,
  loadSourceSummaries,
  loadSystemHealth,
  loadQuoteSyncCommand,
  requestQuoteSync,
  type AgentStatusDocument,
  type SourceSummaryAccount,
  type SourceSummaryDocument,
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

const agentStatusIds: Record<string, string> = {
  traderepublic: "traderepublic_mail",
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

function formatUpdatedAt(
  value?: string | Date | { toDate: () => Date } | { seconds: number } | null,
) {
  if (!value) return "Noch offen";
  const date =
    value instanceof Date
      ? value
      : typeof value === "object" && "toDate" in value
        ? value.toDate()
        : typeof value === "object" && "seconds" in value
          ? new Date(value.seconds * 1000)
          : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getTrackedTotal(sources: SourceOverview[]) {
  return sources.reduce((sum, source) => sum + (getSourceDisplayValue(source) ?? 0), 0);
}

function getSourceDisplayValue(source: SourceOverview) {
  return source.netValue ?? source.currentValue;
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

function getAgentStatusId(sourceId: string) {
  return agentStatusIds[sourceId] ?? sourceId;
}

function getSourceAgentStatus(
  sourceId: string,
  agentStatuses: Record<string, AgentStatusDocument>,
) {
  return agentStatuses[getAgentStatusId(sourceId)];
}

function AgentStatusBadge({ status }: { status?: string | null }) {
  const meta = status ? (agentStatusMeta[status] ?? { label: status, tone: "neutral" as const }) : null;
  if (!meta) return <span className="status-badge status-badge--neutral">Ohne Agent</span>;

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
                  {privacyMode ? maskMoney(dayChange.value) : formatMoney(dayChange.value)}
                </td>
                <td className="numeric">{formatPercent(dayChange.percentage)}</td>
                <td>{formatQuantity(position)}</td>
                <td>{formatOptionalText(position.quoteText)}</td>
                <td className="numeric">
                  {privacyMode ? maskMoney(positionPerformance.cost) : formatMoney(positionPerformance.cost, positionPerformance.currency)}
                </td>
                <td>{formatOptionalText(position.category)}</td>
                <td>{formatUpdatedAt(position.updatedAt)}</td>
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

function App() {
  const [sourceSummaries, setSourceSummaries] = useState<
    Record<string, SourceSummaryDocument>
  >({});
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatusDocument>>({});
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [quoteRequestStatus, setQuoteRequestStatus] = useState<
    "idle" | "requesting" | "requested" | "running" | "error"
  >("idle");
  const [dataStatus, setDataStatus] = useState<
    "auth-required" | "loading" | "live" | "blocked"
  >("auth-required");
  const [privacyMode, setPrivacyMode] = useState(true);

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
      loadSystemHealth(services.db),
    ])
      .then(([summaries, loadedAgentStatuses, loadedPositions, health]) => {
        if (!isMounted) return;
        setSourceSummaries(summaries);
        setAgentStatuses(loadedAgentStatuses);
        setPositions(loadedPositions);
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

  async function handleRequestQuoteSync() {
    const services = getFirebaseServices();
    if (!services || !authUser) return;

    async function refreshPortfolioData() {
      const [summaries, loadedAgentStatuses, loadedPositions, health] = await Promise.all([
        loadSourceSummaries(services!.db),
        loadAgentStatuses(services!.db),
        loadSourcePositions(services!.db),
        loadSystemHealth(services!.db),
      ]);
      setSourceSummaries(summaries);
      setAgentStatuses(loadedAgentStatuses);
      setPositions(loadedPositions);
      setSystemHealth(health);
    }

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
            currentValue: positionDepotValue ?? positionDerivedValue ?? source.currentValue,
            depotValue: positionDepotValue ?? source.depotValue,
            cashValue: positionCashValue ?? source.cashValue,
            netValue: positionDerivedValue ?? source.netValue,
            agentStatus: agentStatus?.status,
            agentMessage: agentStatus?.message,
            updatedAt: agentStatus?.lastSuccessAt ?? source.updatedAt,
            positionCount: positionStats?.count || source.positionCount,
          };
        }
        return {
          ...source,
          currentValue: positionDepotValue ?? positionDerivedValue ?? summary.currentValue ?? source.currentValue,
          depotValue: positionDepotValue ?? summary.depotValue ?? source.depotValue,
          saleValue: summary.saleValue ?? source.saleValue,
          cashValue: positionCashValue ?? summary.cashValue ?? source.cashValue,
          netValue: positionDerivedValue ?? summary.netValue ?? source.netValue,
          availableCash: summary.availableCash ?? source.availableCash,
          availableWithCredit: summary.availableWithCredit ?? source.availableWithCredit,
          creditLineEstimate: summary.creditLineEstimate ?? source.creditLineEstimate,
          valuationDate: summary.valuationDate ?? source.valuationDate,
          agentStatus: agentStatus?.status,
          agentMessage: agentStatus?.message,
          updatedAt: agentStatus?.lastSuccessAt ?? summary.updatedAt ?? source.updatedAt,
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
                ? "Kurse werden angefordert"
                : quoteRequestStatus === "requested"
                  ? "Kurs-Sync angefordert"
                  : quoteRequestStatus === "running"
                    ? "Kurse werden aktualisiert"
                  : quoteRequestStatus === "error"
                    ? "Sync fehlgeschlagen"
                    : "Kurse aktualisieren"}
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

        <article className="metric-card">
          <div className="metric-card__icon">
            <Database aria-hidden="true" />
          </div>
          <p>Aktive Quellen</p>
          <strong>{numberFormatter.format(activeSources)}</strong>
          <span>{numberFormatter.format(displayedPositions.length)} Einzelpositionen sichtbar</span>
        </article>

        <article className="metric-card">
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
                      <AgentStatusBadge status={source.agentStatus} />
                    </div>
                    <dl className="source-card__metrics">
                      <div>
                        <dt>Depotwert</dt>
                        <dd>{privacyMode ? maskMoney(getSourceDisplayValue(source)) : formatCurrency(getSourceDisplayValue(source))}</dd>
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
                        <dt>{source.agentStatus && source.agentStatus !== "OK" ? "Letzter Erfolg" : "Aktualisiert"}</dt>
                        <dd>{formatUpdatedAt(source.updatedAt)}</dd>
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
                    typeof source.availableCash === "number" ? (
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
                        {typeof source.availableCash === "number" ? (
                          <div>
                            <dt>Verfügbares Guthaben</dt>
                            <dd>{privacyMode ? maskMoney(source.availableCash) : formatCurrency(source.availableCash)}</dd>
                          </div>
                        ) : null}
                      </dl>
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
