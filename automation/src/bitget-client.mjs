import crypto from "node:crypto";

const BITGET_BASE_URL = "https://api.bitget.com";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Fehlende Umgebungsvariable: ${name}`);
  return value;
}

function encodeQuery(params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null);
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

export class BitgetClient {
  constructor({
    apiKey = requiredEnv("BITGET_API_KEY"),
    apiSecret = requiredEnv("BITGET_API_SECRET"),
    passphrase = requiredEnv("BITGET_API_PASSPHRASE"),
  } = {}) {
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
      throw new Error(
        `Bitget API Fehler ${response.status}: ${json?.msg ?? json?.message ?? response.statusText}`,
      );
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

  getSpotBills(params = {}) {
    return this.request("GET", "/api/v2/spot/account/bills", { params });
  }

  getSpotFills(params = {}) {
    return this.request("GET", "/api/v2/spot/trade/fills", { params });
  }

  getSpotTickers(params = {}) {
    return this.request("GET", "/api/v2/spot/market/tickers", { params, auth: false });
  }
}

export async function fetchBitgetPortfolioSnapshot(client = new BitgetClient()) {
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

  const tickerBySymbol = new Map((tickers ?? []).map((ticker) => [ticker.symbol, ticker]));
  const usdtToEur = usdEurRate ?? parseNumber(process.env.BITGET_USDT_EUR_RATE) ?? null;

  const positions = (assets ?? [])
    .map((asset) => {
      const coin = String(asset.coin ?? "").toUpperCase();
      const available = parseNumber(asset.available) ?? 0;
      const frozen = parseNumber(asset.frozen) ?? 0;
      const locked = parseNumber(asset.locked) ?? 0;
      const quantity = available + frozen + locked;
      if (!coin || quantity <= 0) return null;

      const ticker = coin === "USDT" ? null : tickerBySymbol.get(`${coin}USDT`);
      const priceUsdt = coin === "USDT" ? 1 : parseNumber(ticker?.lastPr);
      const currentValueUsdt = priceUsdt !== null ? quantity * priceUsdt : null;
      const currentValue =
        currentValueUsdt !== null && usdtToEur !== null ? currentValueUsdt * usdtToEur : null;

      return {
        id: `bitget_${coin}`,
        source: "bitget",
        name: coin,
        category: "Crypto",
        quantity,
        quantityText: String(quantity),
        quoteText: priceUsdt !== null ? `${priceUsdt} USDT` : null,
        currentValue,
        currentValueUsdt,
        costValue: null,
        performanceValue: null,
        performancePct: null,
        valuationDate: new Date().toISOString(),
        valuationMethod: "bitget_spot_assets_v1",
        raw: asset,
      };
    })
    .filter(Boolean);

  const currentValue = positions.reduce((sum, position) => sum + (position.currentValue ?? 0), 0);
  return {
    accountInfo,
    accountBalances,
    positions,
    currentValue,
    usdtToEur,
    valuationDate: new Date().toISOString(),
  };
}
