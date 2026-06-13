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
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number };
  positionCount?: number;
  importMethod: string;
  nextStep: string;
}

export interface PortfolioPosition {
  id: string;
  source: string;
  name: string;
  category?: string | null;
  isin?: string | null;
  wkn?: string | null;
  quantityText?: string | null;
  quoteText?: string | null;
  currentValue?: number | null;
  currentValueUsdt?: number | null;
  costValue?: number | null;
  costValueQuote?: number | null;
  costCurrency?: string | null;
  costBasisStatus?: string | null;
  priceSource?: string | null;
  accountValueIncluded?: boolean | null;
  performanceValue?: number | null;
  performancePct?: number | null;
  valuationDate?: string | null;
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
