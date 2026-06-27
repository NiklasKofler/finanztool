import { readLocalSecret } from "./local-secret.mjs";

const TRADING212_KEYCHAIN_SERVICES = {
  apiKey: "finanztool-trading212-api-key",
  apiSecret: "finanztool-trading212-api-secret",
};

const LIVE_BASE_URL = "https://live.trading212.com/api/v0";
const DEMO_BASE_URL = "https://demo.trading212.com/api/v0";

function parseBool(value) {
  return ["1", "true", "yes", "demo"].includes(String(value ?? "").trim().toLowerCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

function basicAuthHeader(apiKey, apiSecret) {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`, "utf8").toString("base64")}`;
}

export class Trading212ApiError extends Error {
  constructor({ status, message, requestPath, rateLimit }) {
    super(`Trading 212 API Fehler ${status} bei ${requestPath}: ${message}`);
    this.name = "Trading212ApiError";
    this.status = status;
    this.requestPath = requestPath;
    this.rateLimit = rateLimit ?? null;
  }
}

export class Trading212Client {
  constructor({ apiKey, apiSecret, demo = false, baseUrl = null } = {}) {
    if (!apiKey || !apiSecret) {
      throw new Error(
        "Trading212Client benoetigt API-Key und API-Secret. Verwende createTrading212ClientFromLocalSecrets().",
      );
    }
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.demo = demo;
    this.baseUrl = baseUrl ?? (demo ? DEMO_BASE_URL : LIVE_BASE_URL);
    this.lastRateLimit = null;
  }

  async request(method, requestPath, { params, body } = {}) {
    const path = requestPath.startsWith("/api/v0/")
      ? requestPath.replace(/^\/api\/v0/, "")
      : requestPath;
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }

    const maxAttempts = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          Authorization: basicAuthHeader(this.apiKey, this.apiSecret),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const rateLimit = {
        limit: response.headers.get("x-ratelimit-limit"),
        period: response.headers.get("x-ratelimit-period"),
        remaining: response.headers.get("x-ratelimit-remaining"),
        reset: response.headers.get("x-ratelimit-reset"),
        used: response.headers.get("x-ratelimit-used"),
      };
      this.lastRateLimit = rateLimit;
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (response.ok) return json;

      lastError = new Trading212ApiError({
        status: response.status,
        message: json?.message ?? json?.error ?? text ?? response.statusText,
        requestPath: path,
        rateLimit,
      });
      if (!shouldRetryStatus(response.status) || attempt === maxAttempts) throw lastError;

      const resetMs = Number.parseInt(rateLimit.reset ?? "", 10);
      const retryDelayMs =
        response.status === 429 && Number.isFinite(resetMs)
          ? Math.max(1000, Math.min(30_000, resetMs * 1000 - Date.now()))
          : 750 * attempt;
      await sleep(retryDelayMs);
    }
    throw lastError;
  }

  getAccountSummary() {
    return this.request("GET", "/equity/account/summary");
  }

  getPositions() {
    return this.request("GET", "/equity/positions");
  }

  getHistoricalOrders(params = {}) {
    return this.request("GET", "/equity/history/orders", { params });
  }

  getHistoricalDividends(params = {}) {
    return this.request("GET", "/equity/history/dividends", { params });
  }

  getHistoricalTransactions(params = {}) {
    return this.request("GET", "/equity/history/transactions", { params });
  }

  getHistoricalExports() {
    return this.request("GET", "/equity/history/exports");
  }

  requestHistoricalExport({ timeFrom, timeTo, dataIncluded }) {
    return this.request("POST", "/equity/history/exports", {
      body: {
        dataIncluded: {
          includeDividends: true,
          includeInterest: true,
          includeOrders: true,
          includeTransactions: true,
          ...(dataIncluded ?? {}),
        },
        timeFrom,
        timeTo,
      },
    });
  }

  getByNextPagePath(nextPagePath) {
    return this.request("GET", nextPagePath);
  }
}

export async function createTrading212ClientFromLocalSecrets() {
  const [apiKey, apiSecret] = await Promise.all([
    readLocalSecret("TRADING212_API_KEY", TRADING212_KEYCHAIN_SERVICES.apiKey),
    readLocalSecret("TRADING212_API_SECRET", TRADING212_KEYCHAIN_SERVICES.apiSecret),
  ]);
  const missing = [
    !apiKey && "TRADING212_API_KEY",
    !apiSecret && "TRADING212_API_SECRET",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `${missing.join(", ")} fehlen. Fuehre im Ordner automation einmal ` +
        '"npm run setup:trading212" aus.',
    );
  }

  return new Trading212Client({
    apiKey,
    apiSecret,
    demo: parseBool(process.env.TRADING212_DEMO),
    baseUrl: process.env.TRADING212_BASE_URL?.trim() || null,
  });
}

export async function fetchTrading212Paginated(client, initialPathOrMethod, { params = {}, maxPages = 3 } = {}) {
  const items = [];
  let payload;
  let nextPagePath = null;
  for (let page = 1; page <= maxPages; page += 1) {
    if (page === 1) {
      payload =
        typeof initialPathOrMethod === "function"
          ? await initialPathOrMethod(params)
          : await client.request("GET", initialPathOrMethod, { params });
    } else if (nextPagePath) {
      payload = await client.getByNextPagePath(nextPagePath);
    } else {
      break;
    }
    items.push(...(payload?.items ?? []));
    nextPagePath = payload?.nextPagePath ?? null;
    if (!nextPagePath) break;
  }

  return {
    items,
    nextPagePath,
    truncated: Boolean(nextPagePath),
  };
}
