import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Cloud,
  Database,
  FileText,
  Mail,
  RefreshCcw,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import "./App.css";
import { getFirebaseServices, isFirebaseConfigured } from "./firebase/client";
import { importFlatexCsvToFirestore, type FlatexImportSummary } from "./firebase/importFlatex";
import {
  importPipeline,
  sourceOverviews,
  updateSchedule,
} from "./domain/seedData";
import type { SourceOverview, SourceStatus } from "./domain/types";

const currencyFormatter = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("de-AT", {
  maximumFractionDigits: 0,
});

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
    return "Noch offen";
  }

  return currencyFormatter.format(value);
}

function getTrackedTotal(sources: SourceOverview[]) {
  return sources.reduce((sum, source) => sum + (source.currentValue ?? 0), 0);
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<FlatexImportSummary | null>(null);

  const trackedTotal = getTrackedTotal(sourceOverviews);
  const importedSources = sourceOverviews.filter(
    (source) => source.status === "ready" || source.status === "automated",
  ).length;
  const manualSources = sourceOverviews.filter((source) => source.status === "manual").length;

  async function handleFlatexImport() {
    if (!selectedFile) {
      setImportError("Bitte zuerst eine Flatex-CSV auswählen.");
      return;
    }

    const services = getFirebaseServices();
    if (!services) {
      setImportError("Firebase ist noch nicht konfiguriert.");
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      const summary = await importFlatexCsvToFirestore(services.db, selectedFile);
      setImportSummary(summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Importfehler.";
      setImportError(message);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="Projektstatus">
        <div>
          <p className="eyebrow">Personal Asset Intelligence</p>
          <h1>Finanzperformance</h1>
        </div>
        <div className="topbar__status">
          <Cloud aria-hidden="true" />
          <span>{isFirebaseConfigured ? "Firebase verbunden" : "Lokaler Modus"}</span>
        </div>
      </header>

      <section className="summary-grid" aria-label="Aktueller Überblick">
        <article className="metric-card metric-card--total">
          <div className="metric-card__icon">
            <Wallet aria-hidden="true" />
          </div>
          <p>Erfasster Wert</p>
          <strong>{formatCurrency(trackedTotal)}</strong>
          <span>Flatex, Trade Republic und Ginmon aus den ersten Exporten</span>
        </article>

        <article className="metric-card">
          <div className="metric-card__icon">
            <Database aria-hidden="true" />
          </div>
          <p>Datenquellen</p>
          <strong>{numberFormatter.format(sourceOverviews.length)}</strong>
          <span>{importedSources} bereit, {manualSources} mit bewusstem Handgriff</span>
        </article>

        <article className="metric-card">
          <div className="metric-card__icon">
            <ShieldCheck aria-hidden="true" />
          </div>
          <p>Import-Prinzip</p>
          <strong>Idempotent</strong>
          <span>Neue Dateien werden erkannt, validiert und erst dann übernommen</span>
        </article>
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
            {sourceOverviews.map((source) => (
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
                      <dt>Importweg</dt>
                      <dd>{source.importMethod}</dd>
                    </div>
                    <div>
                      <dt>Nächster Schritt</dt>
                      <dd>{source.nextStep}</dd>
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

      <section className="panel schedule-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Automationen</p>
            <h2>Geplante Export- und Importtaktung</h2>
          </div>
          <Mail aria-hidden="true" />
        </div>
        <div className="schedule-grid">
          {updateSchedule.map((item) => (
            <article className="schedule-item" key={item.source}>
              <FileText aria-hidden="true" />
              <div>
                <h3>{item.source}</h3>
                <p>{item.cadence}</p>
              </div>
              {item.needsAttention ? (
                <AlertTriangle className="attention-icon" aria-label="Manueller Schritt nötig" />
              ) : (
                <CheckCircle2 className="ok-icon" aria-label="Automatisierbar" />
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="panel import-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Live Import</p>
            <h2>Flatex CSV nach Firestore</h2>
          </div>
          <Database aria-hidden="true" />
        </div>

        <div className="import-controls">
          <label htmlFor="flatex-file" className="import-file-label">
            CSV auswählen
          </label>
          <input
            id="flatex-file"
            className="import-file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setSelectedFile(file);
              setImportSummary(null);
              setImportError(null);
            }}
          />
          <button
            type="button"
            className="import-button"
            onClick={() => void handleFlatexImport()}
            disabled={!selectedFile || isImporting}
          >
            {isImporting ? "Import läuft..." : "Import starten"}
          </button>
        </div>

        <p className="import-hint">
          Ziel-Collections: <code>imports</code>, <code>transactions</code>, <code>positions</code>,{" "}
          <code>snapshots</code>
        </p>

        {selectedFile ? <p className="import-file-name">Datei: {selectedFile.name}</p> : null}
        {importError ? <p className="import-error">Fehler: {importError}</p> : null}

        {importSummary ? (
          <div className="import-result">
            <p>Status: {importSummary.status === "IMPORTED" ? "Importiert" : "Duplikat erkannt"}</p>
            <p>Import ID: {importSummary.importId}</p>
            <p>Transaktionen: {importSummary.transactionCount}</p>
            <p>Uebersprungene Zeilen: {importSummary.skippedRows}</p>
            <p>Warnungen: {importSummary.warningCount}</p>
            <p>Summierter Betrag: {currencyFormatter.format(importSummary.totalAmount)}</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default App;
