import "dotenv/config";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import {
  fetchBoerseFrankfurtQuote,
  mapIsinToBoerseFrankfurt,
} from "./quote-provider-boerse-frankfurt.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const writeHistoryEnabled =
  process.argv.includes("--write-history") ||
  ["1", "true", "yes"].includes(String(process.env.QUOTE_WRITE_HISTORY ?? "").toLowerCase());
const remapEnabled = process.argv.includes("--remap");
const quoteProvider = process.env.QUOTE_PROVIDER ?? "boerse-frankfurt";
const historyTimeZone = process.env.FINANZTOOL_TIME_ZONE ?? "Europe/Vienna";
const maxInstruments = Number.parseInt(readArg("--max-instruments") ?? process.env.QUOTE_MAX_INSTRUMENTS ?? "0", 10);
const delayMs = Number.parseInt(readArg("--delay-ms") ?? process.env.QUOTE_DELAY_MS ?? "150", 10);
const quoteSources = new Set(
  (process.env.QUOTE_SOURCES ?? "traderepublic")
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
  return new Intl.DateTimeFormat("en-CA", { timeZone: historyTimeZone }).format(date);
}

function isDocumentValuedPosition(position) {
  if (position.source !== "traderepublic") return false;
  const text = `${position.accountType ?? ""} ${position.accountId ?? ""} ${position.category ?? ""} ${position.valuationMethod ?? ""}`;
  return /private markets|private_fund|traderepublic_net_worth/i.test(text);
}

function uniqueIsinPositions(positions) {
  return positions.filter(
    (position) =>
      quoteSources.has(position.source) &&
      position.isin &&
      typeof position.quantity === "number" &&
      position.accountValueIncluded !== false &&
      !isDocumentValuedPosition(position)
  );
}

function roundCurrency(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

function minutesBetween(later, earlier) {
  if (!(later instanceof Date) || !(earlier instanceof Date)) return null;
  if (Number.isNaN(later.getTime()) || Number.isNaN(earlier.getTime())) return null;
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 60000));
}

function quoteFreshnessFor(quote, now = new Date()) {
  const asOf = quote?.asOf ? new Date(quote.asOf) : null;
  const ageMinutes = asOf ? minutesBetween(now, asOf) : null;
  let freshness = "UNKNOWN";
  if (typeof ageMinutes === "number") {
    if (ageMinutes <= 20) freshness = "FRESH";
    else if (ageMinutes <= 120) freshness = "DELAYED";
    else freshness = "STALE";
  }
  return { quoteAgeMinutes: ageMinutes, quoteFreshness: freshness };
}

