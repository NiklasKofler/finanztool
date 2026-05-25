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
  name: string;
  kind: SourceKind;
  purpose: string;
  status: SourceStatus;
  currentValue?: number;
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
