import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { PortfolioPosition, SystemHealth } from "../domain/types";

export interface SourceSummaryDocument {
  source: string;
  currentValue?: number;
  depotValue?: number;
  saleValue?: number;
  cashValue?: number;
  netValue?: number;
  availableCash?: number;
  availableWithCredit?: number;
  creditLineEstimate?: number;
  costValue?: number;
  performanceValue?: number;
  performancePct?: number;
  brokerPositionValue?: number;
  brokerPositionSummaryDifference?: number | null;
  brokerSnapshotValue?: number | null;
  brokerageValue?: number | null;
  privateMarketsValue?: number | null;
  brokerCashValue?: number | null;
  brokerSnapshotDate?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  externalQuoteDepotValue?: number | null;
  externalQuoteDifference?: number | null;
  latestQuoteAsOf?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  oldestQuoteAsOf?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  quoteUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  quoteFreshness?: string | null;
  exchangeAccountValue?: number;
  positionsValue?: number;
  includedPositionsValue?: number;
  positionSummaryDifference?: number | null;
  unpricedPositionCount?: number;
  unpricedPositions?: Array<Record<string, unknown>>;
  excludedPositionCount?: number;
  excludedPositions?: Array<Record<string, unknown>>;
  usdtToEur?: number | null;
  valuationDate?: string;
  sourceDataUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  sourceDataProvider?: string | null;
  documentDataUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  documentDataProvider?: string | null;
  quoteDataUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  quoteDataProvider?: string | null;
  quoteDataChangedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  lastAgentRunAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  lastAgentSuccessAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  lastDataChangeAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number };
  positionCount?: number;
  status?: string;
  storageStatus?: string;
  valuationMethod?: string;
  accounts?: SourceSummaryAccount[];
  accountInformation?: SourceSummaryVbvAccountInformation | null;
}

export interface SourceSummaryAccount {
  accountNumber?: string | null;
  customerId?: string | null;
  label?: string | null;
  strategy?: string | null;
  currentValue?: number | null;
  depotValue?: number | null;
  cashValue?: number | null;
  costValue?: number | null;
  performanceValue?: number | null;
  performancePct?: number | null;
  valuationDate?: string | null;
  positionCount?: number | null;
}

export interface SourceSummaryVbvContract {
  employer?: string | null;
  openingDate?: string | null;
  openingBalance?: number | null;
  contributionYear?: number | null;
  contributions?: number | null;
  administrationCosts?: number | null;
  socialInsuranceCosts?: number | null;
  totalCosts?: number | null;
  investmentResultNet?: number | null;
  costValue?: number | null;
  performanceValue?: number | null;
  performancePct?: number | null;
  movementValue?: number | null;
  closingDate?: string | null;
  closingBalance?: number | null;
}

export interface SourceSummaryVbvAccountInformation {
  documentType?: string | null;
  parseStatus?: string | null;
  statementDate?: string | null;
  valuationDate?: string | null;
  customerNumber?: string | null;
  totalValue?: number | null;
  guaranteedCapital?: number | null;
  guaranteeSurplus?: number | null;
  openingBalanceTotal?: number | null;
  contributionsTotal?: number | null;
  administrationCostsTotal?: number | null;
  socialInsuranceCostsTotal?: number | null;
  totalCosts?: number | null;
  investmentResultNetTotal?: number | null;
  costValue?: number | null;
  performanceValue?: number | null;
  performancePct?: number | null;
  movementValue?: number | null;
  parsedContractsValue?: number | null;
  valueDifference?: number | null;
  contractCount?: number | null;
  contracts?: SourceSummaryVbvContract[];
}

export interface AgentStatusDocument {
  id: string;
  source?: string;
  status?: "OK" | "WARNUNG" | "FEHLER" | "RUNNING" | string;
  message?: string | null;
  lastSuccessAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  lastAgentRunAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  lastAgentSuccessAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  valuationDate?: string | null;
  importId?: string | null;
  failedImportId?: string | null;
}

export interface AutomationCommandDocument {
  id: string;
  type?: string;
  status?: "REQUESTED" | "RUNNING" | "DONE" | "ERROR" | string;
  errorMessage?: string | null;
  requestedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
}

export async function loadSourceSummaries(db: Firestore) {
  const snapshot = await getDocs(collection(db, "sourceSummaries"));
  return Object.fromEntries(
    snapshot.docs.map((doc) => [doc.id, doc.data() as SourceSummaryDocument]),
  );
}

export async function loadAgentStatuses(db: Firestore) {
  const snapshot = await getDocs(collection(db, "agentStatus"));
  return Object.fromEntries(
    snapshot.docs.map((doc) => [
      doc.id,
      { id: doc.id, ...(doc.data() as Omit<AgentStatusDocument, "id">) },
    ]),
  );
}

const numericPositionFields = [
  "currentValue",
  "currentValueUsdt",
  "externalQuoteValue",
  "externalQuoteDifference",
  "costValue",
  "costValueQuote",
  "performanceValue",
  "performancePct",
  "quantity",
  "quotePrice",
  "quotePriceEur",
  "quoteAgeMinutes",
  "brokerQuotePrice",
  "brokerCurrentValue",
  "dayChangeValue",
  "dayChangePct",
  "dayChange",
  "dayChangePercent",
  "dailyChangeValue",
  "dailyChangePct",
  "previousCloseValue",
  "avgCostPerShare",
] as const;

function parseMaybeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return value;
  const parsed = Number.parseFloat(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : value;
}

function normalizePosition(doc: PortfolioPosition): PortfolioPosition {
  const normalized: Record<string, unknown> = { ...doc };
  for (const field of numericPositionFields) {
    normalized[field] = parseMaybeNumber(normalized[field]);
  }
  return normalized as unknown as PortfolioPosition;
}

export async function loadSourcePositions(db: Firestore): Promise<PortfolioPosition[]> {
  const snapshot = await getDocs(collection(db, "sourcePositions"));
  return snapshot.docs.map((doc) =>
    normalizePosition({
      id: doc.id,
      ...(doc.data() as Omit<PortfolioPosition, "id">),
    }),
  );
}

export async function loadSystemHealth(db: Firestore): Promise<SystemHealth | null> {
  const snapshot = await getDoc(doc(db, "systemHealth", "current"));
  if (!snapshot.exists()) return null;
  return snapshot.data() as SystemHealth;
}

export async function requestQuoteSync(db: Firestore, requestedBy?: string | null) {
  const commandRef = doc(db, "automationCommands", "sync_quotes_manual");
  await setDoc(commandRef, {
    type: "sync_quotes",
    status: "REQUESTED",
    requestedBy: requestedBy ?? null,
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function loadQuoteSyncCommand(db: Firestore): Promise<AutomationCommandDocument | null> {
  const snapshot = await getDoc(doc(db, "automationCommands", "sync_quotes_manual"));
  if (!snapshot.exists()) return null;
  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<AutomationCommandDocument, "id">),
  };
}
