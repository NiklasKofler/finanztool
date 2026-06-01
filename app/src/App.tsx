import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  Activity,
  Archive,
  CheckCircle2,
  Cloud,
  Database,
  RefreshCcw,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { getFirebaseServices, isFirebaseConfigured } from "./firebase/client";
import {
  loadSourcePositions,
  loadSourceSummaries,
  type SourceSummaryDocument,
} from "./firebase/sourceSummaries";
import { importPipeline, sourceOverviews } from "./domain/seedData";
import type { PortfolioPosition, SourceOverview, SourceStatus } from "./domain/types";

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

const sourceLabels: Record<string, string> = {
  flatex: "Flatex",
  traderepublic: "Trade Republic",
  ginmon: "Ginmon",
  intergold: "Intergold",
  bitget: "Bitget",
};

const sourceSortOrder = ["flatex", "traderepublic", "ginmon", "intergold", "bitget"];
const ownerEmail = "niklas.kofler@gmail.com";

const statusMeta: Record<
  SourceStatus,
  { label: string; tone: "good" | "warn" | "neutral" | "info" }
> = {
  automated: { label: "Automatisierbar", tone: "good" },
  ready: { label: "Import bereit", tone: "info" },
  manual: { label: "Manueller Export", tone: "warn" },
  planned: { label: "Geplant", tone: "neutral" },
  blocked: { label: "Offen", tone: "warn" },
};

function formatCurrency(value?: number) {
  if (typeof value !== "number") {
    return "—";
  }

  return currencyFormatter.format(value);
}

function formatOptionalText(value?: string | null) {
  return value?.trim() ? value : "—";
}

function formatPercent(value?: number | null) {
  if (typeof value !== "number") return "—";
  return percentFormatter.format(value);
}

