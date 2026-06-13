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
  valuationDate?: string;
  updatedAt?: string | Date | { toDate: () => Date } | { seconds: number };
  positionCount?: number;
  status?: string;
  storageStatus?: string;
  valuationMethod?: string;
}

export async function loadSourceSummaries(db: Firestore) {
  const snapshot = await getDocs(collection(db, "sourceSummaries"));
  return Object.fromEntries(
    snapshot.docs.map((doc) => [doc.id, doc.data() as SourceSummaryDocument]),
  );
}

const numericPositionFields = [
  "currentValue",
  "currentValueUsdt",
  "costValue",
  "costValueQuote",
  "performanceValue",
  "performancePct",
  "quantity",
  "quotePrice",
  "quotePriceEur",
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
