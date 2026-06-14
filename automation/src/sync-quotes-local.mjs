import "dotenv/config";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import {
  fetchBoerseFrankfurtQuote,
  mapIsinToBoerseFrankfurt,
} from "./quote-provider-boerse-frankfurt.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const remapEnabled = process.argv.includes("--remap");
const quoteProvider = process.env.QUOTE_PROVIDER ?? "boerse-frankfurt";
const maxInstruments = Number.parseInt(readArg("--max-instruments") ?? process.env.QUOTE_MAX_INSTRUMENTS ?? "0", 10);
const delayMs = Number.parseInt(readArg("--delay-ms") ?? process.env.QUOTE_DELAY_MS ?? "150", 10);
const quoteSources = new Set(
  (process.env.QUOTE_SOURCES ?? "flatex,traderepublic")
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean),
);

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function instrumentIdForIsin(isin) {
  return `isin_${String(isin).toUpperCase()}`;
}

function historyDateId(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function uniqueIsinPositions(positions) {
  return positions.filter(
    (position) =>
      quoteSources.has(position.source) &&
      position.isin &&
      typeof position.quantity === "number" &&
      position.accountValueIncluded !== false,
  );
}

function roundCurrency(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

function formatEstimatedQuantity(value) {
  return new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(value);
}

function parseMaybeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isStaleMapping(mapping) {
  return (
    remapEnabled ||
    !mapping?.providerSymbol ||
    mapping?.status !== "MAPPED" ||
    mapping?.source !== quoteProvider
  );
}

function sourceTotal(positions, source) {
  return roundCurrency(
    positions
      .filter((position) => position.source === source && position.accountValueIncluded !== false)
      .reduce((sum, position) => sum + (parseMaybeNumber(position.currentValue) ?? 0), 0),
  );
}

function isCashPosition(position) {
  return position.category === "Cash" || /cash|konto|kontostand/i.test(`${position.id ?? ""} ${position.name ?? ""}`);
}

function previousHistoryForInstrument(priceHistory, instrumentId, currentHistoryDate) {
  return priceHistory
    .filter((entry) => {
      const entryDate = String(entry.historyDate ?? "");
      return (
        entry.instrumentId === instrumentId &&
        entry.status === "OK" &&
        typeof parseMaybeNumber(entry.priceEur) === "number" &&
        entryDate &&
        entryDate < currentHistoryDate
      );
    })
    .sort((left, right) => String(right.historyDate ?? "").localeCompare(String(left.historyDate ?? "")))[0] ?? null;
}

function dayChangeForPosition({ position, currentValue, priceEur, previousPriceEur, preserveSourceValue }) {
  if (typeof previousPriceEur !== "number" || previousPriceEur <= 0) {
    return {
      previousCloseValue: null,
      dayChangeValue: null,
      dayChangePct: null,
    };
  }

  const quantity = parseMaybeNumber(position.quantity);
  if (typeof quantity !== "number" || quantity <= 0) {
    return {
      previousCloseValue: null,
      dayChangeValue: null,
      dayChangePct: null,
    };
  }

  const quoteBasedPreviousValue = roundCurrency(quantity * previousPriceEur);
  if (!preserveSourceValue) {
    const dayChangeValue = roundCurrency((currentValue ?? 0) - quoteBasedPreviousValue);
    return {
      previousCloseValue: quoteBasedPreviousValue,
      dayChangeValue,
      dayChangePct: quoteBasedPreviousValue ? dayChangeValue / quoteBasedPreviousValue : null,
    };
  }

  const quoteBasedDayChange = roundCurrency(quantity * (priceEur - previousPriceEur));
  const previousCloseValue =
    typeof currentValue === "number" ? roundCurrency(currentValue - quoteBasedDayChange) : quoteBasedPreviousValue;
  return {
    previousCloseValue,
    dayChangeValue: quoteBasedDayChange,
    dayChangePct: previousCloseValue ? quoteBasedDayChange / previousCloseValue : null,
  };
}

async function getOrCreateMapping({ firestore, isin, representative, existingMappings }) {
  const id = instrumentIdForIsin(isin);
  const existing = existingMappings.get(id);
  if (!isStaleMapping(existing)) return existing;

  const mapped = await mapIsinToBoerseFrankfurt(isin);
  const mapping = {
    id,
    instrumentId: id,
    isin,
    source: quoteProvider,
    status: mapped.status,
    providerSymbol: mapped.best?.providerSymbol ?? null,
    exchange: mapped.best?.exchange ?? null,
    code: mapped.best?.code ?? null,
    mic: mapped.best?.mic ?? null,
    wkn: mapped.best?.wkn ?? representative.wkn ?? null,
    slug: mapped.best?.slug ?? null,
    name: mapped.best?.name ?? representative.name ?? null,
    type: mapped.best?.type ?? null,
    currency: mapped.best?.currency ?? null,
    sourceUrl: mapped.best?.sourceUrl ?? null,
    mics: mapped.best?.mics ?? [],
    candidateCount: mapped.candidates.length,
    candidates: mapped.candidates.slice(0, 8),
    updatedAt: new Date(),
  };
  if (writeEnabled) {
    const { id: _id, ...data } = mapping;
    await firestore.setDocument("instrumentMappings", id, data);
  }
  return mapping;
}

async function writeInstrument(firestore, id, position, mapping, quote) {
  if (!writeEnabled) return;
  await firestore.setDocument("instruments", id, {
    instrumentId: id,
    isin: position.isin,
    name: mapping.name ?? position.name,
    type: mapping.type ?? position.category ?? null,
    primaryProvider: quoteProvider,
    primarySymbol: mapping.providerSymbol ?? null,
    exchange: mapping.exchange ?? null,
    mic: mapping.mic ?? null,
    sourceUrl: mapping.sourceUrl ?? null,
    currency: quote?.currency ?? mapping.currency ?? null,
    quoteStatus: quote?.status ?? mapping.status,
    updatedAt: new Date(),
  });
}

async function politeDelay() {
  if (Number.isFinite(delayMs) && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function main() {
  const firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  const now = new Date();
  const [allPositions, mappings, summaries, priceHistory] = await Promise.all([
    firestore.listDocuments("sourcePositions"),
    firestore.listDocuments("instrumentMappings"),
    firestore.listDocuments("sourceSummaries"),
    firestore.listDocuments("priceHistory"),
  ]);
  const existingMappings = new Map(mappings.map((mapping) => [mapping.id, mapping]));
  const positions = uniqueIsinPositions(allPositions);
  const grouped = new Map();
  for (const position of positions) {
    const isin = String(position.isin).toUpperCase();
    const group = grouped.get(isin) ?? [];
    group.push(position);
    grouped.set(isin, group);
  }

  const results = [];
  const updatedPositionsById = new Map(allPositions.map((position) => [position.id, position]));
  const fxCache = new Map();

  const groupedEntries =
    Number.isFinite(maxInstruments) && maxInstruments > 0
      ? [...grouped.entries()].slice(0, maxInstruments)
      : [...grouped.entries()];

  for (const [isin, group] of groupedEntries) {
    const representative = group[0];
    const instrumentId = instrumentIdForIsin(isin);
    const currentHistoryDate = historyDateId(now);
    const previousHistory = previousHistoryForInstrument(priceHistory, instrumentId, currentHistoryDate);
    const previousPriceEur = parseMaybeNumber(previousHistory?.priceEur);
    const mapping = await getOrCreateMapping({
      firestore,
      isin,
      representative,
      existingMappings,
    }).catch((error) => ({
      isin,
      source: quoteProvider,
      status: "MAPPING_ERROR",
      providerSymbol: null,
      error: error.message,
    }));

    if (!mapping.providerSymbol) {
      results.push({ isin, status: mapping.status ?? "MAPPING_REQUIRED", error: mapping.error, positions: group.length });
      for (const position of group) {
        const updated = {
          ...position,
          quoteStatus: mapping.status ?? "MAPPING_REQUIRED",
          quoteProvider,
          updatedAt: now,
        };
        updatedPositionsById.set(position.id, updated);
        if (writeEnabled) await firestore.setDocument("sourcePositions", position.id, updated);
      }
      continue;
    }

    await politeDelay();
    const quote = await fetchBoerseFrankfurtQuote(mapping.providerSymbol, mapping).catch((error) => ({
      status: "QUOTE_ERROR",
      error: error.message,
    }));
    if (quote.status !== "OK" || typeof quote.price !== "number") {
      results.push({ isin, providerSymbol: mapping.providerSymbol, status: quote.status, error: quote.error });
      continue;
    }

    const quoteCurrency = (quote.currency ?? mapping.currency ?? "EUR").toUpperCase();
    let fx = fxCache.get(quoteCurrency);
    if (!fx) fx = { rate: quoteCurrency === "EUR" ? 1 : null, pair: quoteCurrency };
    fxCache.set(quoteCurrency, fx);
    if (!fx.rate) {
      results.push({ isin, providerSymbol: mapping.providerSymbol, status: "FX_REQUIRED", currency: quoteCurrency });
      continue;
    }

    const priceEur = quote.price * fx.rate;
    if (writeEnabled) {
      await firestore.setDocument("quotesCurrent", instrumentId, {
        instrumentId,
        isin,
        provider: quoteProvider,
        providerSymbol: quote.providerSymbol ?? mapping.providerSymbol,
        price: quote.price,
        currency: quoteCurrency,
        fxRateToEur: fx.rate,
        fxPair: fx.pair,
        priceEur,
        asOf: quote.asOf,
        mic: quote.mic ?? mapping.mic ?? null,
        sourceUrl: quote.sourceUrl ?? mapping.sourceUrl ?? null,
        status: "OK",
        updatedAt: now,
      });
      await firestore.setDocument("priceHistory", `${instrumentId}_${historyDateId(now)}`, {
        instrumentId,
        isin,
        name: mapping.name ?? representative.name ?? null,
        provider: quoteProvider,
        providerSymbol: quote.providerSymbol ?? mapping.providerSymbol,
        price: quote.price,
        currency: quoteCurrency,
        fxRateToEur: fx.rate,
        fxPair: fx.pair,
        priceEur,
        asOf: quote.asOf,
        historyDate: historyDateId(now),
        mic: quote.mic ?? mapping.mic ?? null,
        sourceUrl: quote.sourceUrl ?? mapping.sourceUrl ?? null,
        status: "OK",
        positionIds: group.map((position) => position.id),
        sources: [...new Set(group.map((position) => position.source))],
        updatedAt: now,
      });
    }
    await writeInstrument(firestore, instrumentId, representative, mapping, quote);

    for (const position of group) {
      const preserveSourceValue = position.source === "ginmon";
      const currentValue = preserveSourceValue
        ? parseMaybeNumber(position.currentValue)
        : roundCurrency(position.quantity * priceEur);
      const estimatedQuantity =
        preserveSourceValue &&
        typeof position.quantity !== "number" &&
        typeof currentValue === "number" &&
        Number.isFinite(priceEur) &&
        priceEur > 0
          ? currentValue / priceEur
          : null;
      const costValue = parseMaybeNumber(position.costValue);
      const performanceValue =
        typeof costValue === "number" ? roundCurrency(currentValue - costValue) : position.performanceValue ?? null;
      const dayChange = dayChangeForPosition({
        position,
        currentValue,
        priceEur,
        previousPriceEur,
        preserveSourceValue,
      });
      const updated = {
        ...position,
        name:
          /^ISIN\s+[A-Z]{2}[A-Z0-9]{10}$/i.test(String(position.name ?? "")) && mapping.name
            ? mapping.name
            : position.name,
        currentValue,
        costValue,
        quantity: typeof position.quantity === "number" ? position.quantity : estimatedQuantity ?? position.quantity ?? null,
        quantityText:
          position.quantityText ??
          (estimatedQuantity === null ? null : `ca. ${formatEstimatedQuantity(estimatedQuantity)} Stk.`),
        quantityEstimated: estimatedQuantity !== null || position.quantityEstimated === true,
        quoteText: `${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(quote.price)} ${quoteCurrency}`,
        quotePrice: quote.price,
        quoteCurrency,
        quotePriceEur: priceEur,
        quoteProvider,
        quoteProviderSymbol: quote.providerSymbol ?? mapping.providerSymbol,
        quoteAsOf: quote.asOf,
        quoteStatus: "OK",
        quoteUpdatedAt: now,
        valuationDate: preserveSourceValue ? position.valuationDate : quote.asOf,
        valuationMethod: preserveSourceValue ? position.valuationMethod : `${quoteProvider}_quote_v1`,
        performanceValue,
        performancePct: costValue ? performanceValue / costValue : position.performancePct ?? null,
        previousCloseValue: dayChange.previousCloseValue,
        dayChangeValue: dayChange.dayChangeValue,
        dayChangePct: dayChange.dayChangePct,
        updatedAt: now,
      };
      updatedPositionsById.set(position.id, updated);
      if (writeEnabled) await firestore.setDocument("sourcePositions", position.id, updated);
    }

    results.push({
      isin,
      providerSymbol: quote.providerSymbol ?? mapping.providerSymbol,
      status: "OK",
      price: quote.price,
      currency: quoteCurrency,
      priceEur,
      positions: group.length,
    });
  }

  const updatedPositions = [...updatedPositionsById.values()];
  const touchedSources = [...new Set(positions.map((position) => position.source))];
  for (const source of touchedSources) {
    const existingSummary = summaries.find((summary) => summary.id === source) ?? {};
    if (source === "ginmon") continue;
    const sourcePositions = updatedPositions.filter(
      (position) => position.source === source && position.accountValueIncluded !== false,
    );
    const total = sourceTotal(updatedPositions, source);
    const cashValue = roundCurrency(
      sourcePositions
        .filter(isCashPosition)
        .reduce((sum, position) => sum + (parseMaybeNumber(position.currentValue) ?? 0), 0),
    );
    const securityValue = roundCurrency(total - cashValue);
    const hasCash = sourcePositions.some(isCashPosition);
    if (writeEnabled) {
      const { id: _id, ...existingData } = existingSummary;
      await firestore.setDocument("sourceSummaries", source, {
        ...existingData,
        source,
        currentValue: hasCash ? securityValue : total,
        depotValue: hasCash ? securityValue : existingData.depotValue ?? null,
        cashValue: hasCash ? cashValue : existingData.cashValue ?? null,
        netValue: total,
        positionCount: sourcePositions.length,
        valuationMethod: `position_sum_with_${quoteProvider}_quotes_v1`,
        updatedAt: now,
      });
    }
  }

  const summary = {
    mode: writeEnabled ? "write" : "dry-run",
    quoteProvider,
    sourceFilter: [...quoteSources],
    instrumentCount: grouped.size,
    processedInstrumentCount: groupedEntries.length,
    maxInstruments: Number.isFinite(maxInstruments) && maxInstruments > 0 ? maxInstruments : "all",
    positionCount: positions.length,
    okCount: results.filter((result) => result.status === "OK").length,
    mappingRequiredCount: results.filter((result) => result.status === "MAPPING_REQUIRED").length,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!writeEnabled) console.log("[dry-run] Keine Firestore-Daten geaendert. Fuer Schreiben --write verwenden.");
}

await main();
