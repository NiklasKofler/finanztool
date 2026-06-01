import { collection, getDocs, type Firestore } from "firebase/firestore";
import type { PortfolioPosition } from "../domain/types";

export interface SourceSummaryDocument {
  source: string;
  currentValue?: number;
  costValue?: number;
  performanceValue?: number;
  performancePct?: number;
  valuationDate?: string;
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

export async function loadSourcePositions(db: Firestore): Promise<PortfolioPosition[]> {
  const snapshot = await getDocs(collection(db, "sourcePositions"));
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<PortfolioPosition, "id">),
  }));
}
