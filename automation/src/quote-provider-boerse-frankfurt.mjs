import crypto from "node:crypto";

const BOERSE_FRANKFURT_API_BASE = "https://api.live.deutsche-boerse.com/v1";
const BOERSE_FRANKFURT_SITE_BASE = "https://www.boerse-frankfurt.de";
const TRACE_SALT = "af5a8d16eb5dc49f8a72b26fd9185475c7a";
const DEFAULT_LANG = process.env.BOERSE_FRANKFURT_LANG ?? "de";
const preferredMics = ["XETR", "XFRA"];

function md5(value) {
  return crypto.createHash("md5").update(value).digest("hex");
}

function pad(value, width = 2) {
  return String(value).padStart(width, "0");
}

function formatClientDate(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  return (
    `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.trunc(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`
  );
}

function formatSecurityMinute(date = new Date()) {
  return (
    `${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

function boerseHeaders(url) {
  const now = new Date();
  const clientDate = formatClientDate(now);
  return {
    "Client-Date": clientDate,
    "X-Client-TraceId": md5(`${clientDate}${url}${TRACE_SALT}`),
    "X-Security": md5(formatSecurityMinute(now)),
    accept: "application/json,text/plain,*/*",
    "content-type": "application/json",
    "user-agent": "finanztool-quote-agent/0.1 (+boerse-frankfurt)",
  };
}

function apiUrl(path, params = {}) {
  const url = new URL(`${BOERSE_FRANKFURT_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: boerseHeaders(url) });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Boerse Frankfurt HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Boerse Frankfurt Antwort ist kein JSON: ${text.slice(0, 300)}`);
  }
}

function translatedValue(value) {
  if (typeof value === "string") return value;
  return value?.originalValue ?? value?.translations?.others ?? null;
}

function flattenSearchResult(result) {
  return (Array.isArray(result) ? result : [])
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .filter(Boolean);
}

function normalizeSearchCandidate(candidate) {
  return {
    provider: "boerse-frankfurt",
    isin: candidate.isin ?? null,
    wkn: candidate.wkn ?? null,
    symbol: candidate.symbol ?? null,
    slug: candidate.slug ?? null,
    type: candidate.type ?? null,
    name: translatedValue(candidate.name),
    currency: candidate.currency ?? null,
    raw: candidate,
  };
}

function instrumentPath(type, slug) {
  if (!slug) return null;
  const normalizedType = String(type ?? "").toLowerCase();
  const route =
    {
      active_etf: "etf",
      etf: "etf",
      etc: "etc",
      etn: "etn",
      etp: "etp",
      equity: "equity",
      share: "equity",
      bond: "bond",
      fund: "fund",
      index: "index",
      commodity: "commodity",
      derivative: "derivative",
    }[normalizedType] ?? normalizedType;
  return route ? `/en/${route}/${slug}` : null;
}

function chooseMic(info) {
  const mics = Array.isArray(info?.mics) ? info.mics : [];
  if (info?.defaultMic && mics.includes(info.defaultMic)) return info.defaultMic;
  return preferredMics.find((mic) => mics.includes(mic)) ?? info?.defaultMic ?? mics[0] ?? "XETR";
}

function providerSymbolFor(isin, mic) {
  return `${String(isin).toUpperCase()}:${String(mic).toUpperCase()}`;
}

function parseProviderSymbol(providerSymbol) {
  const [isin, mic] = String(providerSymbol ?? "").split(":");
  return {
    isin: isin?.toUpperCase() || null,
    mic: mic?.toUpperCase() || null,
  };
}

function normalizeInstrumentInfo(info, fallback = {}) {
  const isin = info?.isin ?? fallback.isin ?? null;
  const mic = chooseMic(info);
  const slug = info?.slug ?? fallback.slug ?? null;
  const type = info?.instrumentTypeKey ?? fallback.type ?? null;
  return {
    provider: "boerse-frankfurt",
    providerSymbol: isin ? providerSymbolFor(isin, mic) : null,
    isin,
    mic,
    exchange: mic,
    code: info?.exchangeSymbol ?? fallback.symbol ?? null,
    wkn: info?.wkn ?? fallback.wkn ?? null,
    slug,
    name: translatedValue(info?.instrumentName) ?? fallback.name ?? null,
    type,
    currency: info?.mainCurrency ?? fallback.currency ?? null,
    mics: Array.isArray(info?.mics) ? info.mics : [],
    sourceUrl: instrumentPath(type, slug) ? `${BOERSE_FRANKFURT_SITE_BASE}${instrumentPath(type, slug)}` : null,
    raw: info,
  };
}

export async function searchBoerseFrankfurtByIsin(isin, lang = DEFAULT_LANG) {
  const url = apiUrl(`/global_search/limitedsearch/${lang}`, { searchTerms: String(isin).toUpperCase() });
  const result = await fetchJson(url);
  return flattenSearchResult(result).map(normalizeSearchCandidate);
}

export async function fetchBoerseFrankfurtInstrumentInfo(isin) {
  const url = apiUrl("/data/instrument_information", { isin: String(isin).toUpperCase() });
  return fetchJson(url);
}

export async function mapIsinToBoerseFrankfurt(isin) {
  const normalizedIsin = String(isin).toUpperCase();
  const candidates = await searchBoerseFrankfurtByIsin(normalizedIsin).catch(() => []);
  const exactCandidate = candidates.find((candidate) => candidate.isin === normalizedIsin) ?? candidates[0] ?? null;

  const info = await fetchBoerseFrankfurtInstrumentInfo(normalizedIsin).catch(() => null);
  if (!info?.isin && !exactCandidate) {
    return {
      isin: normalizedIsin,
      provider: "boerse-frankfurt",
      status: "MAPPING_REQUIRED",
      best: null,
      candidates,
    };
  }

  const best = normalizeInstrumentInfo(info, exactCandidate ?? { isin: normalizedIsin });
  return {
    isin: normalizedIsin,
    provider: "boerse-frankfurt",
    status: best.providerSymbol ? "MAPPED" : "MAPPING_REQUIRED",
    best,
    candidates,
  };
}

export async function fetchBoerseFrankfurtQuote(providerSymbol, mapping = {}) {
  const parsed = parseProviderSymbol(providerSymbol);
  const isin = parsed.isin ?? String(mapping.isin ?? "").toUpperCase();
  const mappingPreferredMics = Array.isArray(mapping.preferredMics) ? mapping.preferredMics : [];
  const candidateMics = [
    ...mappingPreferredMics,
    parsed.mic,
    mapping.mic,
    mapping.exchange,
    ...(Array.isArray(mapping.mics) ? mapping.mics : []),
    ...preferredMics,
  ]
    .filter(Boolean)
    .map((mic) => String(mic).toUpperCase());
  const uniqueMics = [...new Set(candidateMics)];

  let lastError = null;
  for (const mic of uniqueMics) {
    const url = apiUrl("/data/price_information/single", { isin, mic });
    try {
      const quote = await fetchJson(url);
      const price = Number(quote?.lastPrice);
      if (Number.isFinite(price) && price > 0) {
        const currency = translatedValue(quote.currency) ?? mapping.currency ?? null;
        return {
          provider: "boerse-frankfurt",
          providerSymbol: providerSymbolFor(isin, quote.mic ?? mic),
          price,
          currency,
          asOf: quote.timestampLastPrice ?? new Date().toISOString(),
          mic: quote.mic ?? mic,
          sourceUrl: mapping.sourceUrl ?? null,
          raw: quote,
          status: "OK",
        };
      }
      lastError = `Kein Preis fuer ${isin}:${mic}`;
    } catch (error) {
      lastError = error.message;
    }
  }

  return {
    provider: "boerse-frankfurt",
    providerSymbol,
    price: null,
    currency: mapping.currency ?? null,
    asOf: new Date().toISOString(),
    status: "NO_PRICE",
    error: lastError,
  };
}
