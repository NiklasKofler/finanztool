import crypto from "node:crypto";
import { readLocalSecret } from "./local-secret.mjs";

const BITGET_BASE_URL = "https://api.bitget.com";
const COINGECKO_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price";
const COINGECKO_IDS_BY_COIN = {
  MELANIA: "melania-meme",
};

const BITGET_KEYCHAIN_SERVICES = {
  apiKey: "finanztool-bitget-api-key",
  apiSecret: "finanztool-bitget-api-secret",
  passphrase: "finanztool-bitget-api-passphrase",
};

export class BitgetApiError extends Error {
  constructor({ status, code, message, requestPath }) {
    super(`Bitget API Fehler ${status}/${code ?? "unknown"} bei ${requestPath}: ${message}`);
    this.name = "BitgetApiError";
    this.status = status;
    this.code = code;
    this.requestPath = requestPath;
  }
}

function encodeQuery(params = {}) {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) return "";
  const query = new URLSearchParams();
  entries.forEach(([key, value]) => query.set(key, String(value)));
  return query.toString();
}

function createSignature({ timestamp, method, requestPath, query, body, secret }) {
  const queryPart = query ? `?${query}` : "";
  const payload = `${timestamp}${method.toUpperCase()}${requestPath}${queryPart}${body}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("base64");
}

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchUsdEurRate() {
  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR");
    if (!response.ok) return null;
    const json = await response.json();
    return parseNumber(json?.rates?.EUR);
  } catch {
    return null;
  }
}

async function fetchFallbackCryptoPrices(coins) {
  const requested = [...new Set(coins)]
    .map((coin) => [coin, COINGECKO_IDS_BY_COIN[coin]])
    .filter(([, id]) => id);
  if (!requested.length) return {};

  try {
    const url = new URL(COINGECKO_PRICE_URL);
    url.searchParams.set("ids", requested.map(([, id]) => id).join(","));
    url.searchParams.set("vs_currencies", "usd,eur");
    const response = await fetch(url);
    if (!response.ok) return {};
    const json = await response.json();
    return Object.fromEntries(
      requested.map(([coin, id]) => [
        coin,
        {
          usd: parseNumber(json?.[id]?.usd),
          eur: parseNumber(json?.[id]?.eur),
          source: "coingecko",
        },
      ]),
    );
  } catch {
    return {};
  }
}

export class BitgetClient {
  constructor({ apiKey, apiSecret, passphrase } = {}) {
    if (!apiKey || !apiSecret || !passphrase) {
      throw new Error(
        "BitgetClient benoetigt API-Key, Secret und Passphrase. " +
          "Verwende createBitgetClientFromLocalSecrets().",
      );
    }
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.passphrase = passphrase;
  }

  async request(method, requestPath, { params, body, auth = true } = {}) {
    const query = encodeQuery(params);
    const url = `${BITGET_BASE_URL}${requestPath}${query ? `?${query}` : ""}`;
    const bodyText = body ? JSON.stringify(body) : "";
    const headers = {
      "Content-Type": "application/json",
      locale: "en-US",
    };

    if (auth) {
      const timestamp = String(Date.now());
      headers["ACCESS-KEY"] = this.apiKey;
      headers["ACCESS-TIMESTAMP"] = timestamp;
      headers["ACCESS-PASSPHRASE"] = this.passphrase;
      headers["ACCESS-SIGN"] = createSignature({
        timestamp,
        method,
        requestPath,
        query,
        body: bodyText,
        secret: this.apiSecret,
      });
    }

    const response = await fetch(url, {
      method,
      headers,
      body: bodyText || undefined,
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.code !== "00000") {
      throw new BitgetApiError({
        status: response.status,
        code: json?.code,
        message: json?.msg ?? json?.message ?? response.statusText,
        requestPath,
      });
    }
    return json.data;
  }

  getAccountInfo() {
    return this.request("GET", "/api/v2/spot/account/info");
  }

  getSpotAssets(params = { assetType: "hold_only" }) {
    return this.request("GET", "/api/v2/spot/account/assets", { params });
  }

  getAllAccountBalance() {
    return this.request("GET", "/api/v2/account/all-account-balance");
  }

  getEarnAssets() {
    return this.request("GET", "/api/v2/earn/account/assets");
  }

  getSpotBills(params = {}) {
    return this.request("GET", "/api/v2/spot/account/bills", { params });
  }

  getSpotFills(params = {}) {
    return this.request("GET", "/api/v2/spot/trade/fills", { params });
  }

  getSpotTickers(params = {}) {
    return this.request("GET", "/api/v2/spot/market/tickers", { params, auth: false });
  }

  getServerTime() {
    return this.request("GET", "/api/v2/public/time", { auth: false });
  }
}

export async function fetchBitgetServerTime() {
  const response = await fetch(`${BITGET_BASE_URL}/api/v2/public/time`);
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.code !== "00000") {
    throw new BitgetApiError({
      status: response.status,
      code: json?.code,
      message: json?.msg ?? json?.message ?? response.statusText,
      requestPath: "/api/v2/public/time",
    });
  }
  return json.data;
}

export async function createBitgetClientFromLocalSecrets() {
  const [apiKey, apiSecret, passphrase] = await Promise.all([
    readLocalSecret("BITGET_API_KEY", BITGET_KEYCHAIN_SERVICES.apiKey),
    readLocalSecret("BITGET_API_SECRET", BITGET_KEYCHAIN_SERVICES.apiSecret),
    readLocalSecret("BITGET_API_PASSPHRASE", BITGET_KEYCHAIN_SERVICES.passphrase),
  ]);

  const missing = [
    !apiKey && "BITGET_API_KEY",
    !apiSecret && "BITGET_API_SECRET",
    !passphrase && "BITGET_API_PASSPHRASE",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `${missing.join(", ")} fehlen. Fuehre im Ordner automation einmal ` +
        '"npm run setup:bitget" aus.',
    );
  }

  return new BitgetClient({ apiKey, apiSecret, passphrase });
}

export async function fetchBitgetPortfolioSnapshot(client) {
  if (!client) throw new Error("fetchBitgetPortfolioSnapshot benoetigt einen BitgetClient.");
  const [accountInfo, assets, tickers, usdEurRate] = await Promise.all([
    client.getAccountInfo(),
    client.getSpotAssets({ assetType: "hold_only" }),
    client.getSpotTickers(),
    fetchUsdEurRate(),
  ]);

  let accountBalances = null;
  try {
    accountBalances = await client.getAllAccountBalance();
  } catch (error) {
    accountBalances = { warning: error.message };
  }

  let earnAssets = [];
  try {
    earnAssets = await client.getEarnAssets();
  } catch (error) {
    console.warn(`[warn] Bitget earn assets skipped: ${error.message}`);
  }

  const tickerBySymbol = new Map((tickers ?? []).map((ticker) => [ticker.symbol, ticker]));
  const usdtToEur = usdEurRate ?? parseNumber(process.env.BITGET_USDT_EUR_RATE) ?? null;
  const fallbackPrices = await fetchFallbackCryptoPrices(
    (assets ?? []).map((asset) => String(asset.coin ?? "").toUpperCase()),
  );

  const spotPositions = (assets ?? [])
    .map((asset) => {
      const coin = String(asset.coin ?? "").toUpperCase();
      const available = parseNumber(asset.available) ?? 0;
      const frozen = parseNumber(asset.frozen) ?? 0;
      const locked = parseNumber(asset.locked) ?? 0;
      const quantity = available + frozen + locked;
      if (!coin || quantity <= 0) return null;

      const ticker = coin === "USDT" ? null : tickerBySymbol.get(`${coin}USDT`);
      const bitgetPriceUsdt = coin === "USDT" ? 1 : parseNumber(ticker?.lastPr);
      const fallbackPrice = fallbackPrices[coin];
      const priceUsdt = bitgetPriceUsdt ?? fallbackPrice?.usd ?? null;
      const currentValueUsdt = priceUsdt !== null ? quantity * priceUsdt : null;
      const currentValue =
        coin === "EUR"
          ? quantity
          : fallbackPrice?.eur !== null && fallbackPrice?.eur !== undefined
            ? quantity * fallbackPrice.eur
            : currentValueUsdt !== null && usdtToEur !== null
              ? currentValueUsdt * usdtToEur
              : null;
      const priceSource = bitgetPriceUsdt !== null ? "bitget" : fallbackPrice?.source ?? null;

      return {
        id: `bitget_spot_${coin}`,
        source: "bitget",
        name: coin,
        category: "Crypto - Spot",
        accountType: "spot",
        quantity,
        quantityText: String(quantity),
        quoteText: coin === "EUR" ? "1 EUR" : priceUsdt !== null ? `${priceUsdt} USDT` : null,
        currentValue,
        currentValueUsdt,
        priceSource,
        accountValueIncluded: bitgetPriceUsdt !== null,
        costValue: null,
        performanceValue: null,
        performancePct: null,
        valuationDate: new Date().toISOString(),
        valuationMethod:
          priceSource === "coingecko"
            ? "bitget_spot_assets_coingecko_price_v1"
            : "bitget_spot_assets_v1",
        raw: asset,
      };
    })
    .filter(Boolean);

  const earnPositions = (earnAssets ?? [])
    .map((asset) => {
      const coin = String(asset.coin ?? "").toUpperCase();
      const quantity = parseNumber(asset.amount) ?? 0;
      if (!coin || quantity <= 0) return null;

      const ticker = coin === "USDT" ? null : tickerBySymbol.get(`${coin}USDT`);
      const priceUsdt = coin === "USDT" ? 1 : parseNumber(ticker?.lastPr);
      const currentValueUsdt = priceUsdt !== null ? quantity * priceUsdt : null;
      const currentValue =
        currentValueUsdt !== null && usdtToEur !== null ? currentValueUsdt * usdtToEur : null;

      return {
        id: `bitget_earn_${coin}`,
        source: "bitget",
        name: coin,
        category: "Crypto - Earn",
        accountType: "earn",
        quantity,
        quantityText: String(quantity),
        quoteText: priceUsdt !== null ? `${priceUsdt} USDT` : null,
        currentValue,
        currentValueUsdt,
        costValue: null,
        performanceValue: null,
        performancePct: null,
        valuationDate: new Date().toISOString(),
        valuationMethod: "bitget_earn_assets_v1",
        raw: asset,
      };
    })
    .filter(Boolean);

  const positions = [...spotPositions, ...earnPositions];
  const accountComponents = Object.fromEntries(
    (accountBalances ?? []).map((account) => [
      account.accountType,
      parseNumber(account.usdtBalance) ?? 0,
    ]),
  );
  const totalAccountValueUsdt = Object.values(accountComponents).reduce(
    (total, value) => total + value,
    0,
  );
  const positionsValue = positions.reduce((sum, position) => sum + (position.currentValue ?? 0), 0);
  const additionalValue = spotPositions
    .filter((position) => !position.accountValueIncluded)
    .reduce((sum, position) => sum + (position.currentValue ?? 0), 0);
  const currentValue =
    totalAccountValueUsdt > 0 && usdtToEur !== null
      ? totalAccountValueUsdt * usdtToEur + additionalValue
      : positionsValue;

  return {
    accountInfo,
    accountBalances,
    accountComponents,
    totalAccountValueUsdt,
    additionalValue,
    earnAssets,
    positions,
    currentValue,
    usdtToEur,
    valuationDate: new Date().toISOString(),
  };
}
