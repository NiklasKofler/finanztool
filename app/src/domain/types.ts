export type SourceKind =
  | "broker"
  | "crypto"
  | "robo"
  | "metals"
  | "equity_plan"
  | "pension"
  | "bank";

export type SourceStatus = "automated" | "ready" | "manual" | "planned" | "blocked";

export interface SourceOverview {
  id: string;
  summaryId?: string;
  name: string;
  kind: SourceKind;
  purpose: string;
  status: SourceStatus;
  currentValue?: number;
  depotValue?: number;
  saleValue?: number;
  cashValue?: number;
  netValue?: number;
  availableCash?: number;
  availableWithCredit?: number;
  creditLineEstimate?: number;
  valuationDate?: string;
  latestQuoteAsOf?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  oldestQuoteAsOf?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  quoteUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  quoteFreshness?: string | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number };
  positionCount?: number;
  importMethod: string;
  nextStep: string;
  agentStatus?: string | null;
  agentMessage?: string | null;
}

export interface PortfolioPosition {
  id: string;
  source: string;
  name: string;
  category?: string | null;
  isin?: string | null;
  wkn?: string | null;
  quantity?: number | null;
  quantityText?: string | null;
  quantityEstimated?: boolean | null;
  quoteText?: string | null;
  quotePrice?: number | null;
  quotePriceEur?: number | null;
  quoteCurrency?: string | null;
  currentValue?: number | null;
  currentValueUsdt?: number | null;
  externalQuoteValue?: number | null;
  externalQuoteDifference?: number | null;
  costValue?: number | null;
  costValueQuote?: number | null;
  costCurrency?: string | null;
  costBasisStatus?: string | null;
  quoteStatus?: string | null;
  quoteAsOf?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  quoteUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  quoteFetchedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  quoteVenue?: string | null;
  quoteAgeMinutes?: number | null;
  quoteFreshness?: string | null;
  priceSource?: string | null;
  exchangeAccountValueIncluded?: boolean | null;
  accountValueIncluded?: boolean | null;
  accountId?: string | null;
  accountNumber?: string | null;
  customerId?: string | null;
  portfolioId?: string | null;
  portfolioLabel?: string | null;
  performanceValue?: number | null;
  performancePct?: number | null;
  dayChangeValue?: number | null;
  dayChangePct?: number | null;
  dayChange?: number | null;
  dayChangePercent?: number | null;
  dailyChangeValue?: number | null;
  dailyChangePct?: number | null;
  previousCloseValue?: number | null;
  valuationDate?: string | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  valuationMethod?: string | null;
}

export interface SystemAlert {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  message: string;
  source?: string | null;
  details?: unknown;
}

export interface SystemHealth {
  status: "OK" | "WARNUNG" | "ERROR";
  generatedAt?: string | Date | { toDate: () => Date } | { seconds: number };
  alertCount: number;
  errorCount: number;
  warningCount: number;
  alerts: SystemAlert[];
}
