import "dotenv/config";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { fetchChfToEurRate, fetchSixSwissQuote } from "./quote-provider-six.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const writeHistoryEnabled =
  process.argv.includes("--write-history") ||
  ["1", "true", "yes"].includes(String(process.env.QUOTE_WRITE_HISTORY ?? "").toLowerCase());
const seedManualInput = process.argv.includes("--seed-manual");
const historyTimeZone = process.env.FINANZTOOL_TIME_ZONE ?? "Europe/Vienna";

const SOURCE_ID = "equateplus";
const POSITION_ID = "equateplus_novartis";
const INSTRUMENT_ID = "isin_CH0012005267";
const ISIN = "CH0012005267";
const PROVIDER_SYMBOL = "CH0012005267CHF4";
const INSTRUMENT_NAME = "Novartis";

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseMaybeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

function roundNumber(value, digits = 6) {
  if (typeof value !== "number") return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function historyDateId(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: historyTimeZone }).format(date);
}

function historyBucketId(date = new Date(), intervalMinutes = 5) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: historyTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const minute = Math.floor(Number(parts.minute ?? "0") / intervalMinutes) * intervalMinutes;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}-${String(minute).padStart(2, "0")}`;
}

function manualInputFromArgs() {
  const quantity = parseMaybeNumber(readArg("--quantity"));
  const entryValueEur = parseMaybeNumber(readArg("--entry-value-eur"));
  if (typeof quantity !== "number" || quantity <= 0) {
    throw new Error("--quantity muss eine positive Zahl sein");
  }
  if (typeof entryValueEur !== "number" || entryValueEur <= 0) {
    throw new Error("--entry-value-eur muss eine positive Zahl sein");
  }
  return {
    source: SOURCE_ID,
    instrumentId: "novartis",
    isin: ISIN,
    name: INSTRUMENT_NAME,
    quantity,
    entryValueEur,
    entryValueCurrency: "EUR",
    discountPct: 0.15,
    updatedBy: "automation",
    updatedAt: new Date(),
  };
}

async function loadManualInput(firestore) {
  const inputs = await firestore.listDocuments("manualInputs");
  return inputs.find((input) => input.id === POSITION_ID) ?? null;
}

function validManualInput(input) {
  const quantity = parseMaybeNumber(input?.quantity);
  const entryValueEur = parseMaybeNumber(input?.entryValueEur);
  if (typeof quantity !== "number" || quantity <= 0) return null;
  if (typeof entryValueEur !== "number" || entryValueEur <= 0) return null;
  return {
    ...input,
    quantity,
    entryValueEur,
  };
}

function sourceSummaryChanged(existingSummary, nextSummary) {
  const fields = ["currentValue", "depotValue", "netValue", "costValue", "performanceValue", "performancePct"];
  return fields.some((field) => parseMaybeNumber(existingSummary?.[field]) !== parseMaybeNumber(nextSummary[field]));
}

async function main() {
  const firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  const now = new Date();

  if (seedManualInput) {
    if (!writeEnabled) throw new Error("--seed-manual braucht --write");
    await firestore.deleteDocument("manualInputs", POSITION_ID).catch(() => undefined);
    await firestore.setDocument("manualInputs", POSITION_ID, manualInputFromArgs());
  }

  const [manualInputRaw, summaries] = await Promise.all([
    loadManualInput(firestore),
    firestore.listDocuments("sourceSummaries"),
  ]);
  const manualInput = validManualInput(manualInputRaw);
  if (!manualInput) {
    const message = "EquatePlus: manuelle Novartis-Eingabe fehlt";
    if (writeEnabled) {
      await firestore.setDocument("agentStatus", SOURCE_ID, {
        source: SOURCE_ID,
        status: "WARNUNG",
        message,
        lastAgentRunAt: now,
        updatedAt: now,
      });
    }
    console.log(JSON.stringify({ mode: writeEnabled ? "write" : "dry-run", status: "WARNUNG", message }, null, 2));
    return;
  }

  const [quote, fx] = await Promise.all([
    fetchSixSwissQuote({ valorId: PROVIDER_SYMBOL, isin: ISIN, name: INSTRUMENT_NAME }),
    fetchChfToEurRate(),
  ]);
  const quantity = manualInput.quantity;
  const entryValueEur = manualInput.entryValueEur;
  const quotePriceChf = quote.price;
  const quotePriceEur = quotePriceChf * fx.rate;
  const entryPriceEur = entryValueEur / quantity;
  const entryPriceChf = entryPriceEur / fx.rate;
  const currentValueChf = roundCurrency(quantity * quotePriceChf);
  const costValueChf = roundCurrency(entryValueEur / fx.rate);
  const currentValue = roundCurrency(currentValueChf * fx.rate);
  const costValue = roundCurrency(entryValueEur);
  const performanceValue = roundCurrency(currentValue - costValue);
  const performancePct = costValue ? performanceValue / costValue : null;
  const previousClosePriceEur =
    typeof quote.previousClose === "number" ? quote.previousClose * fx.rate : null;
  const previousCloseValue =
    typeof quote.previousClose === "number" ? roundCurrency(quantity * quote.previousClose * fx.rate) : null;
  const dayChangeValue =
    typeof quote.closingDelta === "number" ? roundCurrency(quantity * quote.closingDelta * fx.rate) : null;
  const dayChangePct =
    typeof quote.closingPerformancePct === "number"
      ? quote.closingPerformancePct
      : previousCloseValue && typeof dayChangeValue === "number"
        ? dayChangeValue / previousCloseValue
        : null;
  const quoteText = `${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(quotePriceChf)} CHF`;
  const manualUpdatedAt = manualInput.updatedAt ?? now;
  const existingSummary = summaries.find((summary) => summary.id === SOURCE_ID) ?? {};
  const nextSummaryBase = {
    source: SOURCE_ID,
    displayName: "EquatePlus",
    currentValue,
    depotValue: currentValue,
    netValue: currentValue,
    cashValue: 0,
    costValue,
    performanceValue,
    performancePct,
    positionCount: 1,
    securityPositionCount: 1,
    valuationDate: quote.asOf,
    valuationMethod: "manual_equateplus_input_with_six_quote_v1",
    sourceDataProvider: "manual_equateplus_input",
    sourceDataUpdatedAt: manualUpdatedAt,
    quoteDataProvider: "six_swiss_exchange",
    quoteDataUpdatedAt: quote.asOf,
    quoteUpdatedAt: now,
    latestQuoteAsOf: quote.asOf,
    oldestQuoteAsOf: quote.asOf,
    quoteFreshness: "DELAYED",
    lastAgentRunAt: now,
    lastAgentSuccessAt: now,
    updatedAt: now,
    status: "OK",
  };
  const nextSummary = {
    ...nextSummaryBase,
    lastDataChangeAt: sourceSummaryChanged(existingSummary, nextSummaryBase)
      ? now
      : existingSummary.lastDataChangeAt ?? manualUpdatedAt,
  };

  const position = {
    source: SOURCE_ID,
    name: "Novartis",
    displayName: "Novartis",
    category: "Employee Share Purchase Plan",
    accountId: "employee_share_purchase_plan",
    portfolioLabel: "Employee Share Purchase Plan",
    isin: ISIN,
    quantity: roundNumber(quantity, 5),
    quantityText: `${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 5 }).format(quantity)} Stk.`,
    currentValue,
    currentValueChf,
    costValue,
    costValueChf,
    costCurrency: "EUR",
    entryPriceChf,
    entryPriceEur: roundCurrency(entryPriceEur),
    entryValueEur,
    discountPct: manualInput.discountPct ?? 0.15,
    quoteText,
    quotePrice: quotePriceChf,
    quoteCurrency: "CHF",
    quotePriceEur: roundCurrency(quotePriceEur),
    quoteProvider: "six_swiss_exchange",
    quoteProviderSymbol: PROVIDER_SYMBOL,
    quoteAsOf: quote.asOf,
    quoteStatus: "OK",
    quoteUpdatedAt: now,
    quoteFetchedAt: now,
    priceSource: "six_swiss_exchange",
    priceSourceUrl: quote.sourceUrl,
    quoteVenue: quote.quoteVenue,
    exchangeMic: quote.mic,
    fxRateToEur: fx.rate,
    fxPair: fx.pair,
    fxProvider: fx.provider,
    fxDate: fx.date,
    previousClosePrice: quote.previousClose,
    previousClosePriceEur: typeof previousClosePriceEur === "number" ? roundCurrency(previousClosePriceEur) : null,
    previousCloseValue,
    dayChangeValue,
    dayChangePct,
    performanceValue,
    performancePct,
    accountValueIncluded: true,
    valuationDate: quote.asOf,
    valuationMethod: "manual_equateplus_input_with_six_quote_v1",
    manualInputUpdatedAt: manualUpdatedAt,
    sourceDataUpdatedAt: manualUpdatedAt,
    quoteDataUpdatedAt: quote.asOf,
    updatedAt: now,
  };

  if (writeEnabled) {
    await firestore.setDocument("sourcePositions", POSITION_ID, position);
    await firestore.setDocument("sourceSummaries", SOURCE_ID, nextSummary);
    await firestore.setDocument("quotesCurrent", INSTRUMENT_ID, {
      instrumentId: INSTRUMENT_ID,
      isin: ISIN,
      name: INSTRUMENT_NAME,
      provider: "six_swiss_exchange",
      providerSymbol: PROVIDER_SYMBOL,
      price: quotePriceChf,
      currency: "CHF",
      fxRateToEur: fx.rate,
      fxPair: fx.pair,
      fxProvider: fx.provider,
      priceEur: roundCurrency(quotePriceEur),
      asOf: quote.asOf,
      delayedDateTime: quote.delayedDateTime,
      delayMinutes: quote.delayMinutes,
      previousClose: quote.previousClose,
      closingDelta: quote.closingDelta,
      closingPerformancePct: quote.closingPerformancePct,
      mic: quote.mic,
      quoteVenue: quote.quoteVenue,
      sourceUrl: quote.sourceUrl,
      fetchedAt: now,
      status: "OK",
      updatedAt: now,
    });
    if (writeHistoryEnabled) {
      await firestore.setDocument("priceHistory", `${INSTRUMENT_ID}_${historyBucketId(now)}`, {
        instrumentId: INSTRUMENT_ID,
        isin: ISIN,
        name: INSTRUMENT_NAME,
        provider: "six_swiss_exchange",
        providerSymbol: PROVIDER_SYMBOL,
        price: quotePriceChf,
        currency: "CHF",
        fxRateToEur: fx.rate,
        fxPair: fx.pair,
        priceEur: roundCurrency(quotePriceEur),
        currentValue,
        currentValueChf,
        asOf: quote.asOf,
        historyDate: historyDateId(now),
        historyBucket: historyBucketId(now),
        historyInterval: "5m",
        mic: quote.mic,
        quoteVenue: quote.quoteVenue,
        fetchedAt: now,
        sourceUrl: quote.sourceUrl,
        status: "OK",
        positionIds: [POSITION_ID],
        sources: [SOURCE_ID],
        updatedAt: now,
      });
    }
    await firestore.setDocument("agentStatus", SOURCE_ID, {
      source: SOURCE_ID,
      status: "OK",
      message: `EquatePlus bewertet: ${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 5 }).format(quantity)} Novartis-Aktien, Kurs ${quoteText} via SIX`,
      lastAgentRunAt: now,
      lastAgentSuccessAt: now,
      lastSuccessAt: now,
      updatedAt: now,
    });
  }

  console.log(JSON.stringify({
    mode: writeEnabled ? "write" : "dry-run",
    writeHistory: writeHistoryEnabled,
    status: "OK",
    quantity,
    entryValueEur,
    quotePriceChf,
    fxRateToEur: fx.rate,
    currentValue,
    costValue,
    performanceValue,
    performancePct,
  }, null, 2));
}

await main();
