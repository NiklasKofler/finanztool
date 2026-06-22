import crypto from "node:crypto";
import { readLocalSecret } from "./local-secret.mjs";

const BITGET_BASE_URL = "https://api.bitget.com";

const BITGET_KEYCHAIN_SERVICES = {
  apiKey: "finanztool-bitget-api-key",
  apiSecret: "finanztool-bitget-api-secret",
  passphrase: "finanztool-bitget-api-passphrase",
};
const BITGET_EXCLUDED_CURRENT_COINS = new Set(["TRUMP", "MELANIA"]);
const BITGET_DISPLAY_DUST_EUR_THRESHOLD = Number.parseFloat(
  process.env.BITGET_DISPLAY_DUST_EUR_THRESHOLD ?? "1",
);
const BITGET_REQUEST_RETRIES = Number.parseInt(process.env.BITGET_REQUEST_RETRIES ?? "2", 10);

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBitgetError(error) {
  if (error instanceof BitgetApiError) {
    return [408, 429, 500, 502, 503, 504].includes(error.status);
  }
  return error?.message === "fetch failed" || error?.name === "TypeError";
}

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function tickerPrice(tickerBySymbol, symbol) {
  return parseNumber(tickerBySymbol.get(symbol)?.lastPr);
}

function resolveBitgetEurPrice({ coin, tickerBySymbol, usdtToEur }) {
  if (coin === "EUR") {
    return {
      currentPriceEur: 1,
      currentPriceUsdt: null,
      quoteText: "1 EUR",
      priceSource: "bitget",
      quoteStatus: "OK",
      valuationMethod: "bitget_cash_eur_v1",
    };
  }

  const directEur = tickerPrice(tickerBySymbol, `${coin}EUR`);
  if (directEur !== null) {
    return {
      currentPriceEur: directEur,
      currentPriceUsdt: null,
      quoteText: `${directEur} EUR`,
      priceSource: "bitget",
      quoteStatus: "OK",
      valuationMethod: "bitget_direct_eur_ticker_v1",
    };
  }

  if (coin === "USDT" && usdtToEur !== null) {
    return {
      currentPriceEur: usdtToEur,
      currentPriceUsdt: 1,
      quoteText: `${usdtToEur} EUR`,
      priceSource: "bitget",
      quoteStatus: "OK",
      valuationMethod: "bitget_usdt_eur_ticker_v1",
    };
  }

  const usdtPrice = tickerPrice(tickerBySymbol, `${coin}USDT`);
  if (usdtPrice !== null && usdtToEur !== null) {
    return {
      currentPriceEur: usdtPrice * usdtToEur,
      currentPriceUsdt: usdtPrice,
      quoteText: `${usdtPrice} USDT`,
      priceSource: "bitget",
      quoteStatus: "OK",
      valuationMethod: "bitget_usdt_ticker_v1",
    };
  }

  return {
    currentPriceEur: null,
    currentPriceUsdt: usdtPrice,
    quoteText: usdtPrice !== null ? `${usdtPrice} USDT` : null,
    priceSource: null,
    quoteStatus: "NO_BITGET_PRICE",
    valuationMethod: "bitget_unpriced_asset_v1",
  };
}

