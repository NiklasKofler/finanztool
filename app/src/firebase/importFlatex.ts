import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { hashFileSha256, parseFlatexCsv } from "../imports/flatex";

export interface FlatexImportSummary {
  importId: string;
  status: "IMPORTED" | "DUPLICATE";
  transactionCount: number;
  skippedRows: number;
  warningCount: number;
  totalAmount: number;
}

function buildPositionMap(rows: ReturnType<typeof parseFlatexCsv>["rows"]) {
  const positions = new Map<
    string,
    { isin: string | null; label: string; quantity: number; currency: string }
  >();

  for (const row of rows) {
    if (row.quantity === null || row.quantity === 0) continue;
    const key = row.isin ?? `TEXT:${row.bookingText}`;
    const current =
      positions.get(key) ?? {
        isin: row.isin,
        label: row.bookingText,
        quantity: 0,
        currency: row.currency || "EUR",
      };

    current.quantity += row.quantity;
    positions.set(key, current);
  }

  return Array.from(positions.entries()).map(([key, value]) => ({
    key,
    ...value,
  }));
}

export async function importFlatexCsvToFirestore(
  db: Firestore,
  file: File,
): Promise<FlatexImportSummary> {
  const fileHash = await hashFileSha256(file);
  const importId = `flatex_${fileHash.slice(0, 20)}`;
  const importRef = doc(db, "imports", importId);
  const existing = await getDoc(importRef);

  if (existing.exists()) {
    const data = existing.data() as { transactionCount?: number; warnings?: string[] } | undefined;
    return {
      importId,
      status: "DUPLICATE",
      transactionCount: data?.transactionCount ?? 0,
      skippedRows: 0,
      warningCount: data?.warnings?.length ?? 0,
      totalAmount: 0,
    };
  }

  const text = await file.text();
  const parsed = parseFlatexCsv(text);
  const totalAmount = parsed.rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const positions = buildPositionMap(parsed.rows);
  let didCreateImport = false;

  await runTransaction(db, async (tx) => {
    const current = await tx.get(importRef);
    if (current.exists()) return;

    tx.set(importRef, {
      source: "flatex",
      fileName: file.name,
      fileSize: file.size,
      fileHash,
      status: "IMPORTED",
      createdAt: serverTimestamp(),
      transactionCount: parsed.rows.length,
      skippedRows: parsed.skippedRows,
      warnings: parsed.warnings,
      totalAmount,
    });
    didCreateImport = true;
  });

  if (!didCreateImport) {
    return {
      importId,
      status: "DUPLICATE",
      transactionCount: parsed.rows.length,
      skippedRows: parsed.skippedRows,
      warningCount: parsed.warnings.length,
      totalAmount,
    };
  }

  const batch = writeBatch(db);

  parsed.rows.forEach((row, index) => {
    const txRef = doc(db, "transactions", `${importId}_${index + 1}`);
    batch.set(txRef, {
      source: "flatex",
      importId,
      date: row.date,
      bookingText: row.bookingText,
      isin: row.isin,
      quantity: row.quantity,
      amount: row.amount,
      currency: row.currency || "EUR",
      raw: row.raw,
      createdAt: serverTimestamp(),
    });
  });

  positions.forEach((position) => {
    const positionRef = doc(db, "positions", `flatex_${position.key.replace(/\s+/g, "_")}`);
    batch.set(
      positionRef,
      {
        source: "flatex",
        isin: position.isin,
        label: position.label,
        quantity: position.quantity,
        currency: position.currency,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  const snapshotRef = doc(db, "snapshots", `flatex_${Date.now()}`);
  batch.set(snapshotRef, {
    source: "flatex",
    importId,
    createdAt: serverTimestamp(),
    totalAmount,
    transactionCount: parsed.rows.length,
    positionCount: positions.length,
  });

  await batch.commit();

  return {
    importId,
    status: "IMPORTED",
    transactionCount: parsed.rows.length,
    skippedRows: parsed.skippedRows,
    warningCount: parsed.warnings.length,
    totalAmount,
  };
}
