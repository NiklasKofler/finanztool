import "dotenv/config";
import crypto from "node:crypto";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { normalizeEventDocument } from "./event-model.mjs";
import {
  createTrading212ClientFromLocalSecrets,
  fetchTrading212Paginated,
} from "./trading212-client.mjs";

const source = "trading212";
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const snapshotOnly = process.argv.includes("--snapshot-only");
const forceBackfill = process.argv.includes("--backfill") || process.argv.includes("--full");
const now = new Date();
const runId = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const importId = `api_trading212_${runId}`;
const dataProvider = "trading212_api";
const historyMaxPages = Math.max(
  1,
  Number.parseInt(process.env.TRADING212_HISTORY_MAX_PAGES ?? "3", 10) || 3,
);
const transactionLookbackDays = Math.max(
  1,
  Number.parseInt(process.env.TRADING212_TRANSACTION_LOOKBACK_DAYS ?? "30", 10) || 30,
);
const historyOverlapDays = Math.max(
  0,
  Number.parseInt(process.env.TRADING212_HISTORY_OVERLAP_DAYS ?? "1", 10) || 1,
);

function sanitizeId(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160) || "unknown";
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex").slice(0, 24);
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function newestDate(values) {
  return values
    .map(parseDate)
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function instrumentId(instrument, fallbackTicker = null) {
  const isin = instrument?.isin;
  if (isin) return `isin_${String(isin).toUpperCase()}`;
  const ticker = instrument?.ticker ?? fallbackTicker;
  return ticker ? `trading212_${sanitizeId(ticker).toLowerCase()}` : null;
}

function instrumentName(instrument, fallback = null) {
  return instrument?.name ?? fallback ?? instrument?.ticker ?? "Trading 212 Position";
}

function positionId(position, index) {
  const ticker = position.instrument?.ticker ?? position.ticker ?? `position_${index + 1}`;
  return `trading212_${sanitizeId(ticker)}`;
}

function cashTotal(summary) {
  const cash = summary?.cash ?? {};
  return roundCurrency(
    (parseNumber(cash.availableToTrade) ?? 0) +
      (parseNumber(cash.inPies) ?? 0) +
      (parseNumber(cash.reservedForOrders) ?? 0),
  );
}

function buildSnapshot(summary, rawPositions) {
  const valuationDate = now.toISOString();
  const currency = summary?.currency ?? rawPositions?.[0]?.walletImpact?.currency ?? "EUR";
  const cashValue = cashTotal(summary);
  const investments = summary?.investments ?? {};
  const investmentsValue = roundCurrency(parseNumber(investments.currentValue) ?? 0);
  const totalCost = roundCurrency(parseNumber(investments.totalCost));
  const unrealizedProfitLoss = roundCurrency(parseNumber(investments.unrealizedProfitLoss));
  const apiTotalValue = roundCurrency(parseNumber(summary?.totalValue));
  const computedTotalValue = roundCurrency((investmentsValue ?? 0) + (cashValue ?? 0));
  const currentValue = computedTotalValue ?? apiTotalValue ?? investmentsValue ?? 0;

  const positions = rawPositions.map((position, index) => {
    const instrument = position.instrument ?? {};
    const costValue = roundCurrency(parseNumber(position.walletImpact?.totalCost));
    const currentPositionValue = roundCurrency(parseNumber(position.walletImpact?.currentValue));
    const performanceValue = roundCurrency(parseNumber(position.walletImpact?.unrealizedProfitLoss));
    const quantity = parseNumber(position.quantity);
    const currentPrice = parseNumber(position.currentPrice);
    const averagePricePaid = parseNumber(position.averagePricePaid);
    return {
      id: positionId(position, index),
      source,
      name: instrumentName(instrument),
      category: "Aktie/ETF",
      isin: instrument.isin ?? null,
      wkn: instrument.ticker ?? position.ticker ?? null,
      symbol: instrument.ticker ?? position.ticker ?? null,
      quantity,
      quantityText: typeof quantity === "number" ? `${quantity.toFixed(5).replace(/0+$/, "").replace(/\.$/, "")} Stk.` : null,
      currentPrice,
      quoteText: typeof currentPrice === "number" ? `${currentPrice} ${instrument.currency ?? ""}`.trim() : null,
      costValue,
      currentValue: currentPositionValue,
      performanceValue,
      performancePct:
        typeof performanceValue === "number" && typeof costValue === "number" && costValue !== 0
          ? performanceValue / costValue
          : null,
      accountValueIncluded: true,
      averagePricePaid,
      quantityAvailableForTrading: parseNumber(position.quantityAvailableForTrading),
      quantityInPies: parseNumber(position.quantityInPies),
      fxImpact: roundCurrency(parseNumber(position.walletImpact?.fxImpact)),
      walletCurrency: position.walletImpact?.currency ?? currency,
      instrumentCurrency: instrument.currency ?? null,
      sourceAccountId: summary?.id ? String(summary.id) : null,
      accountId: summary?.id ? String(summary.id) : null,
      instrumentId: instrumentId(instrument, position.ticker),
      valuationDate,
      valuationMethod: "trading212_api_positions_v1",
      sourceDataProvider: dataProvider,
      sourceDataUpdatedAt: valuationDate,
      quoteDataProvider: dataProvider,
      quoteDataUpdatedAt: valuationDate,
      raw: position,
    };
  });

  return {
    source,
    displayName: "Trading 212",
    accountId: summary?.id ? String(summary.id) : null,
    currency,
    currentValue,
    netValue: currentValue,
    depotValue: investmentsValue,
    positionsValue: investmentsValue,
    cashValue,
    costValue: totalCost,
    performanceValue: unrealizedProfitLoss,
    performancePct:
      typeof unrealizedProfitLoss === "number" && typeof totalCost === "number" && totalCost !== 0
        ? unrealizedProfitLoss / totalCost
        : null,
    realizedProfitLoss: roundCurrency(parseNumber(investments.realizedProfitLoss)),
    apiTotalValue,
    computedTotalValue,
    positionCount: positions.length,
    valuationDate,
    status: "VERIFIED",
    positions,
    raw: {
      summary,
      positions: rawPositions,
    },
  };
}

function eventDate(row, kind) {
  if (kind === "order") return firstPresent(row.fill?.filledAt, row.order?.createdAt);
  if (kind === "dividend") return row.paidOn;
  return row.dateTime;
}

function ledgerId(kind, row) {
  if (kind === "order") return `trading212_order_${sanitizeId(row.fill?.id ?? row.order?.id ?? stableHash(row))}`;
  if (kind === "dividend") return `trading212_dividend_${sanitizeId(row.reference ?? stableHash(row))}`;
  return `trading212_transaction_${sanitizeId(row.reference ?? stableHash(row))}`;
}

function signedOrderAmount(row) {
  const value = parseNumber(row.fill?.walletImpact?.netValue);
  if (typeof value !== "number") return null;
  const side = String(row.order?.side ?? "").toUpperCase();
  if (side === "BUY") return -Math.abs(value);
  if (side === "SELL") return Math.abs(value);
  return value;
}

function normalizeOrderLedger(row) {
  const instrument = row.order?.instrument ?? {};
  const date = eventDate(row, "order");
  const orderId = row.order?.id ?? null;
  const fillId = row.fill?.id ?? null;
  return {
    id: ledgerId("order", row),
    source,
    date: parseDate(date)?.toISOString() ?? date ?? null,
    bookingDate: parseDate(date)?.toISOString()?.slice(0, 10) ?? null,
    category: "trade",
    subcategory: String(row.order?.side ?? row.fill?.type ?? "order").toLowerCase(),
    type: String(row.order?.side ?? row.fill?.type ?? "order").toLowerCase(),
    description: `${row.order?.side ?? "Order"} ${instrumentName(instrument, row.order?.ticker)}`.trim(),
    amount: signedOrderAmount(row),
    currency: row.fill?.walletImpact?.currency ?? row.order?.currency ?? null,
    instrumentName: instrumentName(instrument, row.order?.ticker),
    instrumentId: instrumentId(instrument, row.order?.ticker),
    isin: instrument.isin ?? null,
    symbol: row.order?.ticker ?? instrument.ticker ?? null,
    quantity: parseNumber(row.fill?.quantity ?? row.order?.filledQuantity ?? row.order?.quantity),
    price: parseNumber(row.fill?.price),
    orderId,
    fillId,
    transactionId: fillId ?? orderId ?? null,
    eventGroupId: `trading212_order_${sanitizeId(orderId ?? fillId ?? stableHash(row))}`,
    sourceAccountId: null,
    sourceDataProvider: dataProvider,
    sourceDataUpdatedAt: now,
    importId,
    raw: row,
    updatedAt: now,
  };
}

function normalizeDividendLedger(row) {
  const instrument = row.instrument ?? {};
  const date = eventDate(row, "dividend");
  return {
    id: ledgerId("dividend", row),
    source,
    date: parseDate(date)?.toISOString() ?? date ?? null,
    bookingDate: parseDate(date)?.toISOString()?.slice(0, 10) ?? null,
    category: "dividend",
    subcategory: String(row.type ?? "dividend").toLowerCase(),
    type: String(row.type ?? "dividend").toLowerCase(),
    description: `${row.type ?? "Dividend"} ${instrumentName(instrument, row.ticker)}`.trim(),
    amount: roundCurrency(parseNumber(row.amount)),
    amountInEuro: roundCurrency(parseNumber(row.amountInEuro)),
    currency: row.currency ?? "EUR",
    instrumentName: instrumentName(instrument, row.ticker),
    instrumentId: instrumentId(instrument, row.ticker),
    isin: instrument.isin ?? null,
    symbol: row.ticker ?? instrument.ticker ?? null,
    quantity: parseNumber(row.quantity),
    grossAmountPerShare: parseNumber(row.grossAmountPerShare),
    reference: row.reference ?? null,
    transactionId: row.reference ?? null,
    eventGroupId: `trading212_dividend_${sanitizeId(row.reference ?? stableHash(row))}`,
    sourceDataProvider: dataProvider,
    sourceDataUpdatedAt: now,
    importId,
    raw: row,
    updatedAt: now,
  };
}

function normalizeCashLedger(row) {
  const date = eventDate(row, "transaction");
  return {
    id: ledgerId("transaction", row),
    source,
    date: parseDate(date)?.toISOString() ?? date ?? null,
    bookingDate: parseDate(date)?.toISOString()?.slice(0, 10) ?? null,
    category: "cash_transfer",
    subcategory: String(row.type ?? "transaction").toLowerCase(),
    type: String(row.type ?? "transaction").toLowerCase(),
    description: `Trading 212 ${row.type ?? "Transaction"}`,
    amount: roundCurrency(parseNumber(row.amount)),
    currency: row.currency ?? "EUR",
    reference: row.reference ?? null,
    transactionId: row.reference ?? null,
    eventGroupId: `trading212_transaction_${sanitizeId(row.reference ?? stableHash(row))}`,
    sourceDataProvider: dataProvider,
    sourceDataUpdatedAt: now,
    importId,
    raw: row,
    updatedAt: now,
  };
}

function costEventsFromOrder(row, ledgerEntry) {
  const taxes = row.fill?.walletImpact?.taxes ?? [];
  return taxes
    .map((tax, index) => {
      const amount = roundCurrency(Math.abs(parseNumber(tax.quantity) ?? 0));
      if (!amount) return null;
      return {
        id: `${ledgerEntry.id}_tax_${sanitizeId(tax.name ?? index)}`,
        source,
        sourceLedgerEntryId: ledgerEntry.id,
        date: parseDate(tax.chargedAt ?? ledgerEntry.date)?.toISOString() ?? ledgerEntry.date,
        category: "tax",
        subcategory: String(tax.name ?? "trading212_tax").toLowerCase(),
        type: String(tax.name ?? "tax").toLowerCase(),
        amount,
        currency: tax.currency ?? ledgerEntry.currency,
        description: `${tax.name ?? "Tax"} ${ledgerEntry.instrumentName ?? ""}`.trim(),
        instrumentName: ledgerEntry.instrumentName ?? null,
        instrumentId: ledgerEntry.instrumentId ?? null,
        isin: ledgerEntry.isin ?? null,
        symbol: ledgerEntry.symbol ?? null,
        eventGroupId: ledgerEntry.eventGroupId,
        transactionId: ledgerEntry.transactionId ?? null,
        sourceDataProvider: dataProvider,
        sourceDataUpdatedAt: now,
        importId,
        raw: tax,
        updatedAt: now,
      };
    })
    .filter(Boolean);
}

function incomeEventFromDividend(entry) {
  return {
    id: `${entry.id}_income`,
    source,
    sourceLedgerEntryId: entry.id,
    date: entry.date,
    category: "dividend",
    subcategory: entry.subcategory,
    type: entry.type,
    amount: typeof entry.amount === "number" ? Math.abs(entry.amount) : null,
    currency: entry.currency,
    description: entry.description,
    instrumentName: entry.instrumentName ?? null,
    instrumentId: entry.instrumentId ?? null,
    isin: entry.isin ?? null,
    symbol: entry.symbol ?? null,
    eventGroupId: entry.eventGroupId,
    transactionId: entry.transactionId ?? null,
    sourceDataProvider: dataProvider,
    sourceDataUpdatedAt: now,
    importId,
    raw: entry.raw,
    updatedAt: now,
  };
}

function costEventFromCashTransaction(entry) {
  if (entry.subcategory !== "fee") return null;
  return {
    id: `${entry.id}_cost`,
    source,
    sourceLedgerEntryId: entry.id,
    date: entry.date,
    category: "trading_cost",
    subcategory: "fee",
    type: "fee",
    amount: typeof entry.amount === "number" ? Math.abs(entry.amount) : null,
    currency: entry.currency,
    description: entry.description,
    eventGroupId: entry.eventGroupId,
    transactionId: entry.transactionId ?? null,
    sourceDataProvider: dataProvider,
    sourceDataUpdatedAt: now,
    importId,
    raw: entry.raw,
    updatedAt: now,
  };
}

function newestHistoryDate(history) {
  return newestDate([
    ...(history?.orders ?? []).map((row) => eventDate(row, "order")),
    ...(history?.dividends ?? []).map((row) => eventDate(row, "dividend")),
    ...(history?.transactions ?? []).map((row) => eventDate(row, "transaction")),
  ]);
}

async function fetchHistory(client, previousStatus) {
  const previousEndAt = parseDate(previousStatus?.lastHistorySyncEndAt);
  const fromDate =
    !forceBackfill && previousEndAt
      ? new Date(previousEndAt.getTime() - historyOverlapDays * 86_400_000)
      : dateDaysAgo(transactionLookbackDays);
  const fromIso = fromDate.toISOString();
  const [ordersPayload, dividendsPayload, transactionsPayload] = await Promise.all([
    fetchTrading212Paginated(client, client.getHistoricalOrders.bind(client), {
      params: { limit: 50 },
      maxPages: historyMaxPages,
    }),
    fetchTrading212Paginated(client, client.getHistoricalDividends.bind(client), {
      params: { limit: 50 },
      maxPages: historyMaxPages,
    }),
    fetchTrading212Paginated(client, client.getHistoricalTransactions.bind(client), {
      params: { limit: 50 },
      maxPages: historyMaxPages,
    }),
  ]);
  const isNewEnough = (row, kind) => {
    if (forceBackfill || !previousEndAt) return true;
    const date = parseDate(eventDate(row, kind));
    return !date || date >= fromDate;
  };
  return {
    from: fromIso,
    to: now.toISOString(),
    orders: ordersPayload.items.filter((row) => isNewEnough(row, "order")),
    dividends: dividendsPayload.items.filter((row) => isNewEnough(row, "dividend")),
    transactions: transactionsPayload.items.filter((row) => isNewEnough(row, "transaction")),
    truncated: {
      orders: ordersPayload.truncated,
      dividends: dividendsPayload.truncated,
      transactions: transactionsPayload.truncated,
    },
  };
}

function uniqueById(rows) {
  const result = new Map();
  for (const row of rows) result.set(row.id, row);
  return [...result.values()];
}

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});

