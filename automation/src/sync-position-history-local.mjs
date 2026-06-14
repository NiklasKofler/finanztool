import "dotenv/config";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");

function historyDateId(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function safeId(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseMaybeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

function positionHistoryId(position) {
  return `position_${safeId(position.id)}`;
}

function latestPreviousHistory(priceHistory, historyKey, currentHistoryDate) {
  return priceHistory
    .filter((entry) => {
      const entryDate = String(entry.historyDate ?? "");
      return (
        entry.historyKey === historyKey &&
        entry.status === "OK" &&
        typeof parseMaybeNumber(entry.currentValue) === "number" &&
        entryDate &&
        entryDate < currentHistoryDate
      );
    })
    .sort((left, right) => String(right.historyDate ?? "").localeCompare(String(left.historyDate ?? "")))[0] ?? null;
}

function positionUnitPrice(position, currentValue) {
  const explicitPrice =
    parseMaybeNumber(position.quotePriceEur) ??
    (String(position.quoteCurrency ?? "").toUpperCase() === "EUR" ? parseMaybeNumber(position.quotePrice) : null);
  if (typeof explicitPrice === "number") return explicitPrice;

  const quantity = parseMaybeNumber(position.quantity);
  if (typeof quantity === "number" && quantity > 0 && typeof currentValue === "number") {
    return currentValue / quantity;
  }

  return null;
}

async function main() {
  const firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  const now = new Date();
  const currentHistoryDate = historyDateId(now);
  const [positions, priceHistory] = await Promise.all([
    firestore.listDocuments("sourcePositions"),
    firestore.listDocuments("priceHistory"),
  ]);

  const results = [];
  for (const position of positions) {
    const currentValue = parseMaybeNumber(position.currentValue);
    if (typeof currentValue !== "number") continue;

    const historyKey = positionHistoryId(position);
    const previous = latestPreviousHistory(priceHistory, historyKey, currentHistoryDate);
    const previousCloseValue = parseMaybeNumber(previous?.currentValue);
    const dayChangeValue =
      typeof previousCloseValue === "number" ? roundCurrency(currentValue - previousCloseValue) : null;
    const dayChangePct =
      typeof previousCloseValue === "number" && previousCloseValue
        ? dayChangeValue / previousCloseValue
        : null;
    const unitPriceEur = positionUnitPrice(position, currentValue);

    if (writeEnabled) {
      await firestore.setDocument("priceHistory", `${historyKey}_${currentHistoryDate}`, {
        historyKey,
        instrumentId: historyKey,
        positionId: position.id,
        source: position.source,
        name: position.name ?? null,
        category: position.category ?? null,
        isin: position.isin ?? null,
        wkn: position.wkn ?? null,
        quantity: parseMaybeNumber(position.quantity),
        price: unitPriceEur,
        priceEur: unitPriceEur,
        currency: "EUR",
        currentValue,
        currentValueEur: currentValue,
        currentValueUsdt: parseMaybeNumber(position.currentValueUsdt),
        quoteText: position.quoteText ?? null,
        quotePrice: parseMaybeNumber(position.quotePrice),
        quoteCurrency: position.quoteCurrency ?? null,
        provider: position.quoteProvider ?? position.priceSource ?? position.valuationMethod ?? null,
        asOf: position.quoteAsOf ?? position.valuationDate ?? position.updatedAt ?? now,
        historyDate: currentHistoryDate,
        status: "OK",
        updatedAt: now,
      });
      const dayChangePatch =
        typeof previousCloseValue === "number"
          ? {
              previousCloseValue,
              dayChangeValue,
              dayChangePct,
            }
          : {
              previousCloseValue: position.previousCloseValue ?? null,
              dayChangeValue: position.dayChangeValue ?? null,
              dayChangePct: position.dayChangePct ?? null,
            };
      await firestore.setDocument("sourcePositions", position.id, {
        ...position,
        ...dayChangePatch,
        updatedAt: position.updatedAt ?? now,
      });
    }

    results.push({
      id: position.id,
      source: position.source,
      currentValue,
      previousCloseValue,
      dayChangeValue,
      dayChangePct,
    });
  }

  console.log(JSON.stringify({
    mode: writeEnabled ? "write" : "dry-run",
    historyDate: currentHistoryDate,
    processedPositionCount: results.length,
    withPreviousCount: results.filter((result) => typeof result.previousCloseValue === "number").length,
    nonZeroDayChangeCount: results.filter((result) => result.dayChangeValue).length,
  }, null, 2));

  if (!writeEnabled) console.log("[dry-run] Keine Firestore-Daten geaendert. Fuer Schreiben --write verwenden.");
}

await main();
