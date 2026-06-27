const SIX_BASE_URL = "https://www.six-group.com";
const NOVARTIS_VALOR_ID = "CH0012005267CHF4";
const DEFAULT_SELECT_FIELDS = [
  "AskPrice",
  "BidPrice",
  "ClosingDelta",
  "ClosingPerformance",
  "ClosingPrice",
  "DailyHighPrice",
  "DailyLowPrice",
  "MarketTime",
  "OpeningPrice",
  "PreviousClosingPrice",
  "TotalVolume",
  "YearToDatePerformance",
];

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

function rowToObject(json) {
  const columns = json?.colNames ?? [];
  const row = json?.rowData?.[0] ?? [];
  return Object.fromEntries(columns.map((column, index) => [column, row[index]]));
}

export function sixShareDetailsUrl(valorId = NOVARTIS_VALOR_ID) {
  return `${SIX_BASE_URL}/en/market-data/shares/share-explorer/share-details.${valorId}.html`;
}

export async function fetchSixSwissQuote({
  valorId = NOVARTIS_VALOR_ID,
  isin = "CH0012005267",
  name = "Novartis",
} = {}) {
  const url = new URL(`${SIX_BASE_URL}/fqs/movie.json`);
  url.searchParams.set("select", DEFAULT_SELECT_FIELDS.join(","));
  url.searchParams.set("where", `ValorId=${valorId}`);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "finanztool/0.1 quote-sync",
    },
  });
  if (!response.ok) {
    throw new Error(`SIX Quote HTTP ${response.status}`);
  }

  const json = await response.json();
  const row = rowToObject(json);
  const price = parseMaybeNumber(row.ClosingPrice);
  if (typeof price !== "number") {
    throw new Error("SIX Quote ohne ClosingPrice");
  }

  const delayedMillis = parseMaybeNumber(json.delayedMillis);
  const asOf = typeof delayedMillis === "number" ? new Date(delayedMillis).toISOString() : new Date().toISOString();
  return {
    status: "OK",
    provider: "six_swiss_exchange",
    providerSymbol: valorId,
    isin,
    name,
    price,
    currency: "CHF",
    asOf,
    delayedDateTime: json.delayedDateTime ?? null,
    delayMinutes: parseMaybeNumber(json.delayMinutes),
    previousClose: parseMaybeNumber(row.PreviousClosingPrice),
    closingDelta: parseMaybeNumber(row.ClosingDelta),
    closingPerformancePct:
      typeof parseMaybeNumber(row.ClosingPerformance) === "number"
        ? parseMaybeNumber(row.ClosingPerformance) / 100
        : null,
    openingPrice: parseMaybeNumber(row.OpeningPrice),
    dailyHighPrice: parseMaybeNumber(row.DailyHighPrice),
    dailyLowPrice: parseMaybeNumber(row.DailyLowPrice),
    totalVolume: parseMaybeNumber(row.TotalVolume),
    marketTime: row.MarketTime ?? null,
    mic: "XSWX",
    quoteVenue: "SIX Swiss Exchange",
    sourceUrl: sixShareDetailsUrl(valorId),
    raw: row,
  };
}

export async function fetchChfToEurRate() {
  const response = await fetch("https://api.frankfurter.app/latest?from=CHF&to=EUR", {
    headers: {
      Accept: "application/json",
      "User-Agent": "finanztool/0.1 quote-sync",
    },
  });
  if (!response.ok) {
    throw new Error(`CHF/EUR HTTP ${response.status}`);
  }

  const json = await response.json();
  const rate = parseMaybeNumber(json?.rates?.EUR);
  if (typeof rate !== "number" || rate <= 0) {
    throw new Error("CHF/EUR Kurs nicht verfuegbar");
  }

  return {
    rate,
    pair: "CHF/EUR",
    provider: "frankfurter_ecb",
    date: json.date ?? null,
  };
}
