export type SourceKind =
  | "broker"
  | "crypto"
  | "robo"
  | "metals"
  | "equity_plan"
  | "pension"
  | "bank"
  | "credit_card"
  | "cash";

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
  sourceDataUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  sourceDataProvider?: string | null;
  documentDataUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  documentDataProvider?: string | null;
  quoteDataUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  quoteDataProvider?: string | null;
  quoteDataChangedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  externalQuoteDepotValue?: number | null;
  externalQuoteDifference?: number | null;
  externalQuoteDataUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  externalQuoteDataProvider?: string | null;
  lastAgentRunAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  lastAgentSuccessAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  lastDataChangeAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
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
  assetClass?: string | null;
  assetClassLabel?: string | null;
  assetClassConfidence?: "high" | "medium" | "low" | string | null;
  assetClassSource?: string | null;
  isin?: string | null;
  wkn?: string | null;
  quantity?: number | null;
  quantityText?: string | null;
  quantityEstimated?: boolean | null;
  quoteText?: string | null;
  quotePrice?: number | null;
  quotePriceEur?: number | null;
  quoteCurrency?: string | null;
  quoteProvider?: string | null;
  quoteProviderSymbol?: string | null;
  currentValue?: number | null;
  currentValueUsdt?: number | null;
  externalQuoteValue?: number | null;
  externalQuoteDifference?: number | null;
  externalQuoteProvider?: string | null;
  externalQuoteProviderSymbol?: string | null;
  externalQuotePrice?: number | null;
  externalQuoteCurrency?: string | null;
  externalQuotePriceEur?: number | null;
  externalQuoteAsOf?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  externalQuoteUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  externalQuoteVenue?: string | null;
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
  brokerQuotePrice?: number | null;
  brokerQuoteAsOf?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  brokerCurrentValue?: number | null;
  brokerQuoteProvider?: string | null;
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

export type FinancialEventCollection =
  | "transactions"
  | "ledgerEntries"
  | "costEvents"
  | "incomeEvents";

export type FinancialEventAllocationLevel =
  | "position"
  | "instrument"
  | "source_account"
  | "source"
  | "unknown";

export type FinancialEventAllocationStatus =
  | "direct"
  | "allocated"
  | "unallocated"
  | "pending";

export type FinancialEventAllocationMethod =
  | "document"
  | "transaction"
  | "api"
  | "proportional"
  | "manual"
  | "inferred"
  | "unknown";

export type FinancialEventConfidence = "exact" | "estimated" | "inferred" | "unknown";

export interface FinancialEventBase {
  id: string;
  source?: string | null;
  sourceLabel?: string | null;
  sourceAccountId?: string | null;
  sourcePositionId?: string | null;
  instrumentId?: string | null;
  isin?: string | null;
  symbol?: string | null;
  metal?: string | null;
  coin?: string | null;
  eventModelVersion?: string | null;
  eventCollection?: FinancialEventCollection | string | null;
  eventKind?: string | null;
  eventType?: string | null;
  eventDate?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  eventGroupId?: string | null;
  dedupeKey?: string | null;
  amount?: number | null;
  currency?: string | null;
  amountEur?: number | null;
  amountAbsEur?: number | null;
  grossAmountEur?: number | null;
  netAmountEur?: number | null;
  taxAmountEur?: number | null;
  feeAmountEur?: number | null;
  financialImpactEur?: number | null;
  allocationLevel?: FinancialEventAllocationLevel | string | null;
  allocationStatus?: FinancialEventAllocationStatus | string | null;
  allocationMethod?: FinancialEventAllocationMethod | string | null;
  allocationConfidence?: FinancialEventConfidence | string | null;
  comparisonScope?: "product" | "account" | "broker" | "unknown" | string | null;
  providerComparisonRelevant?: boolean | null;
  sourceDocumentId?: string | null;
  sourceDocumentFactId?: string | null;
  importId?: string | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
}

export interface CostEventDocument extends FinancialEventBase {
  eventCollection?: "costEvents" | string | null;
  costClass?: "broker" | "product" | "tax" | "financing" | "custody" | "other" | "unknown" | string | null;
}

export interface IncomeEventDocument extends FinancialEventBase {
  eventCollection?: "incomeEvents" | string | null;
  incomeClass?: "distribution" | "interest" | "reward" | "cashback_or_rebate" | "other" | "unknown" | string | null;
}