function formatValuationDate(value?: string) {
  if (!value) return "Noch offen";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getTrackedTotal(sources: SourceOverview[]) {
  return sources.reduce((sum, source) => sum + (source.currentValue ?? 0), 0);
}

function getSourceLabel(source: string) {
  return sourceLabels[source] ?? source;
}

function getPositionSortValue(position: PortfolioPosition) {
  const sourceIndex = sourceSortOrder.indexOf(position.source);
  return sourceIndex === -1 ? Number.MAX_SAFE_INTEGER : sourceIndex;
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

function StatusBadge({ status }: { status: SourceStatus }) {
  const meta = statusMeta[status];

  return <span className={`status-badge status-badge--${meta.tone}`}>{meta.label}</span>;
}

function App() {
  const [sourceSummaries, setSourceSummaries] = useState<
    Record<string, SourceSummaryDocument>
  >({});
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<
    "auth-required" | "loading" | "live" | "blocked"
  >("auth-required");

  useEffect(() => {
    const services = getFirebaseServices();
    if (!services) return;

    return onAuthStateChanged(services.auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      setAuthError(null);
      if (!user) {
        setSourceSummaries({});
        setPositions([]);
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
    void Promise.all([loadSourceSummaries(services.db), loadSourcePositions(services.db)])
      .then(([summaries, loadedPositions]) => {
        if (!isMounted) return;
        setSourceSummaries(summaries);
        setPositions(loadedPositions);
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

  const sources = useMemo(
    () =>
      sourceOverviews.map((source) => {
        const summary = sourceSummaries[source.summaryId ?? source.id];
        if (!summary) return source;
        return {
          ...source,
          currentValue: summary.currentValue ?? source.currentValue,
          valuationDate: summary.valuationDate ?? source.valuationDate,
          positionCount:
            positions.filter((position) => position.source === source.id).length ||
            summary.positionCount ||
            source.positionCount,
        };
      }),
    [positions, sourceSummaries],
  );

  const trackedTotal = getTrackedTotal(sources);
  const importedSources = sources.filter(
    (source) => source.status === "ready" || source.status === "automated",
  ).length;
  const manualSources = sources.filter((source) => source.status === "manual").length;
  const displayedPositions = useMemo(
    () =>
      [...positions].sort((left, right) => {
        const sourceDelta = getPositionSortValue(left) - getPositionSortValue(right);
        if (sourceDelta !== 0) return sourceDelta;
        return (right.currentValue ?? 0) - (left.currentValue ?? 0);
      }),
    [positions],
  );

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
      </header>

      <section className="summary-grid" aria-label="Aktueller Überblick">
        <article className="metric-card metric-card--total">
          <div className="metric-card__icon">
            <Wallet aria-hidden="true" />
          </div>
          <p>Erfasster Wert</p>
          <strong>{formatCurrency(trackedTotal)}</strong>
          <span>Flatex, Trade Republic, Ginmon und Intergold aus Drive-Dokumenten</span>
        </article>

        <article className="metric-card">
          <div className="metric-card__icon">
            <Database aria-hidden="true" />
          </div>
          <p>Aktive Quellen</p>
          <strong>{numberFormatter.format(importedSources)}</strong>
          <span>{manualSources ? `${manualSources} mit bewusstem Handgriff, ` : ""}{numberFormatter.format(displayedPositions.length)} Einzelpositionen sichtbar</span>
        </article>

        <article className="metric-card">
          <div className="metric-card__icon">
            <ShieldCheck aria-hidden="true" />
          </div>
          <p>Import-Prinzip</p>
          <strong>{dataStatus === "live" ? "Live" : "Geschützt"}</strong>
          <span>
            {dataStatus === "live"
              ? "Firestore liest nur nach Google-Login, Client-Schreiben bleibt gesperrt"
              : dataStatus === "blocked"
                ? "Bitte mit dem freigegebenen Google-Konto anmelden"
                : "Firestore ist geschützt und wartet auf deine Anmeldung"}
          </span>
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

      <section className="panel positions-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Portfolio</p>
            <h2>Alle Einzelpositionen</h2>
          </div>
          <span className="position-count">{numberFormatter.format(displayedPositions.length)}</span>
        </div>

        <div className="positions-table-wrap">
          <table className="positions-table">
            <thead>
              <tr>
                <th>Quelle</th>
                <th>Position</th>
                <th>Kategorie</th>
                <th>Menge</th>
                <th>Kurs</th>
                <th className="numeric">Wert</th>
                <th className="numeric">Einstand</th>
                <th className="numeric">G/V</th>
                <th className="numeric">Perf.</th>
                <th>Stichtag</th>
              </tr>
            </thead>
            <tbody>
              {displayedPositions.length ? displayedPositions.map((position) => {
                const performanceTone =
                  (position.performanceValue ?? 0) > 0
                    ? "positive"
                    : (position.performanceValue ?? 0) < 0
                      ? "negative"
                      : "neutral";

                return (
                  <tr key={position.id}>
                    <td>
                      <span className={`source-pill source-pill--${position.source}`}>
                        {getSourceLabel(position.source)}
                      </span>
                    </td>
                    <td className="position-name-cell">
                      <strong>{position.name}</strong>
                      <span>
                        {[position.isin, position.wkn].filter(Boolean).join(" / ") || "—"}
                      </span>
                    </td>
                    <td>{formatOptionalText(position.category)}</td>
                    <td>{formatOptionalText(position.quantityText)}</td>
                    <td>{formatOptionalText(position.quoteText)}</td>
                    <td className="numeric">{formatCurrency(position.currentValue ?? undefined)}</td>
                    <td className="numeric">{formatCurrency(position.costValue ?? undefined)}</td>
                    <td className={`numeric performance-cell performance-cell--${performanceTone}`}>
                      {formatCurrency(position.performanceValue ?? undefined)}
                    </td>
                    <td className={`numeric performance-cell performance-cell--${performanceTone}`}>
                      {formatPercent(position.performancePct)}
                    </td>
                    <td>{formatValuationDate(position.valuationDate ?? undefined)}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td className="empty-position-row" colSpan={10}>
                    Noch keine Firestore-Positionen geladen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel panel--wide">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Quellen</p>
              <h2>Was zuerst angebunden wird</h2>
            </div>
            <RefreshCcw aria-hidden="true" />
          </div>

          <div className="source-list">
            {sources.map((source) => (
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
                    <StatusBadge status={source.status} />
                  </div>
                  <dl>
                    <div>
                      <dt>Aktueller Wert</dt>
                      <dd>{formatCurrency(source.currentValue)}</dd>
                    </div>
                    <div>
                      <dt>Stichtag</dt>
                      <dd>{formatValuationDate(source.valuationDate)}</dd>
                    </div>
                    <div>
                      <dt>Nächster Schritt</dt>
                      <dd>
                        {source.positionCount
                          ? `${numberFormatter.format(source.positionCount)} Positionen, ${source.importMethod}`
                          : source.nextStep}
                      </dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pipeline</p>
              <h2>Sichere Updates</h2>
            </div>
            <CheckCircle2 aria-hidden="true" />
          </div>
          <ol className="pipeline-list">
            {importPipeline.map((step) => (
              <li key={step.title}>
                <span>{step.order}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </section>
    </main>
  );
}

export default App;
