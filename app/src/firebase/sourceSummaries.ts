import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
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
  costValue?: number | null;
  performanceValue?: number | null;
  performancePct?: number | null;
  brokerPositionValue?: number;
  brokerPositionSummaryDifference?: number | null;
  brokerSnapshotValue?: number | null;
  brokerageValue?: number | null;
  privateMarketsValue?: number | null;
  brokerCashValue?: number | null;
  brokerSnapshotDate?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  externalQuoteDepotValue?: number | null;
  externalQuoteDifference?: number | null;
  externalQuoteDataUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  externalQuoteDataProvider?: string | null;
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
  accountId?: string | null;
  bankKey?: string | null;
  bankName?: string | null;
  providerSource?: string | null;
  providerAccountId?: string | null;
  accountType?: string | null;
  accountNumber?: string | null;
  customerId?: string | null;
  label?: string | null;
  strategy?: string | null;
  agentStatusId?: string | null;
  status?: string | null;
  staleReason?: string | null;
  staleIssueType?: string | null;
  lastSkippedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  lastDataSuccessAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  lastSeenAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  sourceDataUpdatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  currentValue?: number | null;
  depotValue?: number | null;
  cashValue?: number | null;
  debtValue?: number | null;
  reservedValue?: number | null;
  availableWithCredit?: number | null;
  creditLineEstimate?: number | null;
  costValue?: number | null;
  performanceValue?: number | null;
  performancePct?: number | null;
  valuationDate?: string | null;
  positionCount?: number | null;
  transactionCount?: number | null;
  transactionSyncedCount?: number | null;
  transactionNewCount?: number | null;
  transactionDuplicateCount?: number | null;
  latestTransactionDate?: string | null;
  sourceDataProvider?: string | null;
}

export interface BankLedgerEntryDocument {
  id: string;
  source?: string | null;
  accountId?: string | null;
  providerAccountId?: string | null;
  bankKey?: string | null;
  bankName?: string | null;
  accountLabel?: string | null;
  date?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  bookingDate?: string | null;
  valueDate?: string | null;
  bookingText?: string | null;
  category?: string | null;
  amount?: number | null;
  currency?: string | null;
  counterpartyName?: string | null;
  transactionId?: string | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
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
  runSummary?: string | null;
  warningCount?: number | null;
  skippedBanks?: Array<{
    bank?: string | null;
    label?: string | null;
    reason?: string | null;
  }> | null;
  bankErrors?: Array<{
    bank?: string | null;
    label?: string | null;
    message?: string | null;
  }> | null;
  transactionStats?: Array<{
    bank?: string | null;
    fetchedCount?: number | null;
    newCount?: number | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    mode?: string | null;
  }> | null;
  unknownCount?: number | null;
  portalDocumentFailedCount?: number | null;
  portalDocumentUnresolvedFailureCount?: number | null;
  portalDocumentDomFallbackCount?: number | null;
  portalDocumentUnknownLabels?: string[] | null;
  unknownDocuments?: Array<Record<string, unknown>> | null;
  warnings?: unknown[] | null;
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

export type AutomationCommandType =
  | "sync_quotes"
  | "full_refresh"
  | "health_check"
  | "traderepublic_portal_refresh"
  | "tfbank_refresh"
  | "capitalcom_refresh";

export interface EquatePlusManualInputDocument {
  id: string;
  source?: "equateplus" | string;
  instrumentId?: "novartis" | string;
  isin?: "CH0012005267" | string;
  name?: string | null;
  quantity?: number | null;
  entryValueEur?: number | null;
  entryValueCurrency?: "EUR" | string;
  discountPct?: number | null;
  updatedBy?: string | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
}

export interface CashHomeManualInputDocument {
  id: string;
  source?: "cash_home" | string;
  amountEur?: number | null;
  currency?: "EUR" | string;
  updatedBy?: string | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
}

export interface UiPreferencesDocument {
  id: string;
  expandedSections?: Record<string, boolean>;
  sourceOrder?: string[];
  updatedBy?: string | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
}

export type DocumentInboxDecision = "covered" | "not_relevant" | "needs_parser" | "deferred";
export type DocumentInboxDecisionScope = "item" | "document_type";

export interface DocumentReviewDecisionDocument {
  id: string;
  source?: string | null;
  scope?: DocumentInboxDecisionScope | string | null;
  decision?: DocumentInboxDecision | string | null;
  status?: "ACTIVE" | "REVOKED" | string | null;
  targetId?: string | null;
  targetSignature?: string | null;
  targetLabel?: string | null;
  targetDocumentType?: string | null;
  reason?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
}

interface SourceDocumentIssueRecord {
  id: string;
  source?: string | null;
  sourceChannel?: string | null;
  fileName?: string | null;
  filePath?: string | null;
  storagePath?: string | null;
  rawStoragePath?: string | null;
  driveWebUrl?: string | null;
  driveUrl?: string | null;
  documentType?: string | null;
  parseStatus?: string | null;
  status?: string | null;
  baselineId?: string | null;
  fileHash?: string | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
}

interface SourceDocumentFactIssueRecord {
  id: string;
  source?: string | null;
  sourceChannel?: string | null;
  factType?: string | null;
  status?: string | null;
  parseStatus?: string | null;
  portalDocumentLabel?: string | null;
  documentType?: string | null;
  message?: string | null;
  transactionTitle?: string | null;
  transactionPortalDate?: string | null;
  portalTransactionSignature?: string | null;
  rawTransactionText?: string | null;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number } | null;
}

