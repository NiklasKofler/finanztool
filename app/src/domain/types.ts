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
  valuationDate?: string;
  positionCount?: number;
  importMethod: string;
  nextStep: string;
}

export interface PipelineStep {
  order: string;
  title: string;
  description: string;
}

export interface UpdateScheduleItem {
  source: string;
  cadence: string;
  needsAttention: boolean;
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
  costValue?: number | null;
  performanceValue?: number | null;
  performancePct?: number | null;
  valuationDate?: string | null;
  valuationMethod?: string | null;
}