function normalizeExchangeText(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function preferredMicsForPosition(position) {
  const values = [
    position.quoteVenue,
    position.quoteVenueMic,
    position.exchangeMic,
    position.exchange,
    position.tradingVenue,
    position.market,
  ]
    .map(normalizeExchangeText)
    .filter(Boolean);
  const mics = [];
  for (const value of values) {
    if (/^[A-Z0-9]{4}$/.test(value)) mics.push(value);
    if (value.includes("XETRA")) mics.push("XETR");
    if (value.includes("FRANKFURT") || value.includes("BOERSE FRANKFURT") || value === "FRA") mics.push("XFRA");
    if (value.includes("TRADEGATE")) mics.push("XGAT");
    if (value.includes("STUTTGART")) mics.push("XSTU");
    if (value.includes("MUENCHEN") || value.includes("MÜNCHEN")) mics.push("XMUN");
    if (value.includes("BERLIN")) mics.push("XBER");
    if (value.includes("DUSSELDORF") || value.includes("DÜSSELDORF")) mics.push("XDUS");
    if (value.includes("HAMBURG")) mics.push("XHAM");
    if (value.includes("HANNOVER")) mics.push("XHAN");
  }
  return [...new Set(mics)];
}

function preferredMicsForGroup(group) {
  return [...new Set(group.flatMap(preferredMicsForPosition))];
}

function sourceQuoteMeta(positions, source) {
  const quotePositions = positions.filter(
    (position) =>
      position.source === source &&
      position.accountValueIncluded !== false &&
      !isDocumentValuedPosition(position) &&
      (position.isin || position.quoteProvider),
  );
  const asOfDates = quotePositions
    .map((position) => position.quoteAsOf)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());
  const freshnessRank = { UNKNOWN: 0, FRESH: 1, DELAYED: 2, STALE: 3 };
  const worstFreshness =
    quotePositions
      .map((position) => String(position.quoteFreshness ?? "UNKNOWN"))
      .sort((left, right) => (freshnessRank[right] ?? 0) - (freshnessRank[left] ?? 0))[0] ?? null;
  return {
    oldestQuoteAsOf: asOfDates[0]?.toISOString() ?? null,
    latestQuoteAsOf: asOfDates.at(-1)?.toISOString() ?? null,
    quoteFreshness: worstFreshness,
  };
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

function sourceExternalQuoteSummary(positions, source) {
  const quotePositions = positions.filter(
    (position) =>
      position.source === source &&
      position.accountValueIncluded !== false &&
      !isCashPosition(position) &&
      !isDocumentValuedPosition(position),
  );
  const values = quotePositions
    .map((position) => parseMaybeNumber(position.externalQuoteValue))
    .filter((value) => typeof value === "number");
  const externalQuoteTotal =
    values.length > 0 && values.length === quotePositions.length
      ? roundCurrency(values.reduce((sum, value) => sum + value, 0))
      : null;
  return {
    externalQuoteTotal,
    externalQuoteCoverageCount: values.length,
    externalQuoteExpectedCount: quotePositions.length,
  };
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
    const quoteMapping = {
      ...mapping,
      preferredMics: preferredMicsForGroup(group),
    };
    const quote = await fetchBoerseFrankfurtQuote(mapping.providerSymbol, quoteMapping).catch((error) => ({
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
    const quoteFreshness = quoteFreshnessFor(quote, now);
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
        quoteVenue: quote.mic ?? mapping.mic ?? null,
        fetchedAt: now,
        quoteAgeMinutes: quoteFreshness.quoteAgeMinutes,
        quoteFreshness: quoteFreshness.quoteFreshness,
        sourceUrl: quote.sourceUrl ?? mapping.sourceUrl ?? null,
        status: "OK",
        updatedAt: now,
      });
      if (writeHistoryEnabled) await firestore.setDocument("priceHistory", `${instrumentId}_${historyDateId(now)}`, {
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
        quoteVenue: quote.mic ?? mapping.mic ?? null,
        fetchedAt: now,
        quoteAgeMinutes: quoteFreshness.quoteAgeMinutes,
        quoteFreshness: quoteFreshness.quoteFreshness,
        sourceUrl: quote.sourceUrl ?? mapping.sourceUrl ?? null,
        status: "OK",
        positionIds: group.map((position) => position.id),
        sources: [...new Set(group.map((position) => position.source))],
        updatedAt: now,
      });
    }
    await writeInstrument(firestore, instrumentId, representative, mapping, quote);

    for (const position of group) {
      const preserveSourceValue =
        position.source === "ginmon" ||
        position.source === "traderepublic" ||
        position.valuationMethod === "flatex_broker_snapshot_v1";
      const preserveTradeRepublicPrimary = position.source === "traderepublic";
      const currentValue = preserveSourceValue
        ? parseMaybeNumber(position.currentValue)
        : roundCurrency(position.quantity * priceEur);
      const quoteBasedCurrentValue = roundCurrency(position.quantity * priceEur);
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
        typeof costValue === "number" && typeof currentValue === "number"
          ? roundCurrency(currentValue - costValue)
          : position.performanceValue ?? null;
      const dayChange = dayChangeForPosition({
        position,
        currentValue,
        priceEur,
        previousPriceEur,
        preserveSourceValue,
      });
      const preserveBrokerDayChange =
        position.valuationMethod === "flatex_broker_snapshot_v1" &&
        typeof parseMaybeNumber(position.dayChangeValue) === "number";
      const preservedDayChangeValue = parseMaybeNumber(position.dayChangeValue);
      const preservedDayChangePct = parseMaybeNumber(position.dayChangePct);
      const preservedPreviousCloseValue =
        parseMaybeNumber(position.previousCloseValue) ??
        (typeof currentValue === "number" && typeof preservedDayChangeValue === "number"
          ? roundCurrency(currentValue - preservedDayChangeValue)
          : null);
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
        quoteText: preserveTradeRepublicPrimary
          ? position.quoteText ?? null
          : `${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(quote.price)} ${quoteCurrency}`,
        quotePrice: preserveTradeRepublicPrimary ? position.quotePrice ?? null : quote.price,
        quoteCurrency: preserveTradeRepublicPrimary ? position.quoteCurrency ?? null : quoteCurrency,
        quotePriceEur: preserveTradeRepublicPrimary ? position.quotePriceEur ?? null : priceEur,
        quoteProvider: preserveTradeRepublicPrimary
          ? position.quoteProvider ?? position.brokerQuoteProvider ?? "traderepublic_portal_web"
          : quoteProvider,
        quoteProviderSymbol: preserveTradeRepublicPrimary ? position.quoteProviderSymbol ?? null : quote.providerSymbol ?? mapping.providerSymbol,
        quoteAsOf: preserveTradeRepublicPrimary ? position.quoteAsOf ?? position.brokerQuoteAsOf ?? null : quote.asOf,
        quoteStatus: preserveTradeRepublicPrimary ? position.quoteStatus ?? "OK" : "OK",
        quoteUpdatedAt: preserveTradeRepublicPrimary ? position.quoteUpdatedAt ?? position.updatedAt ?? now : now,
        quoteFetchedAt: preserveTradeRepublicPrimary ? position.quoteFetchedAt ?? position.updatedAt ?? now : now,
        priceSource: preserveTradeRepublicPrimary ? position.priceSource ?? "Trade Republic Web-Portal" : quoteProvider,
        priceSourceUrl: preserveTradeRepublicPrimary ? position.priceSourceUrl ?? null : quote.sourceUrl ?? mapping.sourceUrl ?? null,
        quoteVenue: preserveTradeRepublicPrimary ? position.quoteVenue ?? null : quote.mic ?? mapping.mic ?? null,
        quoteAgeMinutes: preserveTradeRepublicPrimary ? position.quoteAgeMinutes ?? null : quoteFreshness.quoteAgeMinutes,
        quoteFreshness: preserveTradeRepublicPrimary ? position.quoteFreshness ?? null : quoteFreshness.quoteFreshness,
        externalQuoteValue: quoteBasedCurrentValue,
        externalQuoteDifference:
          typeof currentValue === "number" ? roundCurrency(quoteBasedCurrentValue - currentValue) : null,
        externalQuoteProvider: quoteProvider,
        externalQuoteProviderSymbol: quote.providerSymbol ?? mapping.providerSymbol,
        externalQuotePrice: quote.price,
        externalQuoteCurrency: quoteCurrency,
        externalQuotePriceEur: priceEur,
        externalQuoteAsOf: quote.asOf,
        externalQuoteUpdatedAt: now,
        externalQuoteVenue: quote.mic ?? mapping.mic ?? null,
        valuationDate: preserveSourceValue ? position.valuationDate : quote.asOf,
        valuationMethod: preserveSourceValue ? position.valuationMethod : `${quoteProvider}_quote_v1`,
        performanceValue,
        performancePct:
          costValue && typeof performanceValue === "number"
            ? performanceValue / costValue
            : position.performancePct ?? null,
        previousCloseValue: preserveBrokerDayChange ? preservedPreviousCloseValue : dayChange.previousCloseValue,
        dayChangeValue: preserveBrokerDayChange ? preservedDayChangeValue : dayChange.dayChangeValue,
        dayChangePct: preserveBrokerDayChange ? preservedDayChangePct : dayChange.dayChangePct,
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
    const externalQuote = sourceExternalQuoteSummary(sourcePositions, source);
    const quoteMeta = sourceQuoteMeta(updatedPositions, source);
    const cashValue = roundCurrency(
      sourcePositions
        .filter(isCashPosition)
        .reduce((sum, position) => sum + (parseMaybeNumber(position.currentValue) ?? 0), 0),
    );
    const securityValue = roundCurrency(total - cashValue);
    const securityPositions = sourcePositions.filter((position) => !isCashPosition(position));
    const positionCostValues = securityPositions
      .map((position) => parseMaybeNumber(position.costValue))
      .filter((value) => typeof value === "number");
    const costValue =
      positionCostValues.length === securityPositions.length
        ? roundCurrency(positionCostValues.reduce((sum, value) => sum + value, 0))
        : existingSummary.costValue ?? null;
    const performanceValue =
      typeof costValue === "number" ? roundCurrency(securityValue - costValue) : existingSummary.performanceValue ?? null;
    const hasCash = sourcePositions.some(isCashPosition);
    const preservePrimaryQuoteMeta = source === "traderepublic";
    const externalQuoteComparisonValue =
      source === "traderepublic"
        ? parseMaybeNumber(existingSummary.brokerageValue) ??
          roundCurrency(securityValue - (parseMaybeNumber(existingSummary.privateMarketsValue) ?? 0))
        : securityValue;
    if (writeEnabled) {
      const { id: _id, ...existingData } = existingSummary;
      await firestore.setDocument("sourceSummaries", source, {
        ...existingData,
        source,
        currentValue: total,
        depotValue: hasCash ? securityValue : existingData.depotValue ?? null,
        cashValue: hasCash ? cashValue : existingData.cashValue ?? null,
        netValue: total,
        costValue,
        performanceValue,
        performancePct:
          costValue && typeof performanceValue === "number" ? performanceValue / costValue : existingData.performancePct ?? null,
        costCoverageCount: positionCostValues.length,
        costExpectedCount: securityPositions.length,
        externalQuoteDepotValue: externalQuote.externalQuoteTotal,
        externalQuoteDifference:
          typeof externalQuote.externalQuoteTotal === "number" && typeof externalQuoteComparisonValue === "number"
            ? roundCurrency(externalQuote.externalQuoteTotal - externalQuoteComparisonValue)
            : null,
        externalQuoteCoverageCount: externalQuote.externalQuoteCoverageCount,
        externalQuoteExpectedCount: externalQuote.externalQuoteExpectedCount,
        latestQuoteAsOf: quoteMeta.latestQuoteAsOf,
        oldestQuoteAsOf: quoteMeta.oldestQuoteAsOf,
        quoteFreshness: quoteMeta.quoteFreshness,
        quoteUpdatedAt: now,
        quoteDataProvider: preservePrimaryQuoteMeta ? existingData.quoteDataProvider ?? quoteProvider : quoteProvider,
        quoteDataUpdatedAt: preservePrimaryQuoteMeta ? existingData.quoteDataUpdatedAt ?? now : now,
        externalQuoteDataProvider: quoteProvider,
        externalQuoteDataUpdatedAt: now,
        positionCount: sourcePositions.length,
        securityPositionCount: securityPositions.length,
        valuationMethod:
          source === "traderepublic"
            ? "traderepublic_portal_web_with_external_quotes_v1"
            : source === "flatex" && existingData.valuationMethod === "flatex_broker_snapshot_v1"
            ? "flatex_broker_snapshot_with_market_quotes_v1"
            : `position_sum_with_${quoteProvider}_quotes_v1`,
        updatedAt: now,
      });
    }
  }

  const summary = {
    mode: writeEnabled ? "write" : "dry-run",
    writeHistory: writeHistoryEnabled,
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