function excludedCurrentPositionReason(position) {
  const coin = String(position.name ?? "").toUpperCase();
  if (BITGET_EXCLUDED_CURRENT_COINS.has(coin)) {
    return "excluded_manual_clean_cut_2026_06_20";
  }

  const currentValue = parseNumber(position.currentValue);
  if (
    currentValue !== null &&
    Math.abs(currentValue) < BITGET_DISPLAY_DUST_EUR_THRESHOLD &&
    coin !== "EUR" &&
    coin !== "USDT"
  ) {
    return "excluded_rounds_to_zero_eur";
  }

  return null;
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

    for (let attempt = 0; attempt <= BITGET_REQUEST_RETRIES; attempt += 1) {
      try {
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
      } catch (error) {
        if (attempt >= BITGET_REQUEST_RETRIES || !isRetryableBitgetError(error)) throw error;
        const baseDelay = error instanceof BitgetApiError && error.status === 429 ? 1_500 : 500;
        await sleep(baseDelay * (attempt + 1));
      }
    }

    throw new BitgetApiError({
      status: 0,
      code: "retry_exhausted",
      message: "Bitget request retry loop exhausted",
      requestPath,
    });
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

  getTaxSpotRecords(params = {}) {
    return this.request("GET", "/api/v2/tax/spot-record", { params });
  }

  getTaxFutureRecords(params = {}) {
    return this.request("GET", "/api/v2/tax/future-record", { params });
  }

  getSavingsAssets(params = {}) {
    return this.request("GET", "/api/v2/earn/savings/assets", { params });
  }

  getSavingsRecords(params = {}) {
    return this.request("GET", "/api/v2/earn/savings/records", { params });
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
  const [accountInfo, assets, tickers] = await Promise.all([
    client.getAccountInfo(),
    client.getSpotAssets({ assetType: "hold_only" }),
    client.getSpotTickers(),
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
  const usdtToEur = tickerPrice(tickerBySymbol, "USDTEUR");

  const spotPositions = (assets ?? [])
    .map((asset) => {
      const coin = String(asset.coin ?? "").toUpperCase();
      const available = parseNumber(asset.available) ?? 0;
      const frozen = parseNumber(asset.frozen) ?? 0;
      const locked = parseNumber(asset.locked) ?? 0;
      const quantity = available + frozen + locked;
      if (!coin || quantity <= 0) return null;

      const price = resolveBitgetEurPrice({ coin, tickerBySymbol, usdtToEur });
      const currentValue =
        price.currentPriceEur !== null ? quantity * price.currentPriceEur : null;
      const currentValueUsdt =
        price.currentPriceUsdt !== null ? quantity * price.currentPriceUsdt : null;

      return {
        id: `bitget_spot_${coin}`,
        source: "bitget",
        name: coin,
        category: "Crypto - Spot",
        accountType: "spot",
        quantity,
        quantityText: String(quantity),
        quoteText: price.quoteText,
        quoteStatus: price.quoteStatus,
        currentValue,
        currentValueUsdt,
        quotePrice: price.currentPriceUsdt,
        quotePriceEur: price.currentPriceEur,
        quoteCurrency: price.currentPriceUsdt !== null ? "USDT" : "EUR",
        priceSource: price.priceSource,
        exchangeAccountValueIncluded: price.quoteStatus === "OK",
        accountValueIncluded: currentValue !== null,
        costValue: null,
        performanceValue: null,
        performancePct: null,
        valuationDate: new Date().toISOString(),
        valuationMethod: price.valuationMethod,
        raw: asset,
      };
    })
    .filter(Boolean);

  const earnPositions = (earnAssets ?? [])
    .map((asset) => {
      const coin = String(asset.coin ?? "").toUpperCase();
      const quantity = parseNumber(asset.amount) ?? 0;
      if (!coin || quantity <= 0) return null;

      const price = resolveBitgetEurPrice({ coin, tickerBySymbol, usdtToEur });
      const currentValue =
        price.currentPriceEur !== null ? quantity * price.currentPriceEur : null;
      const currentValueUsdt =
        price.currentPriceUsdt !== null ? quantity * price.currentPriceUsdt : null;

      return {
        id: `bitget_earn_${coin}`,
        source: "bitget",
        name: coin,
        category: "Crypto - Earn",
        accountType: "earn",
        quantity,
        quantityText: String(quantity),
        quoteText: price.quoteText,
        quoteStatus: price.quoteStatus,
        currentValue,
        currentValueUsdt,
        quotePrice: price.currentPriceUsdt,
        quotePriceEur: price.currentPriceEur,
        quoteCurrency: price.currentPriceUsdt !== null ? "USDT" : "EUR",
        priceSource: price.priceSource,
        exchangeAccountValueIncluded: price.quoteStatus === "OK",
        accountValueIncluded: currentValue !== null,
        costValue: null,
        performanceValue: null,
        performancePct: null,
        valuationDate: new Date().toISOString(),
        valuationMethod: `bitget_earn_${price.valuationMethod}`,
        raw: asset,
      };
    })
    .filter(Boolean);

  const rawPositions = [...spotPositions, ...earnPositions];
  const excludedPositions = [];
  const positions = [];
  for (const position of rawPositions) {
    const excludedReason = excludedCurrentPositionReason(position);
    if (excludedReason) {
      excludedPositions.push({
        ...position,
        excludedFromCurrentPortfolio: true,
        excludedReason,
      });
      continue;
    }
    positions.push(position);
  }
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
  const includedPositionsValue = positions
    .filter((position) => position.accountValueIncluded !== false)
    .reduce((sum, position) => sum + (position.currentValue ?? 0), 0);
  const positionsValue = positions.reduce((sum, position) => sum + (position.currentValue ?? 0), 0);
  const unpricedPositions = positions.filter((position) => position.quoteStatus === "NO_BITGET_PRICE");
  const exchangeAccountValue =
    totalAccountValueUsdt && usdtToEur !== null ? totalAccountValueUsdt * usdtToEur : null;
  const currentValue = exchangeAccountValue ?? includedPositionsValue;

  return {
    accountInfo,
    accountBalances,
    accountComponents,
    totalAccountValueUsdt,
    exchangeAccountValue,
    positionsValue,
    includedPositionsValue,
    positionSummaryDifference:
      exchangeAccountValue !== null ? includedPositionsValue - exchangeAccountValue : null,
    unpricedPositionCount: unpricedPositions.length,
    unpricedPositions: unpricedPositions.map((position) => ({
      id: position.id,
      name: position.name,
      accountType: position.accountType,
      quantity: position.quantity,
    })),
    excludedPositionCount: excludedPositions.length,
    excludedPositions: excludedPositions.map((position) => ({
      id: position.id,
      name: position.name,
      accountType: position.accountType,
      quantity: position.quantity,
      currentValue: position.currentValue,
      quoteStatus: position.quoteStatus,
      excludedReason: position.excludedReason,
    })),
    earnAssets,
    rawPositions,
    positions,
    currentValue,
    usdtToEur,
    valuationDate: new Date().toISOString(),
  };
}
