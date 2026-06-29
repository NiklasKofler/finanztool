import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronsUp,
  CheckCircle2,
  Cloud,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  GripVertical,
  Moon,
  Pencil,
  RefreshCcw,
  Search,
  Sun,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type SyntheticEvent } from "react";
import "./App.css";
import { getFirebaseServices, isFirebaseConfigured } from "./firebase/client";
import {
  loadAgentStatuses,
  loadBankLedgerEntries,
  loadCashHomeManualInput,
  loadDocumentInboxItems,
  loadEquatePlusManualInput,
  loadAutomationCommand,
  loadHealthCheckCommand,
  loadPositionPriceHistory,
  loadSourcePositions,
  loadSourceSummaries,
  loadSystemHealth,
  loadQuoteSyncCommand,
  loadTradeRepublicPortalCommand,
  loadUiPreferences,
  markDocumentInboxItemDecision,
  requestAutomationCommand,
  requestHealthCheck,
  requestQuoteSync,
  requestTradeRepublicPortalRefresh,
  saveCashHomeManualInput,
  saveEquatePlusManualInput,
  saveUiPreferences,
  type AgentStatusDocument,
  type BankLedgerEntryDocument,
  type CashHomeManualInputDocument,
  type DocumentInboxItem,
  type EquatePlusManualInputDocument,
  type SourceSummaryAccount,
  type SourceSummaryDocument,
  type SourceSummaryVbvAccountInformation,
} from "./firebase/sourceSummaries";
import { normalizePositionAssetClass } from "./domain/assetClasses";
import { sourceOverviews } from "./domain/seedData";
import type {
  PortfolioPosition,
  PositionPriceHistoryEntry,
  SourceOverview,
  SystemAlert,
  SystemHealth,
} from "./domain/types";

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

const privacyValueMultiplier = 35;
const privacyValueFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPrivacyMoney(value: number) {
  const formattedValue = privacyValueFormatter.format(Math.abs(value) * privacyValueMultiplier);
  return value < 0 ? `-€ ${formattedValue}` : `€ ${formattedValue}`;
}

const sourceSortOrder = [
  "flatex",
  "traderepublic",
  "ginmon",
  "intergold",
  "bitget",
  "capitalcom",
  "trading212",
  "vbv",
  "equateplus",
  "bank_accounts",
];
const ownerEmail = "niklas.kofler@gmail.com";
const dayInMillis = 24 * 60 * 60 * 1000;
const priceChartRanges: Array<{ id: PriceChartRangeId; label: string; durationMs: number }> = [
  { id: "1h", label: "1h", durationMs: 60 * 60 * 1000 },
  { id: "1d", label: "Tag", durationMs: dayInMillis },
  { id: "1w", label: "Woche", durationMs: 7 * dayInMillis },
  { id: "1m", label: "Monat", durationMs: 31 * dayInMillis },
  { id: "3m", label: "3M", durationMs: 92 * dayInMillis },
  { id: "6m", label: "6M", durationMs: 183 * dayInMillis },
  { id: "1y", label: "Jahr", durationMs: 366 * dayInMillis },
];
type CommandRequestStatus = "idle" | "requesting" | "requested" | "running" | "error";
type EquatePlusSaveStatus = "idle" | "saving" | "saved" | "error";
type EquatePlusDraft = { quantity: string; entryValueEur: string };
type CashHomeDraft = { amountEur: string };
type TradeRepublicDisplayMode = "current" | "broker";
type AgentUiStatus = "OK" | "WARNUNG" | "FEHLER" | "RUNNING";
type AgentStatusTone = "good" | "warn" | "error" | "neutral" | "info";
const emptyEquatePlusDraft: EquatePlusDraft = { quantity: "", entryValueEur: "" };
type UiExpandedSections = Record<string, boolean>;
type UiSectionToggleHandler = (sectionKey: string, isExpanded: boolean, defaultOpen?: boolean) => void;
type UiSectionOpenGetter = (sectionKey: string, defaultOpen?: boolean) => boolean;
type PositionSortKey =
  | "position"
  | "value"
  | "performance"
  | "performancePct"
  | "today"
  | "todayPct"
  | "quantity"
  | "quote"
  | "cost"
  | "assetClass"
  | "updatedAt";
type PositionSortDirection = "asc" | "desc";
type PositionSortState = { key: PositionSortKey; direction: PositionSortDirection };
type PriceChartRangeId = "1h" | "1d" | "1w" | "1m" | "3m" | "6m" | "1y";
type PriceChartPoint = {
  id: string;
  time: number;
  value: number;
  label: string;
};
type PortfolioValueBreakdown = {
  depotValue: number;
  cashValue: number;
  creditLine: number;
  usedCredit: number;
  uninvestedCash: number;
};
type AlertRepairAction = {
  id: "traderepublic" | "tfbank" | "capitalcom";
  label: string;
  commandId: string;
  commandType: "traderepublic_portal_refresh" | "tfbank_refresh" | "capitalcom_refresh";
};
const expandedSectionsStorageKey = "finanztool-expanded-sections";
const sourceOrderStorageKey = "finanztool-source-order";
const cashHomeStorageKey = "finanztool-cash-home";
const themeModeStorageKey = "finanztool-theme-mode";
const documentAlertIds = new Set([
  "unclassified_documents",
  "unknown_document_facts",
  "traderepublic_portal_unresolved_document_failures",
]);

function loadStoredExpandedSections(): UiExpandedSections {
  if (typeof window === "undefined") return {};
  const sections: UiExpandedSections = {};
  try {
    const currentSaved = JSON.parse(window.localStorage.getItem(expandedSectionsStorageKey) ?? "{}");
    if (currentSaved && typeof currentSaved === "object" && !Array.isArray(currentSaved)) {
      for (const [key, value] of Object.entries(currentSaved)) {
        if (typeof key === "string" && typeof value === "boolean") sections[key] = value;
      }
    }

    const saved = JSON.parse(window.localStorage.getItem("finanztool-collapsed-source-cards") ?? "[]");
    if (Array.isArray(saved)) {
      for (const sourceId of saved) {
        if (typeof sourceId === "string" && sections[`source:${sourceId}`] === undefined) {
          sections[`source:${sourceId}`] = false;
        }
      }
    }
  } catch {
    return sections;
  }
  return sections;
}

function loadStoredDarkMode() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(themeModeStorageKey) === "dark";
}

function saveStoredExpandedSections(sections: UiExpandedSections) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(expandedSectionsStorageKey, JSON.stringify(sections));
}

function normalizeSourceOrder(order: unknown, sourceIds = sourceSortOrder): string[] {
  const allowed = new Set(sourceIds);
  const normalized = Array.isArray(order)
    ? order.filter((sourceId): sourceId is string => typeof sourceId === "string" && allowed.has(sourceId))
    : [];
  return [
    ...normalized.filter((sourceId, index) => normalized.indexOf(sourceId) === index),
    ...sourceIds.filter((sourceId) => !normalized.includes(sourceId)),
  ];
}

function loadStoredSourceOrder(): string[] {
  if (typeof window === "undefined") return sourceSortOrder;
  try {
    return normalizeSourceOrder(JSON.parse(window.localStorage.getItem(sourceOrderStorageKey) ?? "[]"));
  } catch {
    return sourceSortOrder;
  }
}

function saveStoredSourceOrder(order: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(sourceOrderStorageKey, JSON.stringify(normalizeSourceOrder(order)));
}

function loadStoredCashHomeManualInput(): CashHomeManualInputDocument | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(cashHomeStorageKey) ?? "null");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
    const rawAmount = (stored as CashHomeManualInputDocument).amountEur;
    const amountEur = typeof rawAmount === "number" ? rawAmount : Number.parseFloat(String(rawAmount ?? "").replace(",", "."));
    if (typeof amountEur !== "number" || amountEur < 0) return null;
    return {
      id: "cash_home",
      source: "cash_home",
      amountEur,
      currency: "EUR",
      updatedBy: typeof stored.updatedBy === "string" ? stored.updatedBy : null,
      updatedAt: stored.updatedAt ?? null,
    };
  } catch {
    return null;
  }
}

function saveStoredCashHomeManualInput(input: CashHomeManualInputDocument) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    cashHomeStorageKey,
    JSON.stringify({
      id: "cash_home",
      source: "cash_home",
      amountEur: input.amountEur ?? 0,
      currency: "EUR",
      updatedBy: input.updatedBy ?? null,
      updatedAt: input.updatedAt instanceof Date ? input.updatedAt.toISOString() : input.updatedAt ?? new Date().toISOString(),
    }),
  );
}