try {
  const client = await createTrading212ClientFromLocalSecrets();
  const previousStatus = (await firestore.listDocuments("agentStatus")).find((status) => status.id === source);
  const [summary, positionsPayload] = await Promise.all([
    client.getAccountSummary(),
    client.getPositions(),
  ]);
  const rawPositions = Array.isArray(positionsPayload) ? positionsPayload : positionsPayload?.items ?? positionsPayload?.positions ?? [];
  const snapshot = buildSnapshot(summary, rawPositions);
  const history = snapshotOnly ? null : await fetchHistory(client, previousStatus);

  if (writeEnabled) {
    const existingPositions = (await firestore.listDocuments("sourcePositions")).filter(
      (position) => position.source === source,
    );
    const currentIds = new Set(snapshot.positions.map((position) => position.id));
    for (const position of existingPositions) {
      if (!currentIds.has(position.id)) await firestore.deleteDocument("sourcePositions", position.id);
    }
    for (const position of snapshot.positions) {
      await firestore.setDocument("sourcePositions", position.id, {
        ...position,
        importId,
        updatedAt: now,
      });
    }

    const orderLedgerEntries = (history?.orders ?? []).map(normalizeOrderLedger);
    const dividendLedgerEntries = (history?.dividends ?? []).map(normalizeDividendLedger);
    const cashLedgerEntries = (history?.transactions ?? []).map(normalizeCashLedger);
    const ledgerEntries = uniqueById([...orderLedgerEntries, ...dividendLedgerEntries, ...cashLedgerEntries]);
    const costEvents = uniqueById([
      ...orderLedgerEntries.flatMap((entry) => costEventsFromOrder(entry.raw, entry)),
      ...cashLedgerEntries.map(costEventFromCashTransaction).filter(Boolean),
    ]);
    const incomeEvents = uniqueById(dividendLedgerEntries.map(incomeEventFromDividend));

    for (const entry of ledgerEntries) {
      await firestore.setDocument("ledgerEntries", entry.id, normalizeEventDocument("ledgerEntries", entry, now));
      await firestore.setDocument("sourceDocumentFacts", entry.id, {
        ...entry,
        factType: "trading212_api_history",
        parseStatus: "OK",
        ledgerEntryId: entry.id,
      });
    }
    for (const event of costEvents) {
      await firestore.setDocument("costEvents", event.id, normalizeEventDocument("costEvents", event, now));
    }
    for (const event of incomeEvents) {
      await firestore.setDocument("incomeEvents", event.id, normalizeEventDocument("incomeEvents", event, now));
    }

    await firestore.setDocument("sourceSummaries", source, {
      source,
      displayName: "Trading 212",
      currentValue: snapshot.currentValue,
      netValue: snapshot.netValue,
      depotValue: snapshot.depotValue,
      positionsValue: snapshot.positionsValue,
      cashValue: snapshot.cashValue,
      costValue: snapshot.costValue,
      performanceValue: snapshot.performanceValue,
      performancePct: snapshot.performancePct,
      realizedProfitLoss: snapshot.realizedProfitLoss,
      apiTotalValue: snapshot.apiTotalValue,
      computedTotalValue: snapshot.computedTotalValue,
      accountId: snapshot.accountId,
      currency: snapshot.currency,
      positionCount: snapshot.positionCount,
      valuationDate: snapshot.valuationDate,
      status: snapshot.status,
      valuationMethod: "trading212_api_v1",
      sourceDataProvider: dataProvider,
      sourceDataUpdatedAt: snapshot.valuationDate,
      quoteDataProvider: dataProvider,
      quoteDataUpdatedAt: snapshot.valuationDate,
      ledgerEntryCount: ledgerEntries.length,
      costEventCount: costEvents.length,
      incomeEventCount: incomeEvents.length,
      historyFrom: history?.from ?? previousStatus?.historyFrom ?? null,
      historyTo: history?.to ?? previousStatus?.historyTo ?? null,
      historyTruncated: history?.truncated ?? previousStatus?.historyTruncated ?? null,
      updatedAt: now,
    });

    await firestore.setDocument("rawDocuments", "api_trading212_latest", {
      source,
      importId,
      fileType: "api",
      parserVersion: "trading212_api_v1",
      accountId: snapshot.accountId,
      summary,
      positions: snapshot.positions,
      historyFrom: history?.from ?? null,
      historyTo: history?.to ?? null,
      historyCounts: {
        orders: history?.orders?.length ?? 0,
        dividends: history?.dividends?.length ?? 0,
        transactions: history?.transactions?.length ?? 0,
      },
      historyTruncated: history?.truncated ?? null,
      raw: {
        summary: snapshot.raw.summary,
        positions: snapshot.raw.positions,
        history,
      },
      sourceDataProvider: dataProvider,
      sourceDataUpdatedAt: snapshot.valuationDate,
      quoteDataProvider: dataProvider,
      quoteDataUpdatedAt: snapshot.valuationDate,
      updatedAt: now,
    });

    await firestore.setDocument("imports", importId, {
      source,
      parser: "trading212_api_v1",
      status: "IMPORTED",
      snapshotOnly,
      positionCount: snapshot.positionCount,
      currentValue: snapshot.currentValue,
      cashValue: snapshot.cashValue,
      depotValue: snapshot.depotValue,
      valuationDate: snapshot.valuationDate,
      ledgerEntryCount: ledgerEntries.length,
      costEventCount: costEvents.length,
      incomeEventCount: incomeEvents.length,
      historyFrom: history?.from ?? null,
      historyTo: history?.to ?? null,
      historyTruncated: history?.truncated ?? null,
      runId,
      sourceDataProvider: dataProvider,
      sourceDataUpdatedAt: snapshot.valuationDate,
      quoteDataProvider: dataProvider,
      quoteDataUpdatedAt: snapshot.valuationDate,
      updatedAt: now,
    });

    const historyEndAt = newestHistoryDate(history) ?? previousStatus?.lastHistorySyncEndAt ?? null;
    await firestore.setDocument("agentStatus", source, {
      source,
      status: "OK",
      message:
        `Trading 212 aktualisiert: ${snapshot.positionCount} Position(en), ` +
        `${history ? `${ledgerEntries.length} History-Eintraege` : "Snapshot ohne History"}`,
      lastAttemptAt: now,
      lastSuccessAt: now,
      lastSnapshotSuccessAt: now,
      lastHistorySyncEndAt: historyEndAt,
      snapshotOnly,
      currentValue: snapshot.currentValue,
      cashValue: snapshot.cashValue,
      depotValue: snapshot.depotValue,
      positionCount: snapshot.positionCount,
      ledgerEntryCount: ledgerEntries.length,
      costEventCount: costEvents.length,
      incomeEventCount: incomeEvents.length,
      sourceDataProvider: dataProvider,
      sourceDataUpdatedAt: snapshot.valuationDate,
      quoteDataProvider: dataProvider,
      quoteDataUpdatedAt: snapshot.valuationDate,
      importId,
      updatedAt: now,
    });
  }

  console.log(
    JSON.stringify(
      {
        status: "OK",
        source,
        mode: writeEnabled ? "write" : "dry-run",
        snapshotOnly,
        currentValue: snapshot.currentValue,
        depotValue: snapshot.depotValue,
        cashValue: snapshot.cashValue,
        positionCount: snapshot.positionCount,
        historyCounts: {
          orders: history?.orders?.length ?? 0,
          dividends: history?.dividends?.length ?? 0,
          transactions: history?.transactions?.length ?? 0,
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (writeEnabled) {
    await firestore.setDocument("agentStatus", source, {
      source,
      status: "FEHLER",
      message,
      lastAttemptAt: now,
      lastErrorAt: now,
      errorStatus: error?.status ?? null,
      errorRequestPath: error?.requestPath ?? null,
      rateLimit: error?.rateLimit ?? null,
      sourceDataProvider: dataProvider,
      updatedAt: now,
    });
    await firestore.setDocument("imports", importId, {
      source,
      parser: "trading212_api_v1",
      status: "FEHLER",
      message,
      errorStatus: error?.status ?? null,
      errorRequestPath: error?.requestPath ?? null,
      rateLimit: error?.rateLimit ?? null,
      runId,
      updatedAt: now,
    });
  }
  console.error(`[error] Trading 212 API konnte nicht gelesen werden: ${message}`);
  process.exit(1);
}
