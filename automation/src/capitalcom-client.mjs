import { readLocalSecret } from "./local-secret.mjs";

const CAPITALCOM_KEYCHAIN_SERVICES = {
  identifier: "finanztool-capitalcom-identifier",
  apiKey: "finanztool-capitalcom-api-key",
  apiPassword: "finanztool-capitalcom-api-password",
};

const LIVE_BASE_URL = "https://api-capital.backend-capital.com/api/v1";
const DEMO_BASE_URL = "https://demo-api-capital.backend-capital.com/api/v1";

export class CapitalComApiError extends Error {
  constructor({ status, message, requestPath }) {
    super(`Capital.com API Fehler ${status} bei ${requestPath}: ${message}`);
    this.name = "CapitalComApiError";
    this.status = status;
    this.requestPath = requestPath;
  }
}

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBool(value) {
  return ["1", "true", "yes", "demo"].includes(String(value ?? "").trim().toLowerCase());
}

function sum(values) {
  return values.reduce((total, value) => total + (typeof value === "number" ? value : 0), 0);
}

function roundCurrency(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

function accountCurrency(account) {
  return account.currency ?? account.balance?.currency ?? account.accountCurrency ?? null;
}

function accountBalanceValue(account) {
  return (
    parseNumber(account.balance?.balance) ??
    parseNumber(account.balance?.accountValue) ??
    parseNumber(account.balance?.available) ??
    parseNumber(account.balance)
  );
}

function accountAvailableValue(account) {
  return parseNumber(account.balance?.available) ?? parseNumber(account.balance?.availableToTrade);
}

function positionDirection(position) {
  return position.position?.direction ?? position.direction ?? null;
}

function positionSize(position) {
  return parseNumber(position.position?.size) ?? parseNumber(position.size);
}

function positionUpl(position) {
  return (
    parseNumber(position.position?.upl) ??
    parseNumber(position.upl) ??
    parseNumber(position.position?.profitLoss) ??
    parseNumber(position.profitLoss)
  );
}

function marketName(position) {
  return position.market?.instrumentName ?? position.market?.name ?? position.instrumentName ?? position.epic ?? "Capital.com Position";
}

function marketEpic(position) {
  return position.market?.epic ?? position.epic ?? position.position?.epic ?? null;
}

function marketQuoteText(position) {
  const bid = parseNumber(position.market?.bid);
  const ask = parseNumber(position.market?.offer ?? position.market?.ofr ?? position.market?.ask);
  if (bid !== null && ask !== null) return `Bid ${bid} / Ask ${ask}`;
  const level = parseNumber(position.position?.level ?? position.level);
  return level !== null ? `Level ${level}` : null;
}

export class CapitalComClient {
  constructor({ identifier, apiKey, apiPassword, demo = false } = {}) {
    if (!identifier || !apiKey || !apiPassword) {
      throw new Error(
        "CapitalComClient benoetigt Identifier, API-Key und API-Key-Passwort. " +
          "Verwende createCapitalComClientFromLocalSecrets().",
      );
    }
    this.identifier = identifier;
    this.apiKey = apiKey;
    this.apiPassword = apiPassword;
    this.baseUrl = demo ? DEMO_BASE_URL : LIVE_BASE_URL;
    this.demo = demo;
    this.cst = null;
    this.securityToken = null;
    this.sessionPromise = null;
  }

  async startSession() {
    if (this.sessionPromise) return this.sessionPromise;
    this.sessionPromise = this.createSession();
    try {
      return await this.sessionPromise;
    } finally {
      this.sessionPromise = null;
    }
  }

  async createSession() {
    const response = await fetch(`${this.baseUrl}/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CAP-API-KEY": this.apiKey,
      },
      body: JSON.stringify({
        identifier: this.identifier,
        password: this.apiPassword,
        encryptedPassword: false,
      }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new CapitalComApiError({
        status: response.status,
        message: json?.errorCode ?? json?.message ?? response.statusText,
        requestPath: "/session",
      });
    }
    this.cst = response.headers.get("cst");
    this.securityToken = response.headers.get("x-security-token");
    if (!this.cst || !this.securityToken) {
      throw new Error("Capital.com Session gestartet, aber CST oder X-SECURITY-TOKEN fehlt.");
    }
    return json;
  }

  async request(method, requestPath, { params } = {}) {
    if (!this.cst || !this.securityToken) await this.startSession();
    const url = new URL(`${this.baseUrl}${requestPath}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-SECURITY-TOKEN": this.securityToken,
        CST: this.cst,
      },
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new CapitalComApiError({
        status: response.status,
        message: json?.errorCode ?? json?.message ?? response.statusText,
        requestPath,
      });
    }
    return json;
  }

  getSession() {
    return this.request("GET", "/session");
  }

  getAccounts() {
    return this.request("GET", "/accounts");
  }

  getPositions() {
    return this.request("GET", "/positions");
  }
}