export interface DocumentInboxItem {
  id: string;
  source: string;
  origin: "sourceDocument" | "sourceDocumentFact";
  severity: "warning" | "error" | "info";
  title: string;
  message: string;
  documentType?: string | null;
  label?: string | null;
  date?: string | Date | { toDate: () => Date } | { seconds: number } | null;
  targetId: string;
  targetSignature?: string | null;
  sourceChannel?: string | null;
  rawStatus?: string | null;
  documentUrl?: string | null;
  documentStoragePath?: string | null;
  documentAccessMode?: "firebase_storage" | "drive" | "local" | null;
  reviewDecision?: DocumentReviewDecisionDocument | null;
}

function sanitizeFirestoreId(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 220) || "item";
}

function documentIssueDecisionId(item: Pick<DocumentInboxItem, "source" | "targetId">) {
  return `${item.source}_item_${sanitizeFirestoreId(item.targetId)}`;
}

function documentTypeDecisionId(item: Pick<DocumentInboxItem, "source" | "label" | "documentType">) {
  return `${item.source}_type_${sanitizeFirestoreId(item.label ?? item.documentType ?? "unknown")}`;
}

function isGenericUnclassifiedDocumentType(documentType?: string | null) {
  const normalized = String(documentType ?? "").toLowerCase();
  return (
    !normalized ||
    normalized === "unknown" ||
    normalized === "unknown_document" ||
    normalized === "unknown_portal_document" ||
    normalized === "unparsed" ||
    normalized === "unclassified"
  );
}

function isUnknownDocument(document: SourceDocumentIssueRecord) {
  return (
    document.documentType === "unknown" ||
    document.documentType === "unknown_portal_document" ||
    document.parseStatus === "UNKNOWN" ||
    document.parseStatus === "UNPARSED" ||
    document.parseStatus === "FEHLER" ||
    document.parseStatus === "ERROR"
  );
}

function isUnknownFact(fact: SourceDocumentFactIssueRecord) {
  return (
    fact.factType === "portal_document_failure" ||
    fact.factType === "unknown" ||
    fact.factType === "unknown_portal_document" ||
    fact.parseStatus === "UNKNOWN" ||
    fact.parseStatus === "UNPARSED" ||
    fact.parseStatus === "FEHLER" ||
    fact.parseStatus === "ERROR"
  );
}

function decisionMatchesItem(decision: DocumentReviewDecisionDocument, item: DocumentInboxItem) {
  if (!decision || decision.status === "REVOKED" || decision.source !== item.source) return false;
  if (decision.scope === "document_type") {
    if (
      decision.targetLabel &&
      !isGenericUnclassifiedDocumentType(decision.targetLabel) &&
      decision.targetLabel === item.label
    ) {
      return true;
    }
    if (isGenericUnclassifiedDocumentType(decision.targetDocumentType)) return false;
    return Boolean(decision.targetDocumentType && decision.targetDocumentType === item.documentType);
  }

  return Boolean(
    decision.targetId === item.targetId ||
      (decision.targetSignature && decision.targetSignature === item.targetSignature),
  );
}