function sortSourcesByOrder(sources: SourceOverview[], order: string[]) {
  const normalizedOrder = normalizeSourceOrder(order, sources.map((source) => source.id));
  const rank = new Map(normalizedOrder.map((sourceId, index) => [sourceId, index]));
  return [...sources].sort((left, right) => {
    const rankDelta = (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    if (rankDelta !== 0) return rankDelta;
    return left.name.localeCompare(right.name);
  });
}

const agentStatusIds: Record<string, string | string[]> = {
  flatex: ["flatex", "flatex_documents"],
  traderepublic: "traderepublic_portal",
  ginmon: ["ginmon", "ginmon_documents"],
  intergold: "intergold",
  bitget: ["bitget", "bitget_ledger"],
  capitalcom: "capitalcom",
  trading212: "trading212",
  vbv: "vbv",
  equateplus: "equateplus",
  bank_accounts: ["bank_accounts", "bank99", "n26", "amazon_visa", "tfbank"],
};

const agentStatusMeta: Record<
  string,
  { label: string; tone: AgentStatusTone }
> = {
  OK: { label: "OK", tone: "good" },
  WARNUNG: { label: "Warnung", tone: "warn" },
  FEHLER: { label: "Fehler", tone: "error" },
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
  trading212: {
    label: "Trading 212 Agent",
    responsibility: "Aktuelle Positionen, Cash, Einstandswerte, Orders, Dividenden und Cash-Bewegungen aus der Trading-212-API",
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
  traderepublic_portal: {
    label: "Trade Republic Portal-Agent",
    responsibility: "Portal-Snapshot, App-Bestaetigung und gezielte Dokument-/Transaktionspruefung aus Trade Republic",
  },
  vbv: {
    label: "VBV Agent",
    responsibility: "VBV-Portalstichtag, Kontoinformation-PDF und Vertragswerte",
  },
  equateplus: {
    label: "EquatePlus Kurs-Agent",
    responsibility: "Manuelle Novartis-Stueckzahl und Einstand mit aktuellem SIX-Kurs bewerten",
  },
  bank_accounts: {
    label: "Bankkonten Agent",
    responsibility: "Erste/Revolut/PayPal stuendlich: Geldstand, Kreditlinien und Transaktionen ueber Enable Banking",
  },
  bank99: {
    label: "bank99 Agent",
    responsibility: "bank99 limitiert: Geldstand und Transaktionen nur um 06:00 und 16:00",
  },
  n26: {
    label: "N26 Agent",
    responsibility: "N26 limitiert: Geldstand und Transaktionen nur um 06:00 und 16:00",
  },
  amazon_visa: {
    label: "Amazon Visa Agent",
    responsibility: "Aktueller Kreditkartensaldo, verfuegbarer Betrag und Kreditlimit aus dem Amazon-Visa-Portal",
  },
  tfbank: {
    label: "TF Bank Agent",
    responsibility: "Aktueller Kreditkartensaldo, verfuegbarer Betrag und Kreditlimit aus dem TF-Bank-Portal",
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

function getAlertRepairAction(alert: SystemAlert): AlertRepairAction | null {
  const text = `${alert.id} ${alert.source ?? ""} ${alert.title} ${alert.message}`.toLowerCase();
  if (/traderepublic|trade republic/.test(text)) {
    return {
      id: "traderepublic",
      label: "Trade Republic aktualisieren",
      commandId: "traderepublic_portal_refresh",
      commandType: "traderepublic_portal_refresh",
    };
  }
  if (/tfbank|tf bank/.test(text)) {
    return {
      id: "tfbank",
      label: "TF Bank neu starten",
      commandId: "tfbank_manual_refresh",
      commandType: "tfbank_refresh",
    };
  }
  if (/capitalcom|capital\.com/.test(text)) {
    return {
      id: "capitalcom",
      label: "Capital aktualisieren",
      commandId: "capitalcom_manual_refresh",
      commandType: "capitalcom_refresh",
    };
  }
  return null;
}

function getRepairActionLabel(action: AlertRepairAction, status: CommandRequestStatus) {
  if (status === "requesting") return "Anfrage";
  if (status === "requested") return "Wartet";
  if (status === "running") return "Läuft";
  if (status === "error") return "Erneut starten";
  return action.label;
}

function formatCurrency(value?: number | null) {
  if (typeof value !== "number") {
    return "—";
  }

  return currencyFormatter.format(value);
}

function maskMoney(value?: number | null) {
  return typeof value === "number" ? formatPrivacyMoney(value) : "—";
}

function maskSignedMoney(value?: number | null) {
  if (typeof value !== "number") return "—";
  if (value === 0) return `±€ ${privacyValueFormatter.format(0)}`;
  const sign = value > 0 ? "+" : "-";
  return `${sign}€ ${privacyValueFormatter.format(Math.abs(value) * privacyValueMultiplier)}`;
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
  if (provider.includes("six")) return "SIX";
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

function parseEditableNumber(value: string) {
  const cleaned = value.trim().replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function draftNumber(value?: number | null) {
  if (typeof value !== "number") return "";
  return String(value).replace(".", ",");
}

function equatePlusDraftFromInput(input?: EquatePlusManualInputDocument | null): EquatePlusDraft {
  return {
    quantity: draftNumber(input?.quantity),
    entryValueEur: draftNumber(input?.entryValueEur),
  };
}

function cashHomeDraftFromInput(input?: CashHomeManualInputDocument | null): CashHomeDraft {
  return {
    amountEur: draftNumber(input?.amountEur),
  };
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
      label: source.id === "vbv" ? "VBV-Stand" : source.id === "bank_accounts" ? "Bankstand" : "Datenstand",
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

function getPositionStatusMeta(position: PortfolioPosition) {
  const quoteStatus = position.quoteStatus?.toUpperCase() ?? "";
  const freshness = position.quoteFreshness?.toLowerCase() ?? "";

  if (
    quoteStatus.includes("ERROR") ||
    quoteStatus.includes("FEHLER") ||
    quoteStatus.includes("WARN") ||
    freshness === "stale" ||
    freshness === "missing"
  ) {
    return { tone: "warn", label: "Pruefen" };
  }

  if (
    freshness === "current" ||
    typeof position.quotePrice === "number" ||
    typeof position.quotePriceEur === "number" ||
    Boolean(position.quoteText?.trim()) ||
    typeof position.currentValue === "number"
  ) {
    return { tone: "good", label: "Aktuell" };
  }

  return { tone: "neutral", label: "Offen" };
}

function getTrackedTotal(sources: SourceOverview[]) {
  return sources.reduce((sum, source) => sum + (getSourceDisplayValue(source) ?? 0), 0);
}

function getPortfolioValueBreakdown(sources: SourceOverview[], bankAccounts: SourceSummaryAccount[]) {
  const totals: PortfolioValueBreakdown = {
    depotValue: 0,
    cashValue: 0,
    creditLine: 0,
    usedCredit: 0,
    uninvestedCash: 0,
  };

  for (const account of bankAccounts) {
    const accountValue = account.currentValue ?? account.cashValue ?? null;
    if (isCreditCardAccount(account) && typeof accountValue === "number" && accountValue < 0) {
      totals.usedCredit += Math.abs(accountValue);
    }
  }

  for (const source of sources) {
    const depotValue = getSourceDepotDisplayValue(source);
    const cashValue = source.cashValue;
    const creditLine = source.creditLineEstimate;
    const usedCredit = getUsedCreditValue(source);

    if (typeof depotValue === "number") totals.depotValue += depotValue;
    if (typeof cashValue === "number") {
      totals.cashValue += cashValue;
      if (cashValue > 0) totals.uninvestedCash += cashValue;
    }
    if (typeof creditLine === "number") totals.creditLine += creditLine;
    if (typeof usedCredit === "number") totals.usedCredit += usedCredit;
  }

  return totals;
}

function getSourceDisplayValue(source: SourceOverview) {
  if (typeof source.netValue === "number") return source.netValue;
  if (typeof source.depotValue === "number" && typeof source.cashValue === "number") {
    return Math.round((source.depotValue + source.cashValue) * 100) / 100;
  }
  return source.currentValue;
}

function hasFinancialFootprint(source: SourceOverview) {
  return Math.abs(getSourceDisplayValue(source) ?? 0) >= 0.005 || (source.positionCount ?? 0) > 0;
}

function isDocumentAlert(alert: SystemAlert) {
  return documentAlertIds.has(alert.id);
}

function sourceAliasesForHealth(sourceId: string) {
  return new Set([sourceId, ...getSourceAgentStatusIds(sourceId)]);
}

function getWorstHealthAlertForSource(sourceId: string, health?: SystemHealth | null) {
  if (!health?.alerts?.length) return null;
  const aliases = sourceAliasesForHealth(sourceId);
  const alerts = health.alerts
    .filter((alert) => !isDocumentAlert(alert))
    .filter((alert) => alert.source && aliases.has(alert.source));
  if (!alerts.length) return null;
  return [...alerts].sort((left, right) => {
    const leftRank = left.severity === "error" ? 2 : left.severity === "warning" ? 1 : 0;
    const rightRank = right.severity === "error" ? 2 : right.severity === "warning" ? 1 : 0;
    return rightRank - leftRank;
  })[0];
}

function getHealthStatusForSource(sourceId: string, health?: SystemHealth | null): AgentUiStatus | undefined {
  const alert = getWorstHealthAlertForSource(sourceId, health);
  if (!alert) return undefined;
  if (alert.severity === "error") return "FEHLER";
  if (alert.severity === "warning") return "WARNUNG";
  return undefined;
}

function getHealthMessageForSource(sourceId: string, health?: SystemHealth | null) {
  const alert = getWorstHealthAlertForSource(sourceId, health);
  if (!alert) return null;
  return `${alert.title}: ${alert.message}`;
}

function normalizeHealthKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function getAlertHealthKeys(alert: SystemAlert) {
  const agentId = (alert as SystemAlert & { agentId?: string | null }).agentId;
  return [alert.source, agentId].map(normalizeHealthKey).filter(Boolean);
}

function isOperationalHealthAlert(alert: SystemAlert) {
  return !isDocumentAlert(alert) && (alert.severity === "error" || alert.severity === "warning");
}

function getBankAccountSourceUnitId(account: SourceSummaryAccount, index: number) {
  return [
    "bank",
    account.agentStatusId,
    account.bankKey,
    account.providerSource,
    account.providerAccountId,
    account.accountId,
    index,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(":");
}

function getBankAccountHealthKeys(account: SourceSummaryAccount) {
  return [
    getBankAccountAgentId(account),
    account.agentStatusId,
    account.bankKey,
    account.providerSource,
    account.providerAccountId,
    account.accountId,
  ]
    .map(normalizeHealthKey)
    .filter(Boolean);
}

function getInactiveSourceUnitIds(
  regularSourceUnits: SourceOverview[],
  bankAccountSourceUnits: SourceSummaryAccount[],
  agentStatuses: Record<string, AgentStatusDocument>,
  health?: SystemHealth | null,
) {
  const units = [
    ...regularSourceUnits.map((source) => ({
      id: `source:${source.id}`,
      keys: [source.id, ...getSourceAgentStatusIds(source.id)].map(normalizeHealthKey),
      fallbackStatus: source.agentStatus,
      blocked: source.status === "blocked",
    })),
    ...bankAccountSourceUnits.map((account, index) => ({
      id: getBankAccountSourceUnitId(account, index),
      keys: getBankAccountHealthKeys(account),
      fallbackStatus: getBankAccountEffectiveStatus(account, agentStatuses),
      blocked: false,
    })),
  ];

  const inactiveIds = new Set(units.filter((unit) => unit.blocked).map((unit) => unit.id));
  const alertKeys = (health?.alerts ?? [])
    .filter(isOperationalHealthAlert)
    .flatMap(getAlertHealthKeys);

  if (alertKeys.length) {
    for (const unit of units) {
      if (unit.keys.some((key) => alertKeys.includes(key))) {
        inactiveIds.add(unit.id);
      }
    }
    return inactiveIds;
  }

  for (const unit of units) {
    if (unit.fallbackStatus === "FEHLER" || unit.fallbackStatus === "WARNUNG") {
      inactiveIds.add(unit.id);
    }
  }
  return inactiveIds;
}

function getUsedCreditValue(source: SourceOverview) {
  if (source.id !== "flatex" || typeof source.cashValue !== "number" || source.cashValue >= 0) return null;
  return Math.abs(source.cashValue);
}

function getSourceDepotDisplayValue(source: SourceOverview) {
  if (source.id === "cash_home") return source.depotValue ?? 0;
  const usedCreditValue = getUsedCreditValue(source);
  const displayValue = getSourceDisplayValue(source);
  if (typeof displayValue === "number" && typeof usedCreditValue === "number") {
    return Math.round((displayValue + usedCreditValue) * 100) / 100;
  }
  return displayValue ?? source.depotValue;
}

function getSourceCardPrimaryValue(source: SourceOverview) {
  return source.id === "cash_home" ? getSourceDisplayValue(source) : getSourceDepotDisplayValue(source);
}

function getSourceCardPrimaryLabel(source: SourceOverview) {
  if (source.id === "cash_home") return "Barbestand";
  return "Depotwert";
}

function roundMoneyValue(value: number) {
  return Math.round(value * 100) / 100;
}

function addMoneyValue(value: number | null | undefined, addition: number): number | undefined {
  if (typeof value !== "number") return addition ? roundMoneyValue(addition) : undefined;
  return roundMoneyValue(value + addition);
}

function getTradeRepublicCurrentSummary(summary?: SourceSummaryDocument) {
  if (!summary || typeof summary.externalQuoteDepotValue !== "number") return null;
  const privateMarketsValue =
    typeof summary.privateMarketsValue === "number" ? summary.privateMarketsValue : 0;
  const cashValue = typeof summary.cashValue === "number" ? summary.cashValue : 0;
  const depotValue = roundMoneyValue(summary.externalQuoteDepotValue + privateMarketsValue);
  const netValue = roundMoneyValue(depotValue + cashValue);
  const performanceValue =
    typeof summary.costValue === "number" ? roundMoneyValue(depotValue - summary.costValue) : null;

  return {
    ...summary,
    currentValue: netValue,
    depotValue,
    netValue,
    cashValue,
    performanceValue,
    performancePct:
      typeof summary.costValue === "number" && summary.costValue > 0 && typeof performanceValue === "number"
        ? performanceValue / summary.costValue
        : summary.performancePct,
    quoteDataProvider: summary.externalQuoteDataProvider ?? "boerse-frankfurt",
    quoteDataUpdatedAt: summary.externalQuoteDataUpdatedAt ?? summary.quoteUpdatedAt ?? summary.quoteDataUpdatedAt,
    valuationMethod: "traderepublic_current_external_quotes_display_v1",
  } satisfies SourceSummaryDocument;
}

function formatQuoteNumber(value?: number | null, currency?: string | null) {
  if (typeof value !== "number") return null;
  const formatted = new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

function getTradeRepublicCurrentPosition(position: PortfolioPosition): PortfolioPosition {
  if (position.source !== "traderepublic" || typeof position.externalQuoteValue !== "number") {
    return position;
  }

  const performanceValue =
    typeof position.costValue === "number"
      ? roundMoneyValue(position.externalQuoteValue - position.costValue)
      : position.performanceValue ?? null;
  const quoteText = formatQuoteNumber(position.externalQuotePrice, position.externalQuoteCurrency);

  return {
    ...position,
    currentValue: position.externalQuoteValue,
    performanceValue,
    performancePct:
      typeof position.costValue === "number" && position.costValue > 0 && typeof performanceValue === "number"
        ? performanceValue / position.costValue
        : position.performancePct ?? null,
    quoteText: quoteText ?? position.quoteText,
    quotePrice: position.externalQuotePrice ?? position.quotePrice ?? null,
    quoteCurrency: position.externalQuoteCurrency ?? position.quoteCurrency ?? null,
    quotePriceEur: position.externalQuotePriceEur ?? position.quotePriceEur ?? null,
    quoteProvider: position.externalQuoteProvider ?? "boerse-frankfurt",
    quoteProviderSymbol: position.externalQuoteProviderSymbol ?? position.quoteProviderSymbol ?? null,
    quoteAsOf: position.externalQuoteAsOf ?? position.quoteAsOf ?? null,
    quoteUpdatedAt: position.externalQuoteUpdatedAt ?? position.quoteUpdatedAt ?? null,
    quoteFetchedAt: position.externalQuoteUpdatedAt ?? position.quoteFetchedAt ?? null,
    quoteVenue: position.externalQuoteVenue ?? position.quoteVenue ?? null,
    priceSource: position.externalQuoteProvider ?? "boerse-frankfurt",
    valuationMethod: "boerse-frankfurt_quote_display_v1",
  };
}

function sourceUsesAuthoritativeSummary(sourceId: string) {
  return [
    "flatex",
    "traderepublic",
    "ginmon",
    "intergold",
    "bitget",
    "vbv",
    "equateplus",
    "bank_accounts",
    "cash_home",
  ].includes(sourceId);
}

function getAccountLabel(account: SourceSummaryAccount) {
  const bankKey = String(account.bankKey ?? "").trim().toLowerCase();
  const provider = String(account.providerSource ?? "").trim().toLowerCase();
  const label = account.label?.trim();
  if ((bankKey === "bank99" || provider === "bank99") && (!label || label.toLowerCase().startsWith("bank99:"))) {
    return "bank99 Konto";
  }
  return (
    label ||
    account.strategy?.trim() ||
    account.accountNumber?.trim() ||
    account.customerId?.trim() ||
    "Depot"
  );
}

const bankAccountLogoPaths: Record<string, string> = {
  bank99: "/bank-logos/bank99.png",
  n26: "/bank-logos/n26.png",
  paypal: "/bank-logos/paypal.jpg",
  revolut: "/bank-logos/revolut.png",
  sparkasse: "/bank-logos/sparkasse.png",
};

function getBankAccountLogoKey(account: SourceSummaryAccount) {
  const bankKey = String(account.bankKey ?? "").trim().toLowerCase();
  const provider = String(account.providerSource ?? "").trim().toLowerCase();
  const labelText = `${account.bankName ?? ""} ${account.label ?? ""} ${account.accountType ?? ""}`.toLowerCase();

  if (bankKey === "bank99" || provider === "bank99" || labelText.includes("bank99")) return "bank99";
  if (bankKey === "n26" || provider === "n26" || labelText.includes("n26")) return "n26";
  if (bankKey === "paypal" || provider === "paypal" || labelText.includes("paypal")) return "paypal";
  if (bankKey === "revolut" || provider === "revolut" || labelText.includes("revolut")) return "revolut";
  if (
    bankKey === "erste" ||
    bankKey === "sparkasse" ||
    provider === "erste" ||
    provider === "sparkasse" ||
    labelText.includes("sparkasse") ||
    labelText.includes("erste")
  ) {
    return "sparkasse";
  }

  return null;
}

function getBankAccountLogoPath(account: SourceSummaryAccount) {
  const logoKey = getBankAccountLogoKey(account);
  return logoKey ? bankAccountLogoPaths[logoKey] : null;
}

function getBankAccountAgentId(account: SourceSummaryAccount) {
  const bankKey = String(account.bankKey ?? "").trim().toLowerCase();
  if (bankKey === "bank99") return "bank99";
  if (bankKey === "n26") return "n26";

  const configuredAgentId = account.agentStatusId?.trim();
  if (configuredAgentId) return configuredAgentId;

  const provider = String(account.providerSource ?? "").trim().toLowerCase();
  if (provider === "amazon_visa" || provider === "tfbank") return provider;

  if (bankKey === "erste" || bankKey === "revolut" || bankKey === "paypal") return "bank_accounts";
  if (bankKey === "amazon_visa" || bankKey === "tfbank") return bankKey;

  const text = `${account.accountType ?? ""} ${account.bankName ?? ""} ${account.label ?? ""}`.toLowerCase();
  if (text.includes("tf bank")) return "tfbank";
  if (text.includes("amazon") || text.includes("visa")) return "amazon_visa";
  return "bank_accounts";
}

function getBankAccountAgentLabel(agentId: string) {
  return agentDisplayMeta[agentId]?.label ?? agentId;
}

function normalizeBankIssueToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, "");
}

function getBankAccountIssueTokens(account: SourceSummaryAccount) {
  return [
    account.bankKey,
    account.providerSource,
    account.accountId,
    account.providerAccountId,
    account.bankName,
    account.label,
    getAccountLabel(account),
  ]
    .map(normalizeBankIssueToken)
    .filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function matchesBankAccountIssue(account: SourceSummaryAccount, issue: Record<string, unknown>) {
  const issueTokens = [
    issue.bank,
    issue.bankKey,
    issue.providerSource,
    issue.accountId,
    issue.providerAccountId,
    issue.label,
    issue.accountLabel,
  ]
    .map(normalizeBankIssueToken)
    .filter(Boolean);
  if (!issueTokens.length) return false;

  const accountTokens = getBankAccountIssueTokens(account);
  return issueTokens.some((issueToken) =>
    accountTokens.some(
      (accountToken) =>
        issueToken === accountToken ||
        accountToken.includes(issueToken) ||
        issueToken.includes(accountToken),
    ),
  );
}

function getIssueMessage(issue: Record<string, unknown>) {
  const message = issue.message ?? issue.reason ?? issue.status ?? issue.type;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

function getIssueSeverity(issue: Record<string, unknown>, fallback: AgentUiStatus = "WARNUNG"): AgentUiStatus {
  const typeText = `${issue.type ?? ""} ${issue.status ?? ""} ${issue.message ?? ""} ${issue.reason ?? ""}`.toLowerCase();
  if (/fehler|error|failed|too many requests|tageslimit|limit|tan-login|warte|wartet|sms-tan/.test(typeText)) {
    return "FEHLER";
  }
  if (/running|läuft|laeuft/.test(typeText)) return "RUNNING";
  return fallback;
}

function getBankAccountAgentIssue(
  account: SourceSummaryAccount,
  agentStatus?: AgentStatusDocument,
): { message: string; severity: AgentUiStatus } | null {
  if (!agentStatus) {
    return {
      message: `${getBankAccountAgentLabel(getBankAccountAgentId(account))} hat noch keinen Laufstatus.`,
      severity: "FEHLER",
    };
  }

  const bankScopedIssues = [
    ...(agentStatus.bankErrors ?? []),
    ...(agentStatus.skippedBanks ?? []),
    ...((agentStatus.warnings ?? []).map(asRecord).filter(Boolean) as Record<string, unknown>[]),
  ];
  const matchingIssue = bankScopedIssues.find((issue) => matchesBankAccountIssue(account, issue));
  if (matchingIssue) {
    return {
      message: getIssueMessage(matchingIssue) ?? agentStatus.message ?? "Agent meldet ein kontospezifisches Problem.",
      severity: getIssueSeverity(matchingIssue, agentStatus.status === "FEHLER" ? "FEHLER" : "WARNUNG"),
    };
  }

  const displayStatus = getAgentDisplayStatus(agentStatus);
  const agentId = getBankAccountAgentId(account);
  const isSharedAgent = agentId === "bank_accounts";
  const hasScopedIssues = bankScopedIssues.length > 0;
  if (displayStatus && displayStatus !== "OK" && (!isSharedAgent || !hasScopedIssues)) {
    return {
      message: agentStatus.message ?? "Agent meldet keinen OK-Status.",
      severity: displayStatus,
    };
  }

  return null;
}

function getAgentDisplayStatus(agentStatus?: AgentStatusDocument | null): AgentUiStatus | undefined {
  if (!agentStatus?.status) return undefined;
  if (agentStatus.status === "OK") return "OK";
  if (agentStatus.status === "RUNNING") return "RUNNING";
  if (agentStatus.status === "WARNUNG") return "WARNUNG";
  return "FEHLER";
}

function getBankAccountStatusTone(account: SourceSummaryAccount, agentStatus?: AgentStatusDocument) {
  const agentIssue = getBankAccountAgentIssue(account, agentStatus);
  if (agentIssue?.severity === "FEHLER") return "error";
  if (agentIssue?.severity === "RUNNING" || agentIssue?.severity === "WARNUNG") return "warn";
  if (account.status === "STALE") {
    return account.staleIssueType === "error" || account.staleIssueType === "skipped" ? "error" : "warn";
  }
  if (account.status === "MISSING" || account.status === "FEHLER" || account.status === "ERROR") return "error";
  return "good";
}

function getBankAccountStatusLabel(account: SourceSummaryAccount, agentStatus?: AgentStatusDocument) {
  const agentIssue = getBankAccountAgentIssue(account, agentStatus);
  if (agentIssue) {
    const message = agentIssue.message.toLowerCase();
    if (agentIssue.severity === "RUNNING") return "Läuft";
    if (message.includes("tan") && agentIssue.severity === "WARNUNG") return "Wartet TAN";
    if (agentIssue.severity === "FEHLER") return "Fehler";
    return "Warnung";
  }
  if (account.status === "STALE") {
    return account.staleIssueType === "error" || account.staleIssueType === "skipped" ? "Fehler" : "Letzter Stand";
  }
  if (account.status === "MISSING") return "Fehlt";
  if (account.status === "FEHLER" || account.status === "ERROR") return "Fehler";
  return "OK";
}

function hasTimeComponent(value?: string | Date | { toDate: () => Date } | { seconds: number } | null) {
  if (!value) return false;
  if (value instanceof Date) return true;
  if (typeof value === "object") return true;
  return /[tT]\d{2}:\d{2}| \d{2}:\d{2}/.test(value);
}

function getBankAccountUpdatedAt(account: SourceSummaryAccount) {
  const dataTimestampWithTime = hasTimeComponent(account.sourceDataUpdatedAt)
    ? account.sourceDataUpdatedAt
    : null;
  return (
    dataTimestampWithTime ??
    account.lastDataSuccessAt ??
    account.sourceDataUpdatedAt ??
    account.valuationDate ??
    null
  );
}

function getBankAccountIssueMessage(account: SourceSummaryAccount, agentStatus?: AgentStatusDocument) {
  const agentIssue = getBankAccountAgentIssue(account, agentStatus);
  if (agentIssue) return agentIssue.message;
  if (account.status === "STALE" && account.staleReason) return account.staleReason;
  return null;
}

function getStatusRank(status?: string | null) {
  if (status === "FEHLER") return 3;
  if (status === "WARNUNG") return 2;
  if (status === "RUNNING") return 1;
  if (status === "OK") return 0;
  return -1;
}

function getWorseStatus(
  first?: string | null,
  second?: string | null,
): string | undefined {
  const worse = getStatusRank(second) > getStatusRank(first) ? second : first;
  return worse ?? undefined;
}

function getBankAccountEffectiveStatus(
  account: SourceSummaryAccount,
  agentStatuses: Record<string, AgentStatusDocument>,
): AgentUiStatus {
  const agentStatus = agentStatuses[getBankAccountAgentId(account)];
  const label = getBankAccountStatusLabel(account, agentStatus);
  const tone = getBankAccountStatusTone(account, agentStatus);
  if (tone === "error") return "FEHLER";
  if (label === "Läuft") return "RUNNING";
  if (tone === "warn") return "WARNUNG";
  return "OK";
}

function getBankAccountsAggregateStatus(
  accounts: SourceSummaryAccount[],
  agentStatuses: Record<string, AgentStatusDocument>,
): AgentUiStatus | undefined {
  if (!accounts.length) return undefined;
  return accounts.reduce<AgentUiStatus | undefined>(
    (worstStatus, account) =>
      getWorseStatus(worstStatus, getBankAccountEffectiveStatus(account, agentStatuses)) as AgentUiStatus | undefined,
    undefined,
  );
}

function getBankAccountsAggregateMessage(
  accounts: SourceSummaryAccount[],
  agentStatuses: Record<string, AgentStatusDocument>,
) {
  const issues = accounts
    .map((account) => {
      const agentStatus = agentStatuses[getBankAccountAgentId(account)];
      const status = getBankAccountEffectiveStatus(account, agentStatuses);
      if (status === "OK") return null;
      return {
        label: getAccountLabel(account),
        statusLabel: getBankAccountStatusLabel(account, agentStatus),
        message: getBankAccountIssueMessage(account, agentStatus),
      };
    })
    .filter(Boolean) as Array<{ label: string; statusLabel: string; message?: string | null }>;

  if (!issues.length) return null;
  const firstIssue = issues[0];
  const firstText = `${firstIssue.label}: ${firstIssue.statusLabel}${firstIssue.message ? ` - ${firstIssue.message}` : ""}`;
  if (issues.length === 1) return firstText;
  return `${numberFormatter.format(issues.length)} Bank-/Kreditkartenzeilen brauchen Aufmerksamkeit; zuerst ${firstText}`;
}

function isCreditCardAccount(account: SourceSummaryAccount) {
  const text = `${account.accountType ?? ""} ${account.providerSource ?? ""} ${account.bankName ?? ""} ${account.label ?? ""}`.toLowerCase();
  return text.includes("credit_card") || text.includes("kreditkarte") || text.includes("visa") || text.includes("tf bank");
}

function getBankLedgerCategoryLabel(category?: string | null) {
  if (category === "cash_inflow") return "Eingang";
  if (category === "cash_outflow") return "Ausgang";
  if (category === "fee") return "Gebühr";
  if (category === "tax") return "Steuer";
  if (category === "interest") return "Zins";
  if (category === "bonus") return "Bonus";
  return "Umsatz";
}

function getBankLedgerTone(entry: BankLedgerEntryDocument) {
  if (entry.category === "fee" || entry.category === "tax") return "negative";
  if ((entry.amount ?? 0) > 0) return "positive";
  if ((entry.amount ?? 0) < 0) return "negative";
  return "neutral";
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function dateToMillis(value?: string | Date | { toDate: () => Date } | { seconds: number } | null) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toDate" in value) return value.toDate().getTime();
  if (typeof value === "object" && "seconds" in value) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeHistoryId(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function positionHistoryKey(position: PortfolioPosition) {
  return `position_${safeHistoryId(position.id)}`;
}

function historyEntryTime(entry: PositionPriceHistoryEntry) {
  const explicitTime =
    dateToMillis(entry.asOf) ||
    dateToMillis(entry.fetchedAt) ||
    dateToMillis(entry.updatedAt);
  if (explicitTime) return explicitTime;
  if (!entry.historyDate) return 0;
  return dateToMillis(`${entry.historyDate}T22:00:00`);
}

function historyEntryValue(entry: PositionPriceHistoryEntry, position: PortfolioPosition) {
  if (typeof entry.priceEur === "number") return entry.priceEur;
  if (typeof entry.price === "number" && (!entry.currency || entry.currency.toUpperCase() === "EUR")) {
    return entry.price;
  }
  if (typeof entry.currentValueEur === "number" && typeof entry.quantity === "number" && entry.quantity > 0) {
    return entry.currentValueEur / entry.quantity;
  }
  if (typeof entry.currentValue === "number" && typeof entry.quantity === "number" && entry.quantity > 0) {
    return entry.currentValue / entry.quantity;
  }
  if (typeof entry.currentValueEur === "number" && typeof position.quantity === "number" && position.quantity > 0) {
    return entry.currentValueEur / position.quantity;
  }
  if (typeof entry.currentValue === "number" && typeof position.quantity === "number" && position.quantity > 0) {
    return entry.currentValue / position.quantity;
  }
  return null;
}

function currentPositionChartPoint(position: PortfolioPosition): PriceChartPoint | null {
  const value =
    position.quotePriceEur ??
    (position.quoteCurrency?.toUpperCase() === "EUR" ? position.quotePrice : null) ??
    (typeof position.currentValue === "number" && typeof position.quantity === "number" && position.quantity > 0
      ? position.currentValue / position.quantity
      : null);
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const time = dateToMillis(getPositionDisplayUpdatedAt(position)) || Date.now();
  return {
    id: `${position.id}:current`,
    time,
    value,
    label: "Aktuell",
  };
}

function historyEntryMatchesPosition(entry: PositionPriceHistoryEntry, position: PortfolioPosition) {
  if (entry.positionId === position.id) return true;
  if (Array.isArray(entry.positionIds) && entry.positionIds.includes(position.id)) return true;
  if (entry.historyKey === positionHistoryKey(position)) return true;
  if (entry.instrumentId === positionHistoryKey(position)) return true;
  if (position.isin && entry.isin === position.isin) return true;
  return false;
}

function priceHistoryForPosition(
  position: PortfolioPosition,
  history: PositionPriceHistoryEntry[],
) {
  return history
    .filter((entry) => historyEntryMatchesPosition(entry, position))
    .map((entry): PriceChartPoint | null => {
      const time = historyEntryTime(entry);
      const value = historyEntryValue(entry, position);
      if (!time || typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
      return {
        id: entry.id,
        time,
        value,
        label: entry.provider ?? entry.historyDate ?? "Historie",
      };
    })
    .filter((point): point is PriceChartPoint => Boolean(point));
}

function getPositionSearchText(position: PortfolioPosition) {
  const assetClassInfo = normalizePositionAssetClass(position);
  return [
    position.name,
    position.isin,
    position.wkn,
    position.category,
    position.assetClass,
    position.assetClassLabel,
    assetClassInfo.label,
    position.source,
    position.accountId,
    position.accountNumber,
    position.customerId,
    position.portfolioId,
    position.portfolioLabel,
    position.quoteText,
    position.quoteProvider,
    position.quoteVenue,
    position.priceSource,
  ].filter(Boolean).join(" ");
}

function positionMatchesSearch(position: PortfolioPosition, normalizedQuery: string) {
  if (!normalizedQuery) return false;
  return normalizeSearchText(getPositionSearchText(position)).includes(normalizedQuery);
}

function sourceMatchesDirectSearch(
  source: SourceOverview,
  summary: SourceSummaryDocument | undefined,
  normalizedQuery: string,
) {
  if (!normalizedQuery) return false;
  const accountText = (summary?.accounts ?? [])
    .map((account) => [account.label, account.strategy, account.bankName, account.accountNumber, account.customerId].filter(Boolean).join(" "))
    .join(" ");
  const sourceText = [
    source.name,
    source.purpose,
    source.kind,
    source.status,
    source.agentStatus,
    source.agentMessage,
    source.sourceDataProvider,
    source.quoteDataProvider,
    source.externalQuoteDataProvider,
    accountText,
  ].filter(Boolean).join(" ");
  return normalizeSearchText(sourceText).includes(normalizedQuery);
}

function getPositionSortValue(position: PortfolioPosition) {
  const sourceIndex = sourceSortOrder.indexOf(position.source);
  return sourceIndex === -1 ? Number.MAX_SAFE_INTEGER : sourceIndex;
}

function getPositionTableSortValue(position: PortfolioPosition, key: PositionSortKey): number | string {
  const performance = getPositionPerformance(position);
  const dayChange = getPositionDayChange(position);
  switch (key) {
    case "position":
      return normalizeSearchText(position.name);
    case "value":
      return position.currentValue ?? 0;
    case "performance":
      return performance.performance ?? 0;
    case "performancePct":
      return performance.percentage ?? 0;
    case "today":
      return dayChange.value ?? 0;
    case "todayPct":
      return dayChange.percentage ?? 0;
    case "quantity":
      return position.quantity ?? 0;
    case "quote":
      return position.quotePriceEur ?? position.quotePrice ?? 0;
    case "cost":
      return performance.cost ?? 0;
    case "assetClass":
      return normalizeSearchText(normalizePositionAssetClass(position).label);
    case "updatedAt":
      return dateToMillis(getPositionDisplayUpdatedAt(position));
    default:
      return normalizeSearchText(position.name);
  }
}

function sortPositionsByTableState(positions: PortfolioPosition[], sortState: PositionSortState) {
  const directionFactor = sortState.direction === "asc" ? 1 : -1;
  return positions
    .map((position, index) => ({ position, index }))
    .sort((left, right) => {
      const leftValue = getPositionTableSortValue(left.position, sortState.key);
      const rightValue = getPositionTableSortValue(right.position, sortState.key);
      let valueDelta = 0;
      if (typeof leftValue === "number" && typeof rightValue === "number") {
        valueDelta = leftValue - rightValue;
      } else {
        valueDelta = String(leftValue).localeCompare(String(rightValue), "de-AT", { numeric: true });
      }
      if (valueDelta !== 0) return valueDelta * directionFactor;
      return left.index - right.index;
    })
    .map(({ position }) => position);
}

function isCashPosition(position: PortfolioPosition) {
  const name = position.name?.trim().toLowerCase() ?? "";
  const category = position.category?.trim().toLowerCase() ?? "";
  return (
    category.includes("cash") ||
    category.includes("credit_card") ||
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

function formatChartMoney(value?: number | null, privacyMode = false) {
  if (typeof value !== "number") return "—";
  return privacyMode ? maskMoney(value) : formatCurrency(value);
}

function PositionPriceChart({
  position,
  history,
  privacyMode,
}: {
  position: PortfolioPosition;
  history: PriceChartPoint[];
  privacyMode: boolean;
}) {
  const [rangeId, setRangeId] = useState<PriceChartRangeId>("1m");
  const currentPoint = currentPositionChartPoint(position);
  const points = useMemo(() => {
    const combined = [...history, ...(currentPoint ? [currentPoint] : [])]
      .sort((left, right) => left.time - right.time);
    const deduplicated = combined.filter((point, index, allPoints) => {
      const previous = allPoints[index - 1];
      return !previous || previous.time !== point.time || previous.value !== point.value;
    });
    const latestTime = deduplicated.at(-1)?.time ?? Date.now();
    const range = priceChartRanges.find((item) => item.id === rangeId) ?? priceChartRanges[3];
    return deduplicated.filter((point) => point.time >= latestTime - range.durationMs);
  }, [currentPoint, history, rangeId]);

  const firstPoint = points[0] ?? null;
  const latestPoint = points.at(-1) ?? null;
  const deltaValue = firstPoint && latestPoint ? latestPoint.value - firstPoint.value : null;
  const deltaPct = firstPoint && latestPoint && firstPoint.value ? (deltaValue ?? 0) / firstPoint.value : null;
  const deltaTone = getPerformanceTone(deltaValue);
  const values = points.map((point) => point.value);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const valueSpread = maxValue - minValue || 1;
  const firstTime = firstPoint?.time ?? 0;
  const lastTime = latestPoint?.time ?? firstTime + 1;
  const timeSpread = lastTime - firstTime || 1;
  const chartPoints = points.map((point) => {
    const x = points.length === 1 ? 50 : ((point.time - firstTime) / timeSpread) * 100;
    const y = 34 - ((point.value - minValue) / valueSpread) * 28;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <section className="position-price-chart" aria-label={`Kurschart ${position.name}`}>
      <header className="position-price-chart__header">
        <div className="position-price-chart__title">
          <span>Kurschart</span>
          <strong>{formatChartMoney(latestPoint?.value, privacyMode)}</strong>
        </div>
        <div className="position-price-chart__ranges" aria-label="Zeitraum waehlen">
          {priceChartRanges.map((range) => (
            <button
              type="button"
              key={range.id}
              className={range.id === rangeId ? "is-active" : undefined}
              onClick={() => setRangeId(range.id)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </header>
      {points.length ? (
        <>
          <svg className="position-price-chart__svg" viewBox="0 0 100 38" preserveAspectRatio="none" role="img">
            <title>Kursverlauf {position.name}</title>
            <line x1="0" y1="35" x2="100" y2="35" />
            {points.length > 1 ? (
              <polyline points={chartPoints.join(" ")} />
            ) : (
              <circle cx="50" cy="18" r="1.8" />
            )}
          </svg>
          <footer className="position-price-chart__footer">
            <span>{points.length} Punkt{points.length === 1 ? "" : "e"}</span>
            <strong className={`performance-cell--${deltaTone}`}>
              {privacyMode ? maskSignedMoney(deltaValue) : formatSignedMoney(deltaValue)}
              <small>{formatSignedPercent(deltaPct)}</small>
            </strong>
            <span>{latestPoint ? formatUpdatedAt(new Date(latestPoint.time)) : "—"}</span>
          </footer>
        </>
      ) : (
        <p className="position-price-chart__empty">
          Fuer diesen Zeitraum ist noch keine Preis-Historie vorhanden.
        </p>
      )}
    </section>
  );
}

const sourceLogoPaths: Partial<Record<string, string>> = {
  bank_accounts: "/source-logos/cash.jpg",
  bitget: "/source-logos/bitget.png",
  capitalcom: "/source-logos/capitalcom.jpg",
  cash_home: "/source-logos/cash.jpg",
  equateplus: "/source-logos/equateplus.png",
  flatex: "/source-logos/flatex.png",
  ginmon: "/source-logos/ginmon.png",
  intergold: "/source-logos/intergold.jpg",
  traderepublic: "/source-logos/traderepublic.png",
  trading212: "/source-logos/trading212.jpg",
  vbv: "/source-logos/vbv.jpg",
};

function SourceIcon({ source }: { source: SourceOverview }) {
  const logoPath = sourceLogoPaths[source.id];
  if (logoPath) {
    return <img className="source-card__logo" src={logoPath} alt="" aria-hidden="true" />;
  }

  switch (source.kind) {
    case "broker":
      return <TrendingUp aria-hidden="true" />;
    case "robo":
      return <Activity aria-hidden="true" />;
    case "crypto":
      return <Wallet aria-hidden="true" />;
    case "metals":
      return <Archive aria-hidden="true" />;
    case "credit_card":
      return <CreditCard aria-hidden="true" />;
    case "cash":
      return <Wallet aria-hidden="true" />;
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
  return status?.lastAgentRunAt ?? status?.lastSuccessAt ?? status?.lastAgentSuccessAt ?? null;
}

function getAgentSuccessTimestamp(status?: AgentStatusDocument) {
  return status?.lastAgentSuccessAt ?? status?.lastSuccessAt ?? null;
}

function getAgentDetailLines(status?: AgentStatusDocument) {
  if (!status) return [];
  const lines: string[] = [];
  for (const skippedBank of status.skippedBanks ?? []) {
    const label = skippedBank.label ?? skippedBank.bank ?? "Bank";
    const reason = skippedBank.reason ? `: ${skippedBank.reason}` : "";
    lines.push(`${label} ohne Abruf${reason}`);
  }
  for (const bankError of status.bankErrors ?? []) {
    const label = bankError.label ?? bankError.bank ?? "Bank";
    const message = bankError.message ? `: ${bankError.message}` : "";
    lines.push(`${label} Fehler${message}`);
  }
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
  if (item.rawStatus === "PARSED") return "Verarbeitet";
  const decision = item.reviewDecision?.decision;
  if (decision === "covered") return "Abgedeckt";
  if (decision === "not_relevant") return "Nicht relevant";
  if (decision === "deferred") return "Wichtig";
  if (decision === "needs_parser") return "Parser nötig";
  return item.severity === "error" ? "Fehler" : "Offen";
}

function getDocumentInboxDecisionTone(item: DocumentInboxItem) {
  if (item.rawStatus === "PARSED") return "info";
  if (item.reviewDecision?.decision === "covered" || item.reviewDecision?.decision === "not_relevant") return "good";
  if (item.reviewDecision?.decision === "needs_parser" || item.reviewDecision?.decision === "deferred") return "info";
  return item.severity === "error" ? "error" : "warn";
}

function isOpenDocumentInboxItem(item: DocumentInboxItem) {
  if (isProcessedDocumentInboxItem(item)) return false;
  return !item.reviewDecision || item.reviewDecision.decision === "needs_parser";
}

function isProcessedDocumentInboxItem(item: DocumentInboxItem) {
  return item.rawStatus === "PARSED";
}

function DocumentInbox({
  items,
  onClassify,
  onOpenDocument,
  pendingDecisionId,
  pendingOpenDocumentId,
  isOpen,
  onSectionToggle,
}: {
  items: DocumentInboxItem[];
  onClassify: (
    item: DocumentInboxItem,
    decision: "covered" | "not_relevant" | "needs_parser" | "deferred",
    reason: string,
  ) => void;
  onOpenDocument: (item: DocumentInboxItem) => void;
  pendingDecisionId: string | null;
  pendingOpenDocumentId: string | null;
  isOpen: boolean;
  onSectionToggle: UiSectionToggleHandler;
}) {
  const openItems = items.filter(isOpenDocumentInboxItem);

  if (!openItems.length) return null;

  return (
    <details
      className="document-inbox"
      open={isOpen}
      onToggle={(event) => onSectionToggle("documentInbox:open", event.currentTarget.open, true)}
    >
      <summary>
        <span>Offene Dokumentfälle</span>
        <strong>{numberFormatter.format(openItems.length)}</strong>
      </summary>
      <div className="document-inbox__list">
        {openItems.map((item) => {
          const isPending = pendingDecisionId === item.id;
          const isOpening = pendingOpenDocumentId === item.id;
          const isClosed = Boolean(item.reviewDecision && item.reviewDecision.decision !== "needs_parser");
          const hasDocumentAccess = Boolean(item.documentStoragePath || item.documentUrl);
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
                  {item.sourceChannel ? <span>{item.sourceChannel}</span> : null}
                </div>
                {item.reviewDecision?.reason ? (
                  <div className="document-inbox__decision">
                    Entscheidung: {item.reviewDecision.reason}
                  </div>
                ) : null}
              </div>
              {hasDocumentAccess || !isClosed ? (
                <div className="document-inbox__actions">
                  {item.documentStoragePath ? (
                    <button
                      type="button"
                      className="secondary-button document-inbox__button"
                      disabled={isOpening}
                      onClick={() => onOpenDocument(item)}
                    >
                      {isOpening ? "Öffne PDF" : "PDF öffnen"}
                    </button>
                  ) : item.documentUrl ? (
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
                            "deferred",
                            "Wichtig; ruht zur spaeteren fachlichen Pruefung und darf nicht vergessen werden.",
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

function BankAccountGroup({
  title,
  accounts,
  agentStatuses,
  bankLedgerEntries,
  privacyMode,
  accountHeader,
  groupKey,
  isOpen,
  isSectionOpen,
  onSectionToggle,
}: {
  title: string;
  accounts: SourceSummaryAccount[];
  agentStatuses: Record<string, AgentStatusDocument>;
  bankLedgerEntries: BankLedgerEntryDocument[];
  privacyMode: boolean;
  accountHeader: string;
  groupKey: string;
  isOpen: boolean;
  isSectionOpen: UiSectionOpenGetter;
  onSectionToggle: UiSectionToggleHandler;
}) {
  if (!accounts.length) return null;
  const groupStatus = getBankAccountsAggregateStatus(accounts, agentStatuses);
  const groupIssueStatuses = accounts
    .map((account) => getBankAccountEffectiveStatus(account, agentStatuses))
    .filter((status) => status !== "OK");
  const groupErrorCount = groupIssueStatuses.filter((status) => status === "FEHLER").length;
  const groupWarningCount = groupIssueStatuses.length - groupErrorCount;
  const groupIssueLabel =
    groupErrorCount > 0 && groupWarningCount > 0
      ? `${numberFormatter.format(groupErrorCount)} Fehler, ${numberFormatter.format(groupWarningCount)} Hinweis${
          groupWarningCount === 1 ? "" : "e"
        }`
      : groupErrorCount > 0
        ? `${numberFormatter.format(groupErrorCount)} Fehler`
        : groupWarningCount > 0
          ? `${numberFormatter.format(groupWarningCount)} Hinweis${groupWarningCount === 1 ? "" : "e"}`
          : null;

  return (
    <details
      className="source-accounts-details source-accounts-details--bank"
      open={isOpen}
      onToggle={(event) => onSectionToggle(groupKey, event.currentTarget.open, false)}
    >
      <summary>
        <span className="source-accounts-details__summary-title">
          <span>{title}</span>
          {groupIssueLabel ? <small>{groupIssueLabel}</small> : null}
        </span>
        <span className="source-accounts-details__summary-status">
          <AgentStatusBadge status={groupStatus} emptyLabel="Kein Status" />
          <strong>{numberFormatter.format(accounts.length)}</strong>
        </span>
      </summary>
      <div className="source-account-list source-account-list--bank">
        <div className="source-account-list__header">
          <span>{accountHeader}</span>
          <span>Geldstand</span>
          <span>Kreditlinie</span>
          <span>Verfügbar</span>
        </div>
        {accounts.map((account) => {
          const accountKey =
            account.providerAccountId ??
            account.accountNumber ??
            `${account.bankName ?? "bank"}-${getAccountLabel(account)}`;
          const accountLedgerEntries = bankLedgerEntries
            .filter(
              (entry) =>
                entry.accountId === account.accountId ||
                entry.providerAccountId === account.providerAccountId,
            )
            .slice(0, 8);
          const accountAgentId = getBankAccountAgentId(account);
          const accountAgentStatus = agentStatuses[accountAgentId];
          const accountAgentDisplayStatus = getBankAccountEffectiveStatus(account, agentStatuses);
          const accountAgentRunText = formatUpdatedAt(getAgentRunTimestamp(accountAgentStatus));
          const accountAgentSuccessText = formatUpdatedAt(getAgentSuccessTimestamp(accountAgentStatus));
          const showAccountAgentSuccess =
            accountAgentSuccessText && accountAgentSuccessText !== accountAgentRunText;
          const accountStatusTone = getBankAccountStatusTone(account, accountAgentStatus);
          const accountUpdatedAt = formatUpdatedAt(getBankAccountUpdatedAt(account));
          const accountIssueMessage = getBankAccountIssueMessage(account, accountAgentStatus);
          const accountSectionKey = `${groupKey}:account:${accountKey}`;
          const accountLogoPath = getBankAccountLogoPath(account);
          return (
            <details
              className="source-account-details"
              key={accountKey}
              open={isSectionOpen(accountSectionKey, false)}
              onToggle={(event) => {
                event.stopPropagation();
                onSectionToggle(accountSectionKey, event.currentTarget.open, false);
              }}
            >
              <summary className="source-account-row source-account-row--bank">
                <div className="source-account-row__main">
                  <span className="source-account-row__identity">
                    {accountLogoPath ? (
                      <img className="source-account-row__logo" src={accountLogoPath} alt="" aria-hidden="true" />
                    ) : null}
                    <strong>{getAccountLabel(account)}</strong>
                  </span>
                  <span className="source-account-row__meta">
                    <span className={`source-account-row__status source-account-row__status--${accountStatusTone}`}>
                      {getBankAccountStatusLabel(account, accountAgentStatus)}
                    </span>
                    <span>{account.bankName ?? accountHeader}</span>
                    <span className="source-account-row__agent">
                      Agent {getBankAccountAgentLabel(accountAgentId)}{" "}
                      <AgentStatusBadge status={accountAgentDisplayStatus} emptyLabel="Kein Status" />
                    </span>
                    {account.accountNumber ? <span>{account.accountNumber}</span> : null}
                    <span>Update {accountUpdatedAt || "Noch offen"}</span>
                    <span>Agent-Lauf {accountAgentRunText || "Noch offen"}</span>
                    {showAccountAgentSuccess ? <span>Agent-Erfolg {accountAgentSuccessText}</span> : null}
                    {typeof account.transactionCount === "number" ? (
                      <span>{numberFormatter.format(account.transactionCount)} Umsätze</span>
                    ) : null}
                    {account.latestTransactionDate ? (
                      <span>letzter Umsatz {formatUpdatedAt(account.latestTransactionDate)}</span>
                    ) : null}
                  </span>
                  {accountIssueMessage ? (
                    <span className="source-account-row__warning">{accountIssueMessage}</span>
                  ) : null}
                </div>
                <div className="source-account-row__value" data-label="Geldstand">
                  <strong>{privacyMode ? maskMoney(account.currentValue) : formatCurrency(account.currentValue ?? undefined)}</strong>
                </div>
                <div className="source-account-row__value" data-label="Kreditlinie">
                  <strong>{privacyMode ? maskMoney(account.creditLineEstimate) : formatCurrency(account.creditLineEstimate ?? undefined)}</strong>
                </div>
                <div className="source-account-row__value" data-label="Verfügbar">
                  <strong>{privacyMode ? maskMoney(account.availableWithCredit) : formatCurrency(account.availableWithCredit ?? undefined)}</strong>
                </div>
              </summary>
              <div className="source-account-row__mobile-details">
                <span>
                  <em>Agent</em>
                  <strong>
                    {getBankAccountAgentLabel(accountAgentId)}{" "}
                    <AgentStatusBadge status={accountAgentDisplayStatus} emptyLabel="Kein Status" />
                  </strong>
                </span>
                <span>
                  <em>Update</em>
                  <strong>{accountUpdatedAt || "Noch offen"}</strong>
                </span>
                <span>
                  <em>Agent-Lauf</em>
                  <strong>{accountAgentRunText || "Noch offen"}</strong>
                </span>
                {showAccountAgentSuccess ? (
                  <span>
                    <em>Agent-Erfolg</em>
                    <strong>{accountAgentSuccessText}</strong>
                  </span>
                ) : null}
                <span>
                  <em>Umsätze</em>
                  <strong>
                    {typeof account.transactionCount === "number"
                      ? numberFormatter.format(account.transactionCount)
                      : "—"}
                  </strong>
                </span>
                <span>
                  <em>Letzter Umsatz</em>
                  <strong>{account.latestTransactionDate ? formatUpdatedAt(account.latestTransactionDate) : "—"}</strong>
                </span>
                {account.accountNumber ? (
                  <span>
                    <em>Konto</em>
                    <strong>{account.accountNumber}</strong>
                  </span>
                ) : null}
              </div>
              {accountLedgerEntries.length ? (
                <div className="bank-ledger-list">
                  {accountLedgerEntries.map((entry) => {
                    const ledgerTone = getBankLedgerTone(entry);
                    return (
                      <div className="bank-ledger-row" key={entry.id}>
                        <div className="bank-ledger-row__main">
                          <strong>{entry.bookingText ?? "Bankumsatz"}</strong>
                          <span>
                            {formatUpdatedAt(entry.date)}
                            {" · "}
                            {getBankLedgerCategoryLabel(entry.category)}
                            {entry.counterpartyName ? ` · ${entry.counterpartyName}` : ""}
                          </span>
                        </div>
                        <div className={`bank-ledger-row__amount performance-value--${ledgerTone}`}>
                          {privacyMode ? maskSignedMoney(entry.amount) : formatSignedMoney(entry.amount, entry.currency ?? "EUR")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="source-account-transactions-placeholder">
                  Keine Umsätze im aktuell geladenen Zeitraum.
                </div>
              )}
            </details>
          );
        })}
      </div>
    </details>
  );
}

function PositionsTable({
  positions,
  privacyMode,
  priceHistoryByPosition,
  sectionKey,
  isSectionOpen,
  onSectionToggle,
  searchQuery = "",
}: {
  positions: PortfolioPosition[];
  privacyMode: boolean;
  priceHistoryByPosition?: Record<string, PriceChartPoint[]>;
  sectionKey?: string;
  isSectionOpen?: UiSectionOpenGetter;
  onSectionToggle?: UiSectionToggleHandler;
  searchQuery?: string;
}) {
  const [sortState, setSortState] = useState<PositionSortState>({ key: "position", direction: "asc" });
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const sortedPositions = useMemo(
    () => sortPositionsByTableState(positions, sortState),
    [positions, sortState],
  );

  function togglePositionSort(key: PositionSortKey) {
    setSortState((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  function renderSortHeader(label: string, key: PositionSortKey, className?: string) {
    const isActive = sortState.key === key;
    const Icon = !isActive ? ArrowUpDown : sortState.direction === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={className}>
        <button
          type="button"
          className={`positions-table__sort-button${isActive ? " is-active" : ""}`}
          onClick={() => togglePositionSort(key)}
          aria-sort={isActive ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}
        >
          <span>{label}</span>
          <Icon aria-hidden="true" />
        </button>
      </th>
    );
  }

  return (
    <>
      <div className="mobile-positions-list">
        {sortedPositions.length ? sortedPositions.map((position) => {
          const positionPerformance = getPositionPerformance(position);
          const performanceTone = getPerformanceTone(positionPerformance.performance);
          const dayChange = getPositionDayChange(position);
          const dayTone = getPerformanceTone(dayChange.value);
          const statusMeta = getPositionStatusMeta(position);
          const assetClassInfo = normalizePositionAssetClass(position);
          const itemKey = `${sectionKey ?? "positions"}:position:${position.id}`;
          const positionCode = [position.isin, position.wkn].filter(Boolean).join(" / ");
          const isSearchMatch = positionMatchesSearch(position, normalizedSearchQuery);
          const positionHistory = priceHistoryByPosition?.[position.id] ?? [];

          return (
            <details
              className={`mobile-position-card${isSearchMatch ? " mobile-position-card--search-match" : ""}`}
              key={position.id}
              open={isSectionOpen?.(itemKey, false) ?? false}
              onToggle={(event) => {
                event.stopPropagation();
                onSectionToggle?.(itemKey, event.currentTarget.open, false);
              }}
            >
              <summary>
                <span
                  className={`mobile-position-card__status mobile-position-card__status--${statusMeta.tone}`}
                  title={statusMeta.label}
                />
                <span className="mobile-position-card__main">
                  <strong>{position.name}</strong>
                  <span>{positionCode || assetClassInfo.label}</span>
                </span>
                <span className="mobile-position-card__value">
                  {privacyMode ? maskMoney(position.currentValue) : formatCurrency(position.currentValue ?? undefined)}
                </span>
                <span className="mobile-position-card__metrics">
                  <span>
                    <em>G/V</em>
                    <strong className={`performance-cell--${performanceTone}`}>
                      {privacyMode
                        ? maskSignedMoney(positionPerformance.performance)
                        : formatSignedMoney(positionPerformance.performance, positionPerformance.currency)}
                    </strong>
                    <small className={`performance-cell--${performanceTone}`}>
                      {formatSignedPercent(positionPerformance.percentage)}
                    </small>
                  </span>
                  <span>
                    <em>Heute</em>
                    <strong className={`performance-cell--${dayTone}`}>
                      {privacyMode ? maskSignedMoney(dayChange.value) : formatSignedMoney(dayChange.value)}
                    </strong>
                    <small className={`performance-cell--${dayTone}`}>
                      {formatSignedPercent(dayChange.percentage)}
                    </small>
                  </span>
                  <span className="mobile-position-card__quote">
                    <em>Kurs</em>
                    <strong>{formatQuoteText(position)}</strong>
                  </span>
                </span>
              </summary>
              <div className="mobile-position-card__details">
                <span>
                  <em>Menge</em>
                  <strong>{formatQuantity(position)}</strong>
                </span>
                <span>
                  <em>Kursdatum</em>
                  <strong>{formatUpdatedAt(getPositionDisplayUpdatedAt(position))}</strong>
                </span>
                <span>
                  <em>Einstand</em>
                  <strong>
                    {privacyMode
                      ? maskMoney(positionPerformance.cost)
                      : formatMoney(positionPerformance.cost, positionPerformance.currency)}
                  </strong>
                </span>
                <span>
                  <em>Assetklasse</em>
                  <strong title={position.category ?? undefined}>{assetClassInfo.label}</strong>
                </span>
                <span>
                  <em>Status</em>
                  <strong>{statusMeta.label}</strong>
                </span>
                <span>
                  <em>Quelle</em>
                  <strong>{getQuoteProviderLabel(position) ?? "—"}</strong>
                </span>
              </div>
              <PositionPriceChart
                position={position}
                history={positionHistory}
                privacyMode={privacyMode}
              />
            </details>
          );
        }) : (
          <div className="mobile-position-card mobile-position-card--empty">
            Keine Positionen geladen.
          </div>
        )}
      </div>
      <div className="positions-table-wrap positions-table-wrap--embedded">
        <table className="positions-table positions-table--embedded">
          <thead>
            <tr>
              {renderSortHeader("Position", "position")}
              {renderSortHeader("Wert", "value", "numeric")}
              {renderSortHeader("G/V", "performance", "numeric")}
              {renderSortHeader("Perf.", "performancePct", "numeric")}
              {renderSortHeader("Heute", "today", "numeric")}
              {renderSortHeader("Heute %", "todayPct", "numeric")}
              {renderSortHeader("Menge", "quantity")}
              {renderSortHeader("Kurs", "quote")}
              {renderSortHeader("Einstand", "cost", "numeric")}
              {renderSortHeader("Assetklasse", "assetClass")}
              {renderSortHeader("Aktualisiert", "updatedAt")}
            </tr>
          </thead>
          <tbody>
            {sortedPositions.length ? sortedPositions.map((position) => {
              const positionPerformance = getPositionPerformance(position);
              const performanceTone = getPerformanceTone(positionPerformance.performance);
              const dayChange = getPositionDayChange(position);
              const isSearchMatch = positionMatchesSearch(position, normalizedSearchQuery);
              const assetClassInfo = normalizePositionAssetClass(position);
              const positionHistory = priceHistoryByPosition?.[position.id] ?? [];
              const chartKey = `${sectionKey ?? "positions"}:position:${position.id}:chart`;
              const isChartOpen = isSectionOpen?.(chartKey, false) ?? false;

              return [
                <tr className={isSearchMatch ? "positions-table__row--search-match" : undefined} key={position.id}>
                  <td className="position-name-cell">
                    <strong>{position.name}</strong>
                    <span>
                      {[position.isin, position.wkn].filter(Boolean).join(" / ") || "—"}
                    </span>
                    <button
                      type="button"
                      className="position-chart-toggle"
                      onClick={() => onSectionToggle?.(chartKey, !isChartOpen, false)}
                    >
                      {isChartOpen ? "Chart ausblenden" : "Chart"}
                    </button>
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
                  <td title={position.category ?? undefined}>{assetClassInfo.label}</td>
                  <td className="positions-table__updated-at">
                    {formatUpdatedAt(getPositionDisplayUpdatedAt(position))}
                  </td>
                </tr>,
                isChartOpen ? (
                  <tr className="position-chart-row" key={`${position.id}:chart`}>
                    <td colSpan={11}>
                      <PositionPriceChart
                        position={position}
                        history={positionHistory}
                        privacyMode={privacyMode}
                      />
                    </td>
                  </tr>
                ) : null,
              ];
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
    </>
  );
}

function VbvAccountInformationDetails({
  accountInformation,
  privacyMode,
  sectionKey,
  isOpen,
  onSectionToggle,
}: {
  accountInformation: SourceSummaryVbvAccountInformation;
  privacyMode: boolean;
  sectionKey: string;
  isOpen: boolean;
  onSectionToggle: UiSectionToggleHandler;
}) {
  const contracts = accountInformation.contracts ?? [];
  const summaryTone = getPerformanceTone(accountInformation.performanceValue);
  return (
    <details
      className="source-accounts-details vbv-account-details"
      open={isOpen}
      onToggle={(event) => onSectionToggle(sectionKey, event.currentTarget.open, false)}
    >
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

function EquatePlusManualPanel({
  draft,
  manualInput,
  position,
  privacyMode,
  saveStatus,
  saveError,
  onDraftChange,
  onSubmit,
}: {
  draft: EquatePlusDraft;
  manualInput: EquatePlusManualInputDocument | null;
  position?: PortfolioPosition;
  privacyMode: boolean;
  saveStatus: EquatePlusSaveStatus;
  saveError: string | null;
  onDraftChange: (field: keyof EquatePlusDraft, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const saveLabel =
    saveStatus === "saving"
      ? "Speichert"
      : saveStatus === "saved"
        ? "Gespeichert"
        : "Speichern";
  const performanceTone = getPerformanceTone(position?.performanceValue);

  return (
    <form className="source-card__manual-panel" onSubmit={onSubmit}>
      <div className="source-card__manual-heading">
        <strong>Novartis</strong>
        <span>CH0012005267 · SIX Swiss Exchange</span>
      </div>
      <div className="source-card__manual-grid">
        <label>
          <span>Anteile</span>
          <input
            inputMode="decimal"
            value={draft.quantity}
            onChange={(event) => onDraftChange("quantity", event.target.value)}
            placeholder="16,2"
          />
        </label>
        <label>
          <span>Einstand EUR</span>
          <input
            inputMode="decimal"
            value={draft.entryValueEur}
            onChange={(event) => onDraftChange("entryValueEur", event.target.value)}
            placeholder="1500"
          />
        </label>
        <button type="submit" disabled={saveStatus === "saving"}>
          {saveLabel}
        </button>
      </div>
      <dl className="source-card__manual-facts">
        <div>
          <dt>Kurs</dt>
          <dd>{formatMoney(position?.quotePrice, position?.quoteCurrency ?? "CHF")}</dd>
        </div>
        <div>
          <dt>Wert</dt>
          <dd>{privacyMode ? maskMoney(position?.currentValue) : formatCurrency(position?.currentValue ?? undefined)}</dd>
        </div>
        <div>
          <dt>G/V</dt>
          <dd className={`performance-value performance-value--${performanceTone}`}>
            {privacyMode ? maskSignedMoney(position?.performanceValue) : formatSignedMoney(position?.performanceValue)}
            <small>{formatSignedPercent(position?.performancePct)}</small>
          </dd>
        </div>
        <div>
          <dt>Eingabe</dt>
          <dd>{formatUpdatedAt(manualInput?.updatedAt)}</dd>
        </div>
      </dl>
      {saveError ? <p className="source-card__manual-error">{saveError}</p> : null}
    </form>
  );
}

function CashHomeManualPanel({
  draft,
  manualInput,
  privacyMode,
  saveStatus,
  saveError,
  onDraftChange,
  onSubmit,
}: {
  draft: CashHomeDraft;
  manualInput: CashHomeManualInputDocument | null;
  privacyMode: boolean;
  saveStatus: EquatePlusSaveStatus;
  saveError: string | null;
  onDraftChange: (field: keyof CashHomeDraft, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const amount = typeof manualInput?.amountEur === "number" ? manualInput.amountEur : null;
  const saveLabel =
    saveStatus === "saving"
      ? "Speichert"
      : saveStatus === "saved"
        ? "Gespeichert"
        : "Speichern";

  return (
    <form className="source-card__manual-panel" onSubmit={onSubmit}>
      <div className="source-card__manual-heading">
        <strong>Bargeld zu Hause</strong>
        <span>Manuelle Cash-Position · EUR</span>
      </div>
      <div className="source-card__manual-grid source-card__manual-grid--compact">
        <label>
          <span>Barbestand EUR</span>
          <input
            inputMode="decimal"
            value={draft.amountEur}
            onChange={(event) => onDraftChange("amountEur", event.target.value)}
            placeholder="0"
          />
        </label>
        <button type="submit" disabled={saveStatus === "saving"}>
          {saveLabel}
        </button>
      </div>
      <dl className="source-card__manual-facts">
        <div>
          <dt>Gespeichert</dt>
          <dd>{privacyMode ? maskMoney(amount) : formatCurrency(amount)}</dd>
        </div>
        <div>
          <dt>Eingabe</dt>
          <dd>{formatUpdatedAt(manualInput?.updatedAt)}</dd>
        </div>
      </dl>
      {saveError ? <p className="source-card__manual-error">{saveError}</p> : null}
    </form>
  );
}

function App() {
  const [sourceSummaries, setSourceSummaries] = useState<
    Record<string, SourceSummaryDocument>
  >({});
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatusDocument>>({});
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [positionPriceHistory, setPositionPriceHistory] = useState<PositionPriceHistoryEntry[]>([]);
  const [bankLedgerEntries, setBankLedgerEntries] = useState<BankLedgerEntryDocument[]>([]);
  const [documentInboxItems, setDocumentInboxItems] = useState<DocumentInboxItem[]>([]);
  const [equatePlusManualInput, setEquatePlusManualInput] =
    useState<EquatePlusManualInputDocument | null>(null);
  const [equatePlusDraft, setEquatePlusDraft] = useState<EquatePlusDraft>(emptyEquatePlusDraft);
  const [equatePlusSaveStatus, setEquatePlusSaveStatus] =
    useState<EquatePlusSaveStatus>("idle");
  const [equatePlusSaveError, setEquatePlusSaveError] = useState<string | null>(null);
  const [cashHomeManualInput, setCashHomeManualInput] =
    useState<CashHomeManualInputDocument | null>(() => loadStoredCashHomeManualInput());
  const [cashHomeDraft, setCashHomeDraft] =
    useState<CashHomeDraft>(() => cashHomeDraftFromInput(loadStoredCashHomeManualInput()));
  const [cashHomeSaveStatus, setCashHomeSaveStatus] =
    useState<EquatePlusSaveStatus>("idle");
  const [cashHomeSaveError, setCashHomeSaveError] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [quoteRequestStatus, setQuoteRequestStatus] = useState<CommandRequestStatus>("idle");
  const [healthRefreshStatus, setHealthRefreshStatus] = useState<CommandRequestStatus>("idle");
  const [tradeRepublicPortalRequestStatus, setTradeRepublicPortalRequestStatus] =
    useState<CommandRequestStatus>("idle");
  const [tradeRepublicPortalRequestError, setTradeRepublicPortalRequestError] = useState<string | null>(null);
  const [repairRequestStatuses, setRepairRequestStatuses] = useState<Record<string, CommandRequestStatus>>({});
  const [repairRequestErrors, setRepairRequestErrors] = useState<Record<string, string | null>>({});
  const [pendingDocumentDecisionId, setPendingDocumentDecisionId] = useState<string | null>(null);
  const [pendingDocumentOpenId, setPendingDocumentOpenId] = useState<string | null>(null);
  const [documentDecisionError, setDocumentDecisionError] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<
    "auth-required" | "loading" | "live" | "blocked"
  >("auth-required");
  const [privacyMode, setPrivacyMode] = useState(true);
  const [darkMode, setDarkMode] = useState(() => loadStoredDarkMode());
  const [expandedSections, setExpandedSections] = useState<UiExpandedSections>(() => loadStoredExpandedSections());
  const [sourceOrder, setSourceOrder] = useState<string[]>(() => loadStoredSourceOrder());
  const [depotSearchQuery, setDepotSearchQuery] = useState("");
  const [isDepotEditMode, setIsDepotEditMode] = useState(false);
  const [tradeRepublicDisplayMode, setTradeRepublicDisplayMode] =
    useState<TradeRepublicDisplayMode>(() => {
      if (typeof window === "undefined") return "current";
      const saved = window.localStorage.getItem("finanztool-traderepublic-display-mode");
      return saved === "broker" || saved === "current" ? saved : "current";
    });

  useEffect(() => {
    window.localStorage.setItem("finanztool-traderepublic-display-mode", tradeRepublicDisplayMode);
  }, [tradeRepublicDisplayMode]);

  useEffect(() => {
    window.localStorage.setItem(themeModeStorageKey, darkMode ? "dark" : "light");
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
  }, [darkMode]);

  useEffect(() => {
    const services = getFirebaseServices();
    if (!services) return;

    return onAuthStateChanged(services.auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      setAuthError(null);
      if (!user) {
        const storedCashHomeManualInput = loadStoredCashHomeManualInput();
        setSourceSummaries({});
        setAgentStatuses({});
        setPositions([]);
        setPositionPriceHistory([]);
        setBankLedgerEntries([]);
        setDocumentInboxItems([]);
        setEquatePlusManualInput(null);
        setEquatePlusDraft(emptyEquatePlusDraft);
        setCashHomeManualInput(storedCashHomeManualInput);
        setCashHomeDraft(cashHomeDraftFromInput(storedCashHomeManualInput));
        setSystemHealth(null);
        setExpandedSections(loadStoredExpandedSections());
        setSourceOrder(loadStoredSourceOrder());
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
      loadPositionPriceHistory(services.db),
      loadBankLedgerEntries(services.db),
      loadDocumentInboxItems(services.db),
      loadEquatePlusManualInput(services.db),
      loadCashHomeManualInput(services.db),
      loadSystemHealth(services.db),
      loadUiPreferences(services.db),
    ])
      .then(([
        summaries,
        loadedAgentStatuses,
        loadedPositions,
        loadedPositionPriceHistory,
        loadedBankLedgerEntries,
        loadedDocumentInboxItems,
        loadedEquatePlusManualInput,
        loadedCashHomeManualInput,
        health,
        uiPreferences,
      ]) => {
        if (!isMounted) return;
        setSourceSummaries(summaries);
        setAgentStatuses(loadedAgentStatuses);
        setPositions(loadedPositions);
        setPositionPriceHistory(loadedPositionPriceHistory);
        setBankLedgerEntries(loadedBankLedgerEntries);
        setDocumentInboxItems(loadedDocumentInboxItems);
        setEquatePlusManualInput(loadedEquatePlusManualInput);
        setEquatePlusDraft(equatePlusDraftFromInput(loadedEquatePlusManualInput));
        const effectiveCashHomeManualInput = loadedCashHomeManualInput ?? loadStoredCashHomeManualInput();
        if (loadedCashHomeManualInput) saveStoredCashHomeManualInput(loadedCashHomeManualInput);
        setCashHomeManualInput(effectiveCashHomeManualInput);
        setCashHomeDraft(cashHomeDraftFromInput(effectiveCashHomeManualInput));
        setSystemHealth(health);
        setExpandedSections((current) => ({
          ...current,
          ...(uiPreferences?.expandedSections ?? {}),
        }));
        if (uiPreferences?.sourceOrder?.length) {
          const nextSourceOrder = normalizeSourceOrder(uiPreferences.sourceOrder);
          setSourceOrder(nextSourceOrder);
          saveStoredSourceOrder(nextSourceOrder);
        }
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

  function persistExpandedSections(next: UiExpandedSections) {
    saveStoredExpandedSections(next);
    const services = getFirebaseServices();
    if (!services || !authUser) return;
    void saveUiPreferences(services.db, { expandedSections: next }, authUser.email).catch((error) => {
      console.warn("UI-Zustand wurde lokal gespeichert; Firestore-Sync wartet auf passende Regeln.", error);
    });
  }

  function persistSourceOrder(next: string[]) {
    const normalized = normalizeSourceOrder(next);
    saveStoredSourceOrder(normalized);
    const services = getFirebaseServices();
    if (!services || !authUser) return;
    void saveUiPreferences(services.db, { sourceOrder: normalized }, authUser.email).catch((error) => {
      console.warn("Depot-Reihenfolge wurde lokal gespeichert; Firestore-Sync wartet auf passende Regeln.", error);
    });
  }

  function setUiSectionOpen(sectionKey: string, isExpanded: boolean, defaultOpen?: boolean) {
    setExpandedSections((current) => {
      if (current[sectionKey] === isExpanded) return current;
      if (current[sectionKey] === undefined && defaultOpen !== undefined && isExpanded === defaultOpen) {
        return current;
      }
      const next = { ...current, [sectionKey]: isExpanded };
      persistExpandedSections(next);
      return next;
    });
  }

  function getUiSectionOpen(sectionKey: string, defaultOpen = false) {
    return expandedSections[sectionKey] ?? defaultOpen;
  }

  function handleDetailsToggle(sectionKey: string, event: SyntheticEvent<HTMLDetailsElement>, defaultOpen = false) {
    setUiSectionOpen(sectionKey, event.currentTarget.open, defaultOpen);
  }

  function toggleSourceCard(sourceId: string) {
    const sectionKey = `source:${sourceId}`;
    setUiSectionOpen(sectionKey, !getUiSectionOpen(sectionKey, true));
  }

  function collapseAllSourceCards() {
    setExpandedSections((current) => {
      const next = { ...current };
      for (const source of sourceOverviews) {
        next[`source:${source.id}`] = false;
      }
      persistExpandedSections(next);
      return next;
    });
  }

  function moveSourceCard(sourceId: string, direction: -1 | 1) {
    setSourceOrder((current) => {
      const normalized = normalizeSourceOrder(current);
      const currentIndex = normalized.indexOf(sourceId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= normalized.length) return current;
      const next = [...normalized];
      [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
      persistSourceOrder(next);
      return next;
    });
  }

  async function refreshPortfolioData() {
    const services = getFirebaseServices();
    if (!services) return;
    const [
      summaries,
      loadedAgentStatuses,
      loadedPositions,
      loadedPositionPriceHistory,
      loadedBankLedgerEntries,
      loadedDocumentInboxItems,
      loadedEquatePlusManualInput,
      loadedCashHomeManualInput,
      health,
      uiPreferences,
    ] = await Promise.all([
      loadSourceSummaries(services.db),
      loadAgentStatuses(services.db),
      loadSourcePositions(services.db),
      loadPositionPriceHistory(services.db),
      loadBankLedgerEntries(services.db),
      loadDocumentInboxItems(services.db),
      loadEquatePlusManualInput(services.db),
      loadCashHomeManualInput(services.db),
      loadSystemHealth(services.db),
      loadUiPreferences(services.db),
    ]);
    setSourceSummaries(summaries);
    setAgentStatuses(loadedAgentStatuses);
    setPositions(loadedPositions);
    setPositionPriceHistory(loadedPositionPriceHistory);
    setBankLedgerEntries(loadedBankLedgerEntries);
    setDocumentInboxItems(loadedDocumentInboxItems);
    setEquatePlusManualInput(loadedEquatePlusManualInput);
    setEquatePlusDraft(equatePlusDraftFromInput(loadedEquatePlusManualInput));
    const effectiveCashHomeManualInput = loadedCashHomeManualInput ?? loadStoredCashHomeManualInput();
    if (loadedCashHomeManualInput) saveStoredCashHomeManualInput(loadedCashHomeManualInput);
    setCashHomeManualInput(effectiveCashHomeManualInput);
    setCashHomeDraft(cashHomeDraftFromInput(effectiveCashHomeManualInput));
    setSystemHealth(health);
    setExpandedSections((current) => ({
      ...current,
      ...(uiPreferences?.expandedSections ?? {}),
    }));
    if (uiPreferences?.sourceOrder?.length) {
      const nextSourceOrder = normalizeSourceOrder(uiPreferences.sourceOrder);
      setSourceOrder(nextSourceOrder);
      saveStoredSourceOrder(nextSourceOrder);
    }
  }

  function handleEquatePlusDraftChange(field: keyof EquatePlusDraft, value: string) {
    setEquatePlusDraft((current) => ({ ...current, [field]: value }));
    setEquatePlusSaveStatus("idle");
    setEquatePlusSaveError(null);
  }

  function handleCashHomeDraftChange(field: keyof CashHomeDraft, value: string) {
    setCashHomeDraft((current) => ({ ...current, [field]: value }));
    setCashHomeSaveStatus("idle");
    setCashHomeSaveError(null);
  }

  async function handleSaveEquatePlusInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const services = getFirebaseServices();
    if (!services || !authUser) return;

    const quantity = parseEditableNumber(equatePlusDraft.quantity);
    const entryValueEur = parseEditableNumber(equatePlusDraft.entryValueEur);
    if (typeof quantity !== "number" || quantity <= 0) {
      setEquatePlusSaveStatus("error");
      setEquatePlusSaveError("Bitte eine positive Anzahl eingeben.");
      return;
    }
    if (typeof entryValueEur !== "number" || entryValueEur <= 0) {
      setEquatePlusSaveStatus("error");
      setEquatePlusSaveError("Bitte einen positiven Einstandswert in EUR eingeben.");
      return;
    }

    try {
      setEquatePlusSaveStatus("saving");
      setEquatePlusSaveError(null);
      await saveEquatePlusManualInput(services.db, { quantity, entryValueEur }, authUser.email);
      const localInput: EquatePlusManualInputDocument = {
        id: "equateplus_novartis",
        source: "equateplus",
        instrumentId: "novartis",
        isin: "CH0012005267",
        name: "Novartis",
        quantity,
        entryValueEur,
        entryValueCurrency: "EUR",
        discountPct: 0.15,
        updatedBy: authUser.email,
        updatedAt: new Date(),
      };
      setEquatePlusManualInput(localInput);
      setEquatePlusDraft(equatePlusDraftFromInput(localInput));
      await requestQuoteSync(services.db, authUser.email);
      setQuoteRequestStatus("requested");
      setEquatePlusSaveStatus("saved");
    } catch (error) {
      setEquatePlusSaveStatus("error");
      setEquatePlusSaveError(error instanceof Error ? error.message : "EquatePlus-Eingabe konnte nicht gespeichert werden.");
    }
  }

  async function handleSaveCashHomeInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const services = getFirebaseServices();

    const amountEur = parseEditableNumber(cashHomeDraft.amountEur);
    if (typeof amountEur !== "number" || amountEur < 0) {
      setCashHomeSaveStatus("error");
      setCashHomeSaveError("Bitte einen Betrag ab 0 EUR eingeben.");
      return;
    }

    const localInput: CashHomeManualInputDocument = {
      id: "cash_home",
      source: "cash_home",
      amountEur,
      currency: "EUR",
      updatedBy: authUser?.email ?? "local",
      updatedAt: new Date(),
    };

    try {
      setCashHomeSaveStatus("saving");
      setCashHomeSaveError(null);
      saveStoredCashHomeManualInput(localInput);
      setCashHomeManualInput(localInput);
      setCashHomeDraft(cashHomeDraftFromInput(localInput));

      if (!services || !authUser) {
        setCashHomeSaveStatus("saved");
        return;
      }

      await saveCashHomeManualInput(services.db, { amountEur }, authUser.email);
      setCashHomeSaveStatus("saved");
    } catch (error) {
      setCashHomeSaveStatus("saved");
      setCashHomeSaveError(
        error instanceof Error
          ? `Lokal gespeichert; Firestore-Sync fehlgeschlagen: ${error.message}`
          : "Lokal gespeichert; Firestore-Sync fehlgeschlagen.",
      );
    }
  }

  async function handleDocumentDecision(
    item: DocumentInboxItem,
    decision: "covered" | "not_relevant" | "needs_parser" | "deferred",
    reason: string,
  ) {
    const services = getFirebaseServices();
    if (!services || !authUser) return;

    try {
      setDocumentDecisionError(null);
      setPendingDocumentDecisionId(item.id);
      await markDocumentInboxItemDecision(services.db, item, decision, reason, authUser.email, "item");
      const loadedDocumentInboxItems = await loadDocumentInboxItems(services.db);
      setDocumentInboxItems(loadedDocumentInboxItems);
    } catch (error) {
      setDocumentDecisionError(
        error instanceof Error
          ? `Dokumententscheidung konnte nicht gespeichert werden: ${error.message}`
          : "Dokumententscheidung konnte nicht gespeichert werden.",
      );
    } finally {
      setPendingDocumentDecisionId(null);
    }
  }

  async function handleOpenDocument(item: DocumentInboxItem) {
    if (item.documentUrl && !item.documentStoragePath) {
      window.open(item.documentUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (!item.documentStoragePath) return;
    const services = getFirebaseServices();
    if (!services) return;
    const documentWindow = window.open("", "_blank");
    if (documentWindow) {
      documentWindow.document.title = item.title;
      documentWindow.document.body.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      documentWindow.document.body.style.padding = "24px";
      documentWindow.document.body.textContent = "Dokument wird geladen ...";
    }

    try {
      setPendingDocumentOpenId(item.id);
      const downloadUrl = await getDownloadURL(storageRef(services.storage, item.documentStoragePath));
      if (documentWindow) {
        documentWindow.location.href = downloadUrl;
      } else {
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      if (documentWindow) {
        documentWindow.document.body.textContent =
          error instanceof Error
            ? `Dokument konnte nicht geöffnet werden: ${error.message}`
            : "Dokument konnte nicht geöffnet werden.";
      }
      console.error(error);
    } finally {
      setPendingDocumentOpenId(null);
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

  async function handleRequestHealthRefresh() {
    const services = getFirebaseServices();
    if (!services || !authUser) return;

    try {
      setHealthRefreshStatus("requesting");
      await requestHealthCheck(services.db, authUser.email);
      setHealthRefreshStatus("requested");
      for (let attempt = 0; attempt < 45; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const command = await loadHealthCheckCommand(services.db);
        if (command?.status === "RUNNING") {
          setHealthRefreshStatus("running");
          continue;
        }
        if (command?.status === "DONE") {
          await refreshPortfolioData();
          setHealthRefreshStatus("idle");
          window.location.reload();
          return;
        }
        if (command?.status === "ERROR") {
          await refreshPortfolioData().catch(() => undefined);
          setHealthRefreshStatus("error");
          return;
        }
      }
      await refreshPortfolioData().catch(() => undefined);
      setHealthRefreshStatus("idle");
    } catch {
      setHealthRefreshStatus("error");
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

  async function handleRequestRepairAction(action: AlertRepairAction) {
    if (action.id === "traderepublic") {
      await handleRequestTradeRepublicPortalRefresh();
      return;
    }

    const services = getFirebaseServices();
    if (!services || !authUser) return;

    try {
      setRepairRequestErrors((current) => ({ ...current, [action.id]: null }));
      setRepairRequestStatuses((current) => ({ ...current, [action.id]: "requesting" }));
      await requestAutomationCommand(services.db, action.commandId, action.commandType, authUser.email);
      setRepairRequestStatuses((current) => ({ ...current, [action.id]: "requested" }));
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 4000));
        const [command, loadedAgentStatuses, health] = await Promise.all([
          loadAutomationCommand(services.db, action.commandId),
          loadAgentStatuses(services.db),
          loadSystemHealth(services.db),
        ]);
        setAgentStatuses(loadedAgentStatuses);
        setSystemHealth(health);
        if (command?.status === "RUNNING") {
          setRepairRequestStatuses((current) => ({ ...current, [action.id]: "running" }));
          continue;
        }
        if (command?.status === "DONE") {
          await refreshPortfolioData();
          setRepairRequestStatuses((current) => ({ ...current, [action.id]: "idle" }));
          return;
        }
        if (command?.status === "ERROR") {
          await refreshPortfolioData().catch(() => undefined);
          setRepairRequestErrors((current) => ({
            ...current,
            [action.id]: command.errorMessage ?? `${action.label} ist fehlgeschlagen.`,
          }));
          setRepairRequestStatuses((current) => ({ ...current, [action.id]: "error" }));
          return;
        }
      }
      await refreshPortfolioData().catch(() => undefined);
      setRepairRequestStatuses((current) => ({ ...current, [action.id]: "idle" }));
    } catch (error) {
      setRepairRequestErrors((current) => ({
        ...current,
        [action.id]: error instanceof Error ? error.message : `${action.label} konnte nicht angefordert werden.`,
      }));
      setRepairRequestStatuses((current) => ({ ...current, [action.id]: "error" }));
    }
  }

  const valuationSummaries = useMemo<Record<string, SourceSummaryDocument>>(() => {
    if (tradeRepublicDisplayMode !== "current") return sourceSummaries;
    const tradeRepublicCurrentSummary = getTradeRepublicCurrentSummary(sourceSummaries.traderepublic);
    if (!tradeRepublicCurrentSummary) return sourceSummaries;
    return {
      ...sourceSummaries,
      traderepublic: tradeRepublicCurrentSummary,
    };
  }, [sourceSummaries, tradeRepublicDisplayMode]);

  const valuationPositions = useMemo(
    () =>
      tradeRepublicDisplayMode === "current"
        ? positions.map(getTradeRepublicCurrentPosition)
        : positions,
    [positions, tradeRepublicDisplayMode],
  );

  const positionStatsBySource = useMemo(() => {
    const stats: Record<
      string,
      { count: number; valuedCount: number; value: number; cashValue: number; cashCount: number }
    > = {};
    for (const position of valuationPositions) {
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
  }, [valuationPositions]);

  const sources = useMemo(
    () =>
      sourceOverviews.map((source) => {
        const baseSummary = valuationSummaries[source.summaryId ?? source.id];
        const cashHomeValue =
          source.id === "bank_accounts" && typeof cashHomeManualInput?.amountEur === "number"
            ? cashHomeManualInput.amountEur
            : 0;
        const summary =
          source.id === "bank_accounts" && cashHomeValue
            ? ({
                ...(baseSummary ?? { source: "bank_accounts" }),
                currentValue: addMoneyValue(
                  baseSummary?.currentValue ?? baseSummary?.netValue ?? baseSummary?.cashValue,
                  cashHomeValue,
                ),
                cashValue: addMoneyValue(
                  baseSummary?.cashValue ?? baseSummary?.currentValue ?? baseSummary?.netValue,
                  cashHomeValue,
                ),
                netValue: addMoneyValue(
                  baseSummary?.netValue ?? baseSummary?.currentValue ?? baseSummary?.cashValue,
                  cashHomeValue,
                ),
                availableCash: addMoneyValue(baseSummary?.availableCash, cashHomeValue),
                availableWithCredit: addMoneyValue(baseSummary?.availableWithCredit, cashHomeValue),
              } satisfies SourceSummaryDocument)
            : baseSummary;
        const agentStatus = getSourceAgentStatus(source.id, agentStatuses);
        const agentDisplayStatus = getAgentDisplayStatus(agentStatus);
        const sourceHealthStatus = getHealthStatusForSource(source.id, systemHealth);
        const sourceHealthMessage = getHealthMessageForSource(source.id, systemHealth);
        const bankAccounts = source.id === "bank_accounts" ? (summary?.accounts ?? []) : [];
        const bankAccountStatus = getBankAccountsAggregateStatus(bankAccounts, agentStatuses);
        const bankAccountMessage =
          bankAccountStatus && bankAccountStatus !== "OK"
            ? getBankAccountsAggregateMessage(bankAccounts, agentStatuses)
            : null;
        const combinedAgentStatus = getWorseStatus(
          getWorseStatus(agentDisplayStatus, bankAccountStatus),
          sourceHealthStatus,
        );
        const combinedAgentMessage =
          sourceHealthMessage && getStatusRank(sourceHealthStatus) >= getStatusRank(getWorseStatus(agentDisplayStatus, bankAccountStatus))
            ? sourceHealthMessage
            : bankAccountMessage && getStatusRank(bankAccountStatus) >= getStatusRank(agentDisplayStatus)
            ? bankAccountMessage
            : agentStatus?.message ?? bankAccountMessage;
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
            agentStatus: combinedAgentStatus,
            agentMessage: combinedAgentMessage,
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
          externalQuoteDepotValue: summary.externalQuoteDepotValue ?? source.externalQuoteDepotValue,
          externalQuoteDifference: summary.externalQuoteDifference ?? source.externalQuoteDifference,
          externalQuoteDataUpdatedAt: summary.externalQuoteDataUpdatedAt ?? source.externalQuoteDataUpdatedAt,
          externalQuoteDataProvider: summary.externalQuoteDataProvider ?? source.externalQuoteDataProvider,
          lastAgentRunAt: summary.lastAgentRunAt ?? agentStatus?.lastAgentRunAt ?? source.lastAgentRunAt,
          lastAgentSuccessAt:
            summary.lastAgentSuccessAt ?? agentStatus?.lastAgentSuccessAt ?? agentStatus?.lastSuccessAt ?? source.lastAgentSuccessAt,
          lastDataChangeAt: summary.lastDataChangeAt ?? source.lastDataChangeAt,
          latestQuoteAsOf: summary.latestQuoteAsOf ?? null,
          oldestQuoteAsOf: summary.oldestQuoteAsOf ?? null,
          quoteUpdatedAt: summary.quoteUpdatedAt ?? null,
          quoteFreshness: summary.quoteFreshness ?? null,
          agentStatus: combinedAgentStatus,
          agentMessage: combinedAgentMessage,
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
    [agentStatuses, cashHomeManualInput, positionStatsBySource, systemHealth, valuationSummaries],
  );

  const trackedTotal = getTrackedTotal(sources);
  const portfolioPerformanceBase = sources.reduce(
    (totals, source) => {
      const summary = valuationSummaries[source.summaryId ?? source.id];
      if (typeof summary?.performanceValue !== "number") return totals;
      return {
        cost: totals.cost + (typeof summary.costValue === "number" ? summary.costValue : 0),
        performance: totals.performance + summary.performanceValue,
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
  const portfolioDayChangeBase = valuationPositions.reduce((totals, position) => {
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
  const portfolioDayChangeTone = getPerformanceTone(portfolioDayChange);
  const bankAccountSourceUnits = valuationSummaries.bank_accounts?.accounts ?? [];
  const totalBankAccountSourceUnits = Math.max(bankAccountSourceUnits.length, 1);
  const portfolioValueBreakdown = getPortfolioValueBreakdown(sources, bankAccountSourceUnits);
  const regularSourceUnits = sources.filter((source) => source.id !== "bank_accounts");
  const totalSourceUnits = regularSourceUnits.length + totalBankAccountSourceUnits;
  const inactiveSourceUnitIds = getInactiveSourceUnitIds(
    regularSourceUnits,
    bankAccountSourceUnits,
    agentStatuses,
    systemHealth,
  );
  const activeSourceUnits = Math.max(0, totalSourceUnits - inactiveSourceUnitIds.size);
  const displaySources = useMemo(
    () =>
      sortSourcesByOrder(
        sources.filter(
          (source) =>
            source.status !== "blocked" ||
            hasFinancialFootprint(source),
        ),
        sourceOrder,
      ),
    [sources, sourceOrder],
  );
  const normalizedDepotSearchQuery = normalizeSearchText(depotSearchQuery);
  const displayedPositions = useMemo(
    () =>
      valuationPositions
        .sort((left, right) => {
          const sourceDelta = getPositionSortValue(left) - getPositionSortValue(right);
          if (sourceDelta !== 0) return sourceDelta;
          const leftAccount = getPositionAccountKey(left);
          const rightAccount = getPositionAccountKey(right);
          const accountDelta = leftAccount.localeCompare(rightAccount);
          if (accountDelta !== 0) return accountDelta;
          return (right.currentValue ?? 0) - (left.currentValue ?? 0);
        }),
    [valuationPositions],
  );
  const priceHistoryByPosition = useMemo(() => {
    const grouped: Record<string, PriceChartPoint[]> = {};
    for (const position of displayedPositions) {
      grouped[position.id] = priceHistoryForPosition(position, positionPriceHistory);
    }
    return grouped;
  }, [displayedPositions, positionPriceHistory]);
  const displayedPositionsBySource = useMemo(() => {
    const grouped: Record<string, PortfolioPosition[]> = {};
    for (const position of displayedPositions) {
      const group = grouped[position.source] ?? [];
      group.push(position);
      grouped[position.source] = group;
    }
    return grouped;
  }, [displayedPositions]);
  const visibleAlerts = (systemHealth?.alerts ?? []).filter(
    (alert) => documentInboxItems.length > 0 || !isDocumentAlert(alert),
  );
  const visibleErrorCount = visibleAlerts.filter((alert) => alert.severity === "error").length;
  const visibleWarningCount = visibleAlerts.filter((alert) => alert.severity === "warning").length;
  const healthTone =
    visibleErrorCount > 0
      ? "error"
      : visibleWarningCount > 0
        ? "warn"
        : "good";

  return (
    <main className={`app-shell${darkMode ? " theme-dark" : ""}`}>
      <header className="topbar" aria-label="Projektstatus">
        <div>
          <p className="eyebrow">Personal Asset Intelligence</p>
          <h1>Finanzperformance</h1>
        </div>
        <div className="topbar__status-group">
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
          {dataStatus === "live" ? (
            <button
              type="button"
              className="page-health-refresh-button"
              onClick={handleRequestHealthRefresh}
              disabled={["requesting", "requested", "running"].includes(healthRefreshStatus)}
              title="Health-Check starten und Daten neu laden"
              aria-label="Health-Check starten und Daten neu laden"
            >
              <RefreshCcw aria-hidden="true" />
            </button>
          ) : null}
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
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setDarkMode((current) => !current)}
          title={darkMode ? "Tagmodus aktivieren" : "Nachtmodus aktivieren"}
          aria-label={darkMode ? "Tagmodus aktivieren" : "Nachtmodus aktivieren"}
        >
          {darkMode ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
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
                  ? "Kurs-Sync angefordert"
                  : quoteRequestStatus === "running"
                    ? "Kurse werden aktualisiert"
                  : quoteRequestStatus === "error"
                    ? "Kurs-Sync fehlgeschlagen"
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
          <p>Gesamtvermögen</p>
          <strong>
            {privacyMode ? maskMoney(portfolioValueBreakdown.depotValue) : formatCurrency(portfolioValueBreakdown.depotValue)}
          </strong>
          <div className="metric-card__details">
            <span className={`metric-chip metric-chip--${portfolioPerformanceTone}`}>
              G/V {privacyMode ? maskSignedMoney(portfolioPerformance) : formatSignedMoney(portfolioPerformance)}
              <small>{formatSignedPercent(portfolioPerformancePct)}</small>
            </span>
            <span className={`metric-chip metric-chip--${portfolioDayChangeTone}`}>
              Heute {privacyMode ? maskSignedMoney(portfolioDayChange) : formatSignedMoney(portfolioDayChange)}
              <small>{formatSignedPercent(portfolioDayChangePct)}</small>
            </span>
          </div>
          <dl className="metric-card__breakdown" aria-label="Vermoegensaufteilung">
            <div>
              <dt>Erfasster Wert</dt>
              <dd>
                {privacyMode ? maskMoney(trackedTotal) : formatCurrency(trackedTotal)}
              </dd>
            </div>
            <div>
              <dt>Cash</dt>
              <dd>
                {privacyMode ? maskMoney(portfolioValueBreakdown.cashValue) : formatCurrency(portfolioValueBreakdown.cashValue)}
              </dd>
            </div>
            <div>
              <dt>Kreditlinien</dt>
              <dd>
                {privacyMode ? maskMoney(portfolioValueBreakdown.creditLine) : formatCurrency(portfolioValueBreakdown.creditLine)}
              </dd>
            </div>
            <div>
              <dt>Genutzter Kredit</dt>
              <dd>
                {privacyMode ? maskMoney(portfolioValueBreakdown.usedCredit) : formatCurrency(portfolioValueBreakdown.usedCredit)}
              </dd>
            </div>
            <div>
              <dt>Freies Cash</dt>
              <dd>
                {privacyMode
                  ? maskMoney(portfolioValueBreakdown.uninvestedCash)
                  : formatCurrency(portfolioValueBreakdown.uninvestedCash)}
              </dd>
            </div>
          </dl>
          <span>Depots, Krypto, Edelmetalle und Vorsorgewerte</span>
        </article>

        <article className="metric-card metric-card--system">
          <div className="metric-card__system-grid">
            <div className="metric-card__system-item">
              <div className="metric-card__icon">
                <Database aria-hidden="true" />
              </div>
              <p>Aktive Quellen</p>
              <strong>
                {numberFormatter.format(activeSourceUnits)}
                <small>/{numberFormatter.format(totalSourceUnits)}</small>
              </strong>
              <span>{numberFormatter.format(displayedPositions.length)} Einzelpositionen sichtbar</span>
            </div>
            <div className="metric-card__system-item">
              <div className="metric-card__icon">
                {healthTone === "good" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
              </div>
              <p>Systemstatus</p>
              <strong className={`health-status health-status--${healthTone}`}>
                {systemHealth ? visibleAlerts.length : dataStatus === "live" ? 0 : "—"}
              </strong>
              <span>
                {systemHealth
                  ? `${visibleErrorCount} Fehler, ${visibleWarningCount} Warnungen`
                  : dataStatus === "live"
                    ? "Keine Health-Daten gefunden"
                    : "Wird nach Login geladen"}
              </span>
            </div>
          </div>
          {visibleAlerts.length ? (
            <ul className="alert-list">
              {visibleAlerts.map((alert) => {
                const repairAction = getAlertRepairAction(alert);
                const repairStatus = repairAction
                  ? repairAction.id === "traderepublic"
                    ? tradeRepublicPortalRequestStatus
                    : repairRequestStatuses[repairAction.id] ?? "idle"
                  : "idle";
                const isRepairRunning = ["requesting", "requested", "running"].includes(repairStatus);
                const repairError = repairAction
                  ? repairAction.id === "traderepublic"
                    ? tradeRepublicPortalRequestError
                    : repairRequestErrors[repairAction.id]
                  : null;
                return (
                  <li className={`alert-list__item alert-list__item--${alert.severity}`} key={alert.id}>
                    <div className="alert-list__item-main">
                      <strong>{alert.title}</strong>
                      <span>{alert.message}</span>
                      {repairError ? <em>{repairError}</em> : null}
                    </div>
                    {repairAction ? (
                      <button
                        type="button"
                        className="alert-list__action"
                        onClick={() => void handleRequestRepairAction(repairAction)}
                        disabled={isRepairRunning}
                      >
                        <RefreshCcw aria-hidden="true" />
                        <span>{getRepairActionLabel(repairAction, repairStatus)}</span>
                      </button>
                    ) : null}
                  </li>
                );
              })}
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
          {documentDecisionError ? (
            <p className="document-inbox-panel__error">{documentDecisionError}</p>
          ) : null}
          {documentInboxItems.length ? (
            <DocumentInbox
              items={documentInboxItems}
              pendingDecisionId={pendingDocumentDecisionId}
              pendingOpenDocumentId={pendingDocumentOpenId}
              onOpenDocument={handleOpenDocument}
              onClassify={handleDocumentDecision}
              isOpen={getUiSectionOpen("documentInbox:open", true)}
              onSectionToggle={setUiSectionOpen}
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
            <div className="depot-overview__toolbar">
              <label className="depot-search">
                <Search aria-hidden="true" />
                <input
                  value={depotSearchQuery}
                  onChange={(event) => setDepotSearchQuery(event.target.value)}
                  placeholder="Depot oder Position suchen"
                  aria-label="Depot oder Position suchen"
                />
              </label>
              <button
                type="button"
                className="depot-collapse-all-button"
                onClick={collapseAllSourceCards}
                aria-label="Alle Depotkarten einklappen"
                title="Alle Depotkarten einklappen"
              >
                <ChevronsUp aria-hidden="true" />
                <span>Alle einklappen</span>
              </button>
              <button
                type="button"
                className={`depot-edit-toggle${isDepotEditMode ? " is-active" : ""}`}
                onClick={() => setIsDepotEditMode((current) => !current)}
                aria-pressed={isDepotEditMode}
              >
                {isDepotEditMode ? <CheckCircle2 aria-hidden="true" /> : <Pencil aria-hidden="true" />}
                <span>{isDepotEditMode ? "Fertig" : "Bearbeiten"}</span>
              </button>
            </div>
          </div>

          <div className="source-list">
            {displaySources.map((source, sourceIndex) => {
              const sourceSummary = valuationSummaries[source.summaryId ?? source.id];
              const rawSourceSummary = sourceSummaries[source.summaryId ?? source.id];
              const performanceTone = getPerformanceTone(sourceSummary?.performanceValue);
              const sourcePositionsForCard = displayedPositionsBySource[source.id] ?? [];
              const matchingSourcePositions = normalizedDepotSearchQuery
                ? sourcePositionsForCard.filter((position) => positionMatchesSearch(position, normalizedDepotSearchQuery))
                : [];
              const sourceHasDirectSearchMatch = sourceMatchesDirectSearch(source, sourceSummary, normalizedDepotSearchQuery);
              const sourceHasSearchMatch =
                Boolean(normalizedDepotSearchQuery) && (sourceHasDirectSearchMatch || matchingSourcePositions.length > 0);
              const usedCreditValue = getUsedCreditValue(source);
              const sourcePrimaryTimestamp = getSourcePrimaryTimestamp(source);
              const isTradeRepublicSource = source.id === "traderepublic";
              const tradeRepublicHasCurrentQuotes =
                isTradeRepublicSource && typeof rawSourceSummary?.externalQuoteDepotValue === "number";
              const tradeRepublicBrokerTimestamp =
                rawSourceSummary?.sourceDataUpdatedAt ??
                rawSourceSummary?.quoteDataUpdatedAt ??
                source.sourceDataUpdatedAt ??
                source.quoteDataUpdatedAt;
              const tradeRepublicFrankfurtTimestamp =
                rawSourceSummary?.externalQuoteDataUpdatedAt ??
                rawSourceSummary?.quoteUpdatedAt ??
                source.externalQuoteDataUpdatedAt ??
                source.quoteUpdatedAt;
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
              const sourceDayChangeTone = getPerformanceTone(sourceDayChange);
              const ginmonAccounts =
                source.id === "ginmon" ? (sourceSummary?.accounts ?? []) : [];
              const isBankAccountsSource = source.id === "bank_accounts";
              const isCashHomeSource = source.id === "cash_home";
              const isCreditCardSource = source.kind === "credit_card";
              const bankAccounts = isBankAccountsSource ? (sourceSummary?.accounts ?? []) : [];
              const creditCardAccounts = bankAccounts.filter(isCreditCardAccount);
              const checkingAccounts = bankAccounts.filter((account) => !isCreditCardAccount(account));
              const sourceAgentRuns = getSourceAgentRunViews(source.id, agentStatuses);
              const equatePlusPosition =
                source.id === "equateplus"
                  ? sourcePositionsForCard.find(
                      (position) => position.id === "equateplus_novartis" || position.isin === "CH0012005267",
                    )
                  : undefined;
              const tradeRepublicPortalButtonLabel = getTradeRepublicPortalButtonLabel(
                tradeRepublicPortalRequestStatus,
                agentStatuses.traderepublic_portal,
              );
              const sourceSectionKey = `source:${source.id}`;
              const isSourceCollapsed = !getUiSectionOpen(sourceSectionKey, true);

              return (
                <article
                  className={`source-card${isSourceCollapsed ? " source-card--collapsed" : ""}${
                    sourceHasSearchMatch ? " source-card--search-match" : ""
                  }${isDepotEditMode ? " source-card--editing" : ""}`}
                  key={source.id}
                >
                  <div className="source-card__icon">
                    <SourceIcon source={source} />
                  </div>
                  <div className="source-card__body">
                    <div className="source-card__header">
                      <div className="source-card__identity">
                        <h3>{source.name}</h3>
                        {isSourceCollapsed && sourceHasSearchMatch ? (
                          <span className="source-card__search-badge">
                            {matchingSourcePositions.length
                              ? `${numberFormatter.format(matchingSourcePositions.length)} Treffer`
                              : "Depot"}
                          </span>
                        ) : null}
                        <p>{source.purpose}</p>
                      </div>
                      {isSourceCollapsed ? (
                        <dl
                          className="source-card__compact-metrics"
                          aria-label={`${source.name} Kurzüberblick`}
                        >
                          <div className="source-card__compact-metric source-card__compact-metric--value">
                            <dt>{getSourceCardPrimaryLabel(source)}</dt>
                            <dd>{privacyMode ? maskMoney(getSourceCardPrimaryValue(source)) : formatCurrency(getSourceCardPrimaryValue(source))}</dd>
                          </div>
                          <div className="source-card__compact-metric source-card__compact-metric--performance">
                            <dt>
                              <span>G/V</span>
                              <span className={`source-card__compact-label-percent performance-value--${performanceTone}`}>
                                {formatSignedPercent(sourceSummary?.performancePct)}
                              </span>
                            </dt>
                            <dd className={`performance-value performance-value--${performanceTone}`}>
                              {privacyMode ? maskSignedMoney(sourceSummary?.performanceValue) : formatSignedMoney(sourceSummary?.performanceValue)}
                            </dd>
                          </div>
                          <div className="source-card__compact-metric source-card__compact-metric--today">
                            <dt>
                              <span>Heute</span>
                              <span className={`source-card__compact-label-percent performance-value--${sourceDayChangeTone}`}>
                                {formatSignedPercent(sourceDayChangePct)}
                              </span>
                            </dt>
                            <dd className={`performance-value performance-value--${sourceDayChangeTone}`}>
                              {privacyMode ? maskSignedMoney(sourceDayChange) : formatSignedMoney(sourceDayChange)}
                            </dd>
                          </div>
                          <div className="source-card__compact-metric source-card__compact-metric--update">
                            <dt>Update</dt>
                            <dd>
                              <span className="source-card__timestamp-inline">
                                {formatUpdatedAt(sourcePrimaryTimestamp.value) || "Noch offen"}
                              </span>
                            </dd>
                          </div>
                        </dl>
                      ) : null}
                      <div className="source-card__header-actions">
                        {isDepotEditMode ? (
                          <div className="source-card__reorder-controls" aria-label={`${source.name} verschieben`}>
                            <GripVertical aria-hidden="true" />
                            <button
                              type="button"
                              onClick={() => moveSourceCard(source.id, -1)}
                              disabled={sourceIndex === 0}
                              aria-label={`${source.name} nach oben verschieben`}
                            >
                              <ArrowUp aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSourceCard(source.id, 1)}
                              disabled={sourceIndex === displaySources.length - 1}
                              aria-label={`${source.name} nach unten verschieben`}
                            >
                              <ArrowDown aria-hidden="true" />
                            </button>
                          </div>
                        ) : null}
                        <AgentStatusBadge status={source.agentStatus} />
                        <button
                          type="button"
                          className={`source-card__collapse-button${isSourceCollapsed ? " is-collapsed" : ""}`}
                          onClick={() => toggleSourceCard(source.id)}
                          aria-expanded={!isSourceCollapsed}
                          aria-label={
                            isSourceCollapsed
                              ? `${source.name} ausklappen`
                              : `${source.name} einklappen`
                          }
                        >
                          <ChevronDown aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {isSourceCollapsed ? (
                      null
                    ) : (
                      <>
                    {isTradeRepublicSource ? (
                      <div className="source-card__portal-action source-card__portal-action--primary">
                        <div className="source-card__portal-action-row">
                          <button
                            type="button"
                            className="source-card__refresh-button source-card__refresh-button--wide"
                            onClick={handleRequestTradeRepublicPortalRefresh}
                            disabled={["requesting", "requested", "running"].includes(tradeRepublicPortalRequestStatus)}
                          >
                            <RefreshCcw aria-hidden="true" />
                            <span>Trade Republic: {tradeRepublicPortalButtonLabel}</span>
                          </button>
                          <button
                            type="button"
                            className="source-card__refresh-button source-card__refresh-button--wide"
                            onClick={handleRequestQuoteSync}
                            disabled={["requesting", "requested", "running"].includes(quoteRequestStatus)}
                          >
                            <RefreshCcw aria-hidden="true" />
                            <span>
                              {quoteRequestStatus === "running"
                                ? "Kurse laufen"
                                : quoteRequestStatus === "requested"
                                  ? "Kurse angefordert"
                                  : quoteRequestStatus === "error"
                                    ? "Kurse fehlgeschlagen"
                                    : "Nur Kurse"}
                            </span>
                          </button>
                        </div>
                        <div className="source-card__value-mode" role="group" aria-label="Trade-Republic-Wertmodus">
                          <button
                            type="button"
                            className={`source-card__value-mode-button${
                              tradeRepublicDisplayMode === "current" ? " is-active" : ""
                            }`}
                            onClick={() => setTradeRepublicDisplayMode("current")}
                            disabled={!tradeRepublicHasCurrentQuotes}
                            aria-pressed={tradeRepublicDisplayMode === "current"}
                          >
                            <span>Aktuell</span>
                            <small>Frankfurt</small>
                          </button>
                          <button
                            type="button"
                            className={`source-card__value-mode-button${
                              tradeRepublicDisplayMode === "broker" ? " is-active" : ""
                            }`}
                            onClick={() => setTradeRepublicDisplayMode("broker")}
                            aria-pressed={tradeRepublicDisplayMode === "broker"}
                          >
                            <span>Broker</span>
                            <small>Trade Republic</small>
                          </button>
                        </div>
                        {tradeRepublicPortalRequestStatus === "error" && tradeRepublicPortalRequestError ? (
                          <div className="source-card__portal-error">
                            {tradeRepublicPortalRequestError}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <dl className={`source-card__metrics${isBankAccountsSource || isCreditCardSource ? " source-card__metrics--bank" : ""}`}>
                      {isCashHomeSource ? (
                        <>
                          <div>
                            <dt>Barbestand</dt>
                            <dd>{privacyMode ? maskMoney(source.cashValue) : formatCurrency(source.cashValue)}</dd>
                          </div>
                          <div>
                            <dt>{sourcePrimaryTimestamp.label}</dt>
                            <dd>
                              <span className="source-card__timestamp-inline">
                                {formatUpdatedAt(sourcePrimaryTimestamp.value)}
                              </span>
                            </dd>
                          </div>
                        </>
                      ) : isBankAccountsSource ? (
                        <>
                          <div>
                            <dt>Geldstand</dt>
                            <dd>{privacyMode ? maskMoney(source.cashValue) : formatCurrency(source.cashValue)}</dd>
                          </div>
                          <div>
                            <dt>Kreditlinie</dt>
                            <dd>{privacyMode ? maskMoney(source.creditLineEstimate) : formatCurrency(source.creditLineEstimate)}</dd>
                          </div>
                          <div>
                            <dt>Verfügbar</dt>
                            <dd>{privacyMode ? maskMoney(source.availableWithCredit) : formatCurrency(source.availableWithCredit)}</dd>
                          </div>
                          <div>
                            <dt>{sourcePrimaryTimestamp.label}</dt>
                            <dd>
                              <span className="source-card__timestamp-inline">
                                {formatUpdatedAt(sourcePrimaryTimestamp.value)}
                              </span>
                            </dd>
                          </div>
                          {source.agentStatus && source.agentStatus !== "OK" ? (
                            <div>
                              <dt>Status</dt>
                              <dd>{source.agentMessage ?? "Agent meldet keinen OK-Status."}</dd>
                            </div>
                          ) : null}
                        </>
                      ) : isCreditCardSource ? (
                        <>
                          <div>
                            <dt>Saldo</dt>
                            <dd>{privacyMode ? maskMoney(source.currentValue) : formatCurrency(source.currentValue)}</dd>
                          </div>
                          <div>
                            <dt>Kreditlimit</dt>
                            <dd>{privacyMode ? maskMoney(source.creditLineEstimate) : formatCurrency(source.creditLineEstimate)}</dd>
                          </div>
                          <div>
                            <dt>Verfügbar</dt>
                            <dd>{privacyMode ? maskMoney(source.availableWithCredit) : formatCurrency(source.availableWithCredit)}</dd>
                          </div>
                          <div>
                            <dt>{sourcePrimaryTimestamp.label}</dt>
                            <dd>
                              <span className="source-card__timestamp-inline">
                                {formatUpdatedAt(sourcePrimaryTimestamp.value)}
                              </span>
                            </dd>
                          </div>
                          {source.agentStatus && source.agentStatus !== "OK" ? (
                            <div>
                              <dt>Status</dt>
                              <dd>{source.agentMessage ?? "Agent meldet keinen OK-Status."}</dd>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div>
                            <dt>{getSourceCardPrimaryLabel(source)}</dt>
                            <dd>{privacyMode ? maskMoney(getSourceCardPrimaryValue(source)) : formatCurrency(getSourceCardPrimaryValue(source))}</dd>
                          </div>
                          <div>
                            <dt>Cash</dt>
                            <dd>{privacyMode ? maskMoney(source.cashValue) : formatCurrency(source.cashValue)}</dd>
                          </div>
                          <div>
                            <dt>Einstand</dt>
                            <dd>{privacyMode ? maskMoney(sourceSummary?.costValue) : formatCurrency(sourceSummary?.costValue)}</dd>
                          </div>
                          {isTradeRepublicSource ? (
                            <>
                              <div>
                                <dt>TR Stand</dt>
                                <dd>
                                  <span className="source-card__timestamp-inline">
                                    {formatUpdatedAt(tradeRepublicBrokerTimestamp)}
                                  </span>
                                </dd>
                              </div>
                              <div>
                                <dt>Frankfurt</dt>
                                <dd>
                                  <span className="source-card__timestamp-inline">
                                    {formatUpdatedAt(tradeRepublicFrankfurtTimestamp)}
                                  </span>
                                </dd>
                              </div>
                            </>
                          ) : (
                            <div>
                              <dt>{sourcePrimaryTimestamp.label}</dt>
                              <dd>
                                <span className="source-card__timestamp-inline">
                                  {formatUpdatedAt(sourcePrimaryTimestamp.value)}
                                </span>
                              </dd>
                            </div>
                          )}
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
                        </>
                      )}
                    </dl>
                    {source.id === "equateplus" ? (
                      <EquatePlusManualPanel
                        draft={equatePlusDraft}
                        manualInput={equatePlusManualInput}
                        position={equatePlusPosition}
                        privacyMode={privacyMode}
                        saveStatus={equatePlusSaveStatus}
                        saveError={equatePlusSaveError}
                        onDraftChange={handleEquatePlusDraftChange}
                        onSubmit={handleSaveEquatePlusInput}
                      />
                    ) : null}
                    {!isBankAccountsSource && !isCreditCardSource && (typeof source.saleValue === "number" ||
                    typeof source.availableWithCredit === "number" ||
                    typeof source.creditLineEstimate === "number" ||
                    typeof usedCreditValue === "number") ? (
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

                    {sourceAgentRuns.length && !isBankAccountsSource && !isCashHomeSource ? (
                      <div className="source-card__agent-panel">
                        <div className="source-card__agent-panel-title">Agenten</div>
                        <div className="source-card__agent-list">
                          {sourceAgentRuns.map((entry) => {
                            const entryDisplayStatus = getAgentDisplayStatus(entry.status);
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
                                  <AgentStatusBadge status={entryDisplayStatus} emptyLabel="Kein Status" />
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
                                {entry.status?.message && entryDisplayStatus !== "OK" ? (
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

                    {isBankAccountsSource ? (
                      <>
                        <BankAccountGroup
                          title="Bankkonten"
                          accounts={checkingAccounts}
                          agentStatuses={agentStatuses}
                          bankLedgerEntries={bankLedgerEntries}
                          privacyMode={privacyMode}
                          accountHeader="Konto"
                          groupKey="source:bank_accounts:group:checking"
                          isOpen={getUiSectionOpen("source:bank_accounts:group:checking", false)}
                          isSectionOpen={getUiSectionOpen}
                          onSectionToggle={setUiSectionOpen}
                        />
                        <BankAccountGroup
                          title="Kreditkarten"
                          accounts={creditCardAccounts}
                          agentStatuses={agentStatuses}
                          bankLedgerEntries={bankLedgerEntries}
                          privacyMode={privacyMode}
                          accountHeader="Kreditkarte"
                          groupKey="source:bank_accounts:group:credit_cards"
                          isOpen={getUiSectionOpen("source:bank_accounts:group:credit_cards", false)}
                          isSectionOpen={getUiSectionOpen}
                          onSectionToggle={setUiSectionOpen}
                        />
                        <details
                          className="source-accounts-details source-accounts-details--manual"
                          open={getUiSectionOpen("source:bank_accounts:group:cash_home", false)}
                          onToggle={(event) => handleDetailsToggle("source:bank_accounts:group:cash_home", event, false)}
                        >
                          <summary>
                            <span>Bargeld</span>
                            <strong>
                              {privacyMode
                                ? maskMoney(cashHomeManualInput?.amountEur)
                                : formatCurrency(cashHomeManualInput?.amountEur ?? null)}
                            </strong>
                          </summary>
                          <CashHomeManualPanel
                            draft={cashHomeDraft}
                            manualInput={cashHomeManualInput}
                            privacyMode={privacyMode}
                            saveStatus={cashHomeSaveStatus}
                            saveError={cashHomeSaveError}
                            onDraftChange={handleCashHomeDraftChange}
                            onSubmit={handleSaveCashHomeInput}
                          />
                        </details>
                      </>
                    ) : ginmonAccounts.length ? (
                      <details
                        className="source-accounts-details"
                        open={getUiSectionOpen(`${sourceSectionKey}:ginmon_accounts`, false)}
                        onToggle={(event) => handleDetailsToggle(`${sourceSectionKey}:ginmon_accounts`, event, false)}
                      >
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
                            <details
                              className="source-account-details"
                              key={accountKey}
                              open={getUiSectionOpen(`${sourceSectionKey}:account:${accountKey}`, false)}
                              onToggle={(event) => {
                                event.stopPropagation();
                                handleDetailsToggle(`${sourceSectionKey}:account:${accountKey}`, event, false);
                              }}
                            >
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
                              <PositionsTable
                                positions={accountPositions}
                                privacyMode={privacyMode}
                                priceHistoryByPosition={priceHistoryByPosition}
                                searchQuery={depotSearchQuery}
                                sectionKey={`${sourceSectionKey}:account:${accountKey}:positions`}
                                isSectionOpen={getUiSectionOpen}
                                onSectionToggle={setUiSectionOpen}
                              />
                            </details>
                          );
                        })}
                        </div>
                      </details>
                    ) : vbvAccountInformation ? (
                      <VbvAccountInformationDetails
                        accountInformation={vbvAccountInformation}
                        privacyMode={privacyMode}
                        sectionKey={`${sourceSectionKey}:vbv_account_information`}
                        isOpen={getUiSectionOpen(`${sourceSectionKey}:vbv_account_information`, false)}
                        onSectionToggle={setUiSectionOpen}
                      />
                    ) : sourcePositionsForCard.length ? (
                      <details
                        className="source-positions-details"
                        open={getUiSectionOpen(`${sourceSectionKey}:positions`, false)}
                        onToggle={(event) => handleDetailsToggle(`${sourceSectionKey}:positions`, event, false)}
                      >
                        <summary>
                          <span>Positionen anzeigen</span>
                          <strong>{numberFormatter.format(sourcePositionsForCard.length)}</strong>
                        </summary>
                        <PositionsTable
                          positions={sourcePositionsForCard}
                          privacyMode={privacyMode}
                          priceHistoryByPosition={priceHistoryByPosition}
                          searchQuery={depotSearchQuery}
                          sectionKey={`${sourceSectionKey}:positions`}
                          isSectionOpen={getUiSectionOpen}
                          onSectionToggle={setUiSectionOpen}
                        />
                      </details>
                    ) : null}
                      </>
                    )}
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