export async function createCapitalComClientFromLocalSecrets() {
  const [identifier, apiKey, apiPassword] = await Promise.all([
    readLocalSecret("CAPITALCOM_IDENTIFIER", CAPITALCOM_KEYCHAIN_SERVICES.identifier),
    readLocalSecret("CAPITALCOM_API_KEY", CAPITALCOM_KEYCHAIN_SERVICES.apiKey),
    readLocalSecret("CAPITALCOM_API_PASSWORD", CAPITALCOM_KEYCHAIN_SERVICES.apiPassword),
  ]);
  const missing = [
    !identifier && "CAPITALCOM_IDENTIFIER",
    !apiKey && "CAPITALCOM_API_KEY",
    !apiPassword && "CAPITALCOM_API_PASSWORD",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `${missing.join(", ")} fehlen. Fuehre im Ordner automation einmal ` +
        '"npm run setup:capitalcom" aus.',
    );
  }

  return new CapitalComClient({
    identifier,
    apiKey,
    apiPassword,
    demo: parseBool(process.env.CAPITALCOM_DEMO),
  });
}

export async function fetchCapitalComPortfolioSnapshot(client) {
  if (!client) throw new Error("fetchCapitalComPortfolioSnapshot benoetigt einen CapitalComClient.");
  await client.startSession();
  const [session, accountsPayload, positionsPayload] = await Promise.all([
    client.getSession(),
    client.getAccounts(),
    client.getPositions(),
  ]);

  const accounts = accountsPayload.accounts ?? accountsPayload.clientAccounts ?? [];
  const rawPositions = positionsPayload.positions ?? [];
  const eurAccounts = accounts.filter((account) => accountCurrency(account) === "EUR");
  const nonEurAccounts = accounts.filter((account) => accountCurrency(account) && accountCurrency(account) !== "EUR");
  const accountValue = roundCurrency(sum(eurAccounts.map(accountBalanceValue)));
  const availableCash = roundCurrency(sum(eurAccounts.map(accountAvailableValue)));
  const valuationDate = new Date().toISOString();

  const positions = rawPositions.map((position, index) => {
    const epic = marketEpic(position);
    const dealId = position.position?.dealId ?? position.dealId ?? epic ?? `position_${index + 1}`;
    const upl = positionUpl(position);
    return {
      id: `capitalcom_${String(dealId).replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      source: "capitalcom",
      name: marketName(position),
      category: `CFD - ${positionDirection(position) ?? "Position"}`,
      isin: null,
      wkn: epic,
      quantityText: positionSize(position) !== null ? `${positionSize(position)} ${positionDirection(position) ?? ""}`.trim() : null,
      quoteText: marketQuoteText(position),
      currentValue: upl,
      costValue: null,
      performanceValue: upl,
      performancePct: null,
      accountValueIncluded: false,
      valuationDate,
      valuationMethod: "capitalcom_api_positions_v1",
      rawDirection: positionDirection(position),
      rawEpic: epic,
      rawDealId: position.position?.dealId ?? position.dealId ?? null,
    };
  });

  return {
    source: "capitalcom",
    demo: client.demo,
    accountId: session.currentAccountId ?? session.accountId ?? null,
    currentValue: accountValue,
    cashValue: availableCash,
    netValue: accountValue,
    valuationDate,
    positionCount: positions.length,
    accounts: accounts.map((account) => ({
      accountId: account.accountId ?? account.id ?? null,
      accountName: account.accountName ?? account.name ?? null,
      accountType: account.accountType ?? account.type ?? null,
      currency: accountCurrency(account),
      balance: roundCurrency(accountBalanceValue(account)),
      available: roundCurrency(accountAvailableValue(account)),
      preferred: Boolean(account.preferred),
    })),
    nonEurAccountCount: nonEurAccounts.length,
    positions,
    status: nonEurAccounts.length ? "WARNUNG" : "VERIFIED",
  };
}