function decisionRank(decision?: DocumentReviewDecisionDocument | null) {
  if (!decision || decision.status === "REVOKED") return 0;
  if (decision.decision === "deferred") return 1;
  if (decision.decision === "needs_parser") return 1;
  if (decision.decision === "not_relevant") return 2;
  if (decision.decision === "covered") return 3;
  return 1;
}

function isOpenInboxItem(item: DocumentInboxItem) {
  if (item.rawStatus === "PARSED") return false;
  if (!item.reviewDecision) return true;
  return item.reviewDecision.decision === "needs_parser";
}

function documentRecordToInboxItem(document: SourceDocumentIssueRecord): DocumentInboxItem {
  const documentType = document.documentType ?? "unknown";
  const storagePath = document.storagePath ?? document.rawStoragePath ?? null;
  const driveUrl = document.driveWebUrl ?? document.driveUrl ?? null;
  const canOpenPdf = Boolean(document.filePath && document.fileName?.toLowerCase().endsWith(".pdf"));
  const isParsed = document.parseStatus === "PARSED" || document.status === "PARSED";
  const localDocumentUrl = canOpenPdf ? `http://127.0.0.1:5176/documents/${encodeURIComponent(document.id)}` : null;
  return {
    id: `document:${document.id}`,
    source: document.source ?? "unknown",
    origin: "sourceDocument",
    severity: isParsed ? "info" : document.parseStatus === "ERROR" || document.parseStatus === "FEHLER" ? "error" : "warning",
    title: document.fileName ?? "Unbekanntes Dokument",
    message: isParsed
      ? `Dokumenttyp ${documentType} wurde verarbeitet und bleibt im Archiv sichtbar.`
      : `Dokumenttyp ${documentType} wartet auf Entscheidung oder spaeteren Parser.`,
    documentType,
    label: document.fileName ?? documentType,
    date: document.updatedAt ?? null,
    targetId: document.id,
    targetSignature: document.fileHash ?? document.baselineId ?? null,
    sourceChannel: document.sourceChannel ?? null,
    rawStatus: document.parseStatus ?? document.status ?? null,
    documentUrl: driveUrl ?? (storagePath ? null : localDocumentUrl),
    documentStoragePath: storagePath,
    documentAccessMode: storagePath ? "firebase_storage" : driveUrl ? "drive" : localDocumentUrl ? "local" : null,
  };
}

function factRecordToInboxItem(fact: SourceDocumentFactIssueRecord): DocumentInboxItem {
  if (fact.factType === "portal_document_failure") {
    const label = fact.portalDocumentLabel ?? fact.documentType ?? "Portal-Dokument";
    return {
      id: `fact:${fact.id}`,
      source: fact.source ?? "unknown",
      origin: "sourceDocumentFact",
      severity: "warning",
      title: label,
      message: fact.message ?? "Portal-Dokument konnte nicht geladen oder ausgewertet werden.",
      documentType: fact.documentType ?? fact.factType ?? null,
      label,
      date: fact.transactionPortalDate ?? fact.updatedAt ?? null,
      targetId: fact.id,
      targetSignature: fact.portalTransactionSignature ?? null,
      sourceChannel: fact.sourceChannel ?? null,
      rawStatus: fact.status ?? fact.parseStatus ?? null,
    };
  }

  const factType = fact.factType ?? "unknown";
  return {
    id: `fact:${fact.id}`,
    source: fact.source ?? "unknown",
    origin: "sourceDocumentFact",
    severity: fact.status === "ERROR" || fact.status === "FEHLER" ? "error" : "warning",
    title: fact.portalDocumentLabel ?? factType,
    message: `Dokumentfakt ${factType} passt noch nicht in die Datenstruktur.`,
    documentType: fact.documentType ?? factType,
    label: fact.portalDocumentLabel ?? factType,
    date: fact.transactionPortalDate ?? fact.updatedAt ?? null,
    targetId: fact.id,
    targetSignature: fact.portalTransactionSignature ?? null,
    sourceChannel: fact.sourceChannel ?? null,
    rawStatus: fact.status ?? fact.parseStatus ?? null,
  };
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
  "externalQuotePrice",
  "externalQuotePriceEur",
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

export async function loadEquatePlusManualInput(
  db: Firestore,
): Promise<EquatePlusManualInputDocument | null> {
  const snapshot = await getDoc(doc(db, "manualInputs", "equateplus_novartis"));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Omit<EquatePlusManualInputDocument, "id">;
  return {
    id: snapshot.id,
    ...data,
    quantity: parseMaybeNumber(data.quantity) as number | null,
    entryValueEur: parseMaybeNumber(data.entryValueEur) as number | null,
    discountPct: parseMaybeNumber(data.discountPct) as number | null,
  };
}

export async function saveEquatePlusManualInput(
  db: Firestore,
  input: { quantity: number; entryValueEur: number },
  updatedBy?: string | null,
) {
  await setDoc(doc(db, "manualInputs", "equateplus_novartis"), {
    source: "equateplus",
    instrumentId: "novartis",
    isin: "CH0012005267",
    name: "Novartis",
    quantity: input.quantity,
    entryValueEur: input.entryValueEur,
    entryValueCurrency: "EUR",
    discountPct: 0.15,
    updatedBy: updatedBy ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function loadCashHomeManualInput(
  db: Firestore,
): Promise<CashHomeManualInputDocument | null> {
  const snapshot = await getDoc(doc(db, "manualInputs", "cash_home"));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Omit<CashHomeManualInputDocument, "id">;
  return {
    id: snapshot.id,
    ...data,
    amountEur: parseMaybeNumber(data.amountEur) as number | null,
  };
}

export async function saveCashHomeManualInput(
  db: Firestore,
  input: { amountEur: number },
  updatedBy?: string | null,
) {
  await setDoc(doc(db, "manualInputs", "cash_home"), {
    source: "cash_home",
    amountEur: input.amountEur,
    currency: "EUR",
    updatedBy: updatedBy ?? null,
    updatedAt: serverTimestamp(),
  });
}

function normalizeExpandedSections(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, isExpanded]) => typeof key === "string" && typeof isExpanded === "boolean"),
  ) as Record<string, boolean>;
}

function normalizeSourceOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((sourceId): sourceId is string => typeof sourceId === "string" && sourceId.trim().length > 0);
}

export async function loadUiPreferences(db: Firestore): Promise<UiPreferencesDocument | null> {
  const snapshot = await getDoc(doc(db, "uiPreferences", "portfolio_overview"));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Omit<UiPreferencesDocument, "id">;
  return {
    id: snapshot.id,
    ...data,
    expandedSections: normalizeExpandedSections(data.expandedSections),
    sourceOrder: normalizeSourceOrder(data.sourceOrder),
  };
}

export async function saveUiPreferences(
  db: Firestore,
  input: { expandedSections?: Record<string, boolean>; sourceOrder?: string[] },
  updatedBy?: string | null,
) {
  const payload: Record<string, unknown> = {
    updatedBy: updatedBy ?? null,
    updatedAt: serverTimestamp(),
  };
  if (input.expandedSections) payload.expandedSections = input.expandedSections;
  if (input.sourceOrder) payload.sourceOrder = input.sourceOrder;

  await setDoc(
    doc(db, "uiPreferences", "portfolio_overview"),
    payload,
    { merge: true },
  );
}

function parseDateMillis(value: BankLedgerEntryDocument["date"]) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toDate" in value) return value.toDate().getTime();
  if (typeof value === "object" && "seconds" in value) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadBankLedgerEntries(db: Firestore): Promise<BankLedgerEntryDocument[]> {
  const snapshot = await getDocs(query(collection(db, "ledgerEntries"), where("source", "==", "bank_accounts")));
  return snapshot.docs
    .map((entry) => ({
      id: entry.id,
      ...(entry.data() as Omit<BankLedgerEntryDocument, "id">),
    }))
    .filter((entry) => entry.source === "bank_accounts")
    .map((entry) => ({
      ...entry,
      amount: parseMaybeNumber(entry.amount) as number | null,
    }))
    .sort((left, right) => parseDateMillis(right.date) - parseDateMillis(left.date))
    .slice(0, 300);
}

export async function loadSystemHealth(db: Firestore): Promise<SystemHealth | null> {
  const snapshot = await getDoc(doc(db, "systemHealth", "current"));
  if (!snapshot.exists()) return null;
  return snapshot.data() as SystemHealth;
}

