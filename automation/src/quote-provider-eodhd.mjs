import { requireLocalSecret } from "./local-secret.mjs";

const EODHD_API_KEY_SERVICE = "finanztool-eodhd-api-key";
const EODHD_BASE_URL = "https://eodhd.com/api";

const exchangePriority = [
  "XETRA",
  "F",
  "STU",
  "MU",
  "HM",
  "DU",
  "BE",
  "VI",
  "SW",
  "PA",
  "AS",
  "LSE",
  "US",
];

function apiUrl(path, apiToken, params = {}) {
  const url = new URL(`${EODHD_BASE_URL}${path}`);
  url.searchParams.set("api_token", apiToken);
  url.searchParams.set("fmt", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "finanztool-quote-agent/0.1" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`EODHD HTTP ${response.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`EODHD Antwort ist kein JSON: ${text.slice(0, 300)}`);
  }
}

function normalizeCandidate(candidate) {
  const code = candidate.Code ?? candidate.code ?? candidate.Symbol ?? candidate.symbol ?? null;
  const exchange = candidate.Exchange ?? candidate.exchange ?? candidate.ExchangeCode ?? candidate.exchangeCode ?? null;
  const ticker = candidate.Ticker ?? candidate.ticker ?? null;
  const providerSymbol =
    ticker && String(ticker).includes(".")
      ? ticker
      : code && exchange
        ? `${code}.${exchange}`
        : code;
  return {
    provider: "eodhd",
    providerSymbol,
    code,
    exchange,
    name: candidate.Name ?? candidate.name ?? null,
    type: candidate.Type ?? candidate.type ?? null,
    isin: candidate.ISIN ?? candidate.isin ?? null,
    currency: candidate.Currency ?? candidate.currency ?? null,
    country: candidate.Country ?? candidate.country ?? null,
    raw: candidate,
  };
}

function candidateScore(candidate) {
  let score = 0;
  const exchangeIndex = exchangePriority.indexOf(candidate.exchange);
  if (exchangeIndex !== -1) score += 100 - exchangeIndex;
  if (candidate.currency === "EUR") score += 40;
  if (/etf|fund/i.test(candidate.type ?? "")) score += 10;
  if (candidate.providerSymbol) score += 5;
  return score;
}

function chooseBestCandidate(candidates) {
  const normalized = candidates.map(normalizeCandidate).filter((candidate) => candidate.providerSymbol);
  return normalized.sort((left, right) => candidateScore(right) - candidateScore(left))[0] ?? null;
}

function quotePrice(quote) {
  for (const key of ["close", "price", "last", "last_price", "previousClose"]) {
    const value = Number(quote?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function quoteTimestamp(quote) {
  const timestamp = Number(quote?.timestamp ?? quote?.gmtoffset);
  if (Number.isFinite(timestamp) && timestamp > 10_000) {
    return new Date(timestamp * 1000).toISOString();
  }
  return new Date().toISOString();
}

export async function getEodhdApiToken() {
  return requireLocalSecret("EODHD_API_KEY", EODHD_API_KEY_SERVICE);
}

export async function searchEodhdByIsin(isin, apiToken = null) {
  const token = apiToken ?? (await getEodhdApiToken());
  const result = await fetchJson(apiUrl(`/search/${encodeURIComponent(isin)}`, token, { type: "all" }));
  return Array.isArray(result) ? result.map(normalizeCandidate) : [];
}

export async function mapIsinToEodhdSymbol(isin, apiToken = null) {
  const token = apiToken ?? (await getEodhdApiToken());
  const raw = await fetchJson(apiUrl(`/search/${encodeURIComponent(isin)}`, token, { type: "all" }));
  const candidates = Array.isArray(raw) ? raw : [];
  const best = chooseBestCandidate(candidates);
  return {
    isin,
    status: best ? "MAPPED" : "MAPPING_REQUIRED",
    best,
    candidates: candidates.map(normalizeCandidate),
  };
}

export async function fetchEodhdQuote(providerSymbol, apiToken = null) {
  const token = apiToken ?? (await getEodhdApiToken());
  const quote = await fetchJson(apiUrl(`/real-time/${encodeURIComponent(providerSymbol)}`, token));
  const price = quotePrice(quote);
  return {
    provider: "eodhd",
    providerSymbol,
    price,
    currency: quote.currency ?? quote.Currency ?? null,
    asOf: quoteTimestamp(quote),
    raw: quote,
    status: price ? "OK" : "NO_PRICE",
  };
}

export async function fetchFxRateToEur(currency, apiToken = null) {
  const token = apiToken ?? (await getEodhdApiToken());
  const normalized = String(currency ?? "EUR").toUpperCase();
  if (normalized === "EUR") return { rate: 1, pair: "EUR", status: "OK" };

  const directPair = `${normalized}EUR.FOREX`;
  const direct = await fetchEodhdQuote(directPair, token).catch(() => null);
  if (direct?.price) return { rate: direct.price, pair: directPair, status: "OK" };

  const inversePair = `EUR${normalized}.FOREX`;
  const inverse = await fetchEodhdQuote(inversePair, token).catch(() => null);
  if (inverse?.price) return { rate: 1 / inverse.price, pair: inversePair, status: "OK" };

  return { rate: null, pair: null, status: "FX_REQUIRED" };
}