export async function loadDocumentInboxItems(
  db: Firestore,
  sourceId?: string,
): Promise<DocumentInboxItem[]> {
  const [documentsSnapshot, factsSnapshot, decisionsSnapshot] = await Promise.all([
    getDocs(collection(db, "sourceDocuments")),
    getDocs(collection(db, "sourceDocumentFacts")),
    getDocs(collection(db, "documentReviewDecisions")),
  ]);
  const documents = documentsSnapshot.docs.map((snapshot) => ({
    id: snapshot.id,
    ...(snapshot.data() as Omit<SourceDocumentIssueRecord, "id">),
  }));
  const facts = factsSnapshot.docs.map((snapshot) => ({
    id: snapshot.id,
    ...(snapshot.data() as Omit<SourceDocumentFactIssueRecord, "id">),
  }));
  const decisions = decisionsSnapshot.docs.map((snapshot) => ({
    id: snapshot.id,
    ...(snapshot.data() as Omit<DocumentReviewDecisionDocument, "id">),
  }));

  return [
    ...documents.filter(isUnknownDocument).map(documentRecordToInboxItem),
    ...documents
      .filter((document) => document.source === "intergold" && !isUnknownDocument(document))
      .map(documentRecordToInboxItem),
    ...facts.filter(isUnknownFact).map(factRecordToInboxItem),
  ]
    .filter((item) => !sourceId || item.source === sourceId)
    .map((item) => ({
      ...item,
      reviewDecision:
        decisions
          .filter((decision) => decisionMatchesItem(decision, item))
          .sort((left, right) => decisionRank(right) - decisionRank(left))[0] ?? null,
    }))
    .filter(isOpenInboxItem)
    .sort((left, right) => {
      return String(right.date ?? "").localeCompare(String(left.date ?? ""));
    });
}

export async function markDocumentInboxItemDecision(
  db: Firestore,
  item: DocumentInboxItem,
  decision: DocumentInboxDecision,
  reason: string,
  decidedBy?: string | null,
  scope: DocumentInboxDecisionScope = "item",
) {
  const decisionRef = doc(
    db,
    "documentReviewDecisions",
    scope === "document_type" ? documentTypeDecisionId(item) : documentIssueDecisionId(item),
  );
  await setDoc(decisionRef, {
    source: item.source,
    scope,
    decision,
    status: "ACTIVE",
    targetId: scope === "item" ? item.targetId : null,
    targetSignature: scope === "item" ? item.targetSignature ?? null : null,
    targetLabel: item.label ?? null,
    targetDocumentType: item.documentType ?? null,
    reason,
    decidedBy: decidedBy ?? null,
    decidedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function requestAutomationCommand(
  db: Firestore,
  commandId: string,
  type: AutomationCommandType,
  requestedBy?: string | null,
) {
  const commandRef = doc(db, "automationCommands", commandId);
  await setDoc(commandRef, {
    type,
    status: "REQUESTED",
    requestedBy: requestedBy ?? null,
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function requestQuoteSync(db: Firestore, requestedBy?: string | null) {
  await requestAutomationCommand(db, "sync_quotes_manual", "sync_quotes", requestedBy);
}

export async function requestHealthCheck(db: Firestore, requestedBy?: string | null) {
  await requestAutomationCommand(db, "health_check_manual", "health_check", requestedBy);
}

export async function requestTradeRepublicPortalRefresh(db: Firestore, requestedBy?: string | null) {
  await requestAutomationCommand(db, "traderepublic_portal_refresh", "traderepublic_portal_refresh", requestedBy);
}

export async function loadAutomationCommand(
  db: Firestore,
  commandId: string,
): Promise<AutomationCommandDocument | null> {
  const snapshot = await getDoc(doc(db, "automationCommands", commandId));
  if (!snapshot.exists()) return null;
  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<AutomationCommandDocument, "id">),
  };
}

export async function loadQuoteSyncCommand(db: Firestore): Promise<AutomationCommandDocument | null> {
  return loadAutomationCommand(db, "sync_quotes_manual");
}

export async function loadHealthCheckCommand(db: Firestore): Promise<AutomationCommandDocument | null> {
  return loadAutomationCommand(db, "health_check_manual");
}

export async function loadTradeRepublicPortalCommand(db: Firestore): Promise<AutomationCommandDocument | null> {
  return loadAutomationCommand(db, "traderepublic_portal_refresh");
}
