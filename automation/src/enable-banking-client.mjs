import crypto from "node:crypto";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { readLocalSecret, requireLocalSecret } from "./local-secret.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ENABLE_BANKING_BASE_URL =
  process.env.ENABLE_BANKING_BASE_URL?.trim() || "https://api.enablebanking.com";
export const ENABLE_BANKING_APPLICATION_ID_SERVICE = "finanztool.enablebanking.applicationId";
export const ENABLE_BANKING_SESSION_ID_SERVICE = "finanztool.enablebanking.sessionId";

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createJwt({ applicationId, privateKey, ttlSeconds = 3600 }) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    typ: "JWT",
    alg: "RS256",
    kid: applicationId,
  };
  const body = {
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat: now,
    exp: now + Math.min(ttlSeconds, 3600),
  };
  const encoded = `${base64UrlJson(header)}.${base64UrlJson(body)}`;
  const signature = crypto.createSign("RSA-SHA256").update(encoded).end().sign(privateKey, "base64url");
  return `${encoded}.${signature}`;
}

async function readPrivateKey(applicationId) {
  const inlinePrivateKey = process.env.ENABLE_BANKING_PRIVATE_KEY?.trim();
  if (inlinePrivateKey) return normalizePrivateKey(inlinePrivateKey);

  const keyPath =
    process.env.ENABLE_BANKING_PRIVATE_KEY_PATH?.trim() ||
    process.env.ENABLE_BANKING_KEY_PATH?.trim();
  if (keyPath) return fs.readFile(keyPath, "utf8");

  const defaultKeyPath = path.resolve(__dirname, "../../secrets/enable-banking", `${applicationId}.pem`);
  try {
    return await fs.readFile(defaultKeyPath, "utf8");
  } catch {
    // Fall back to Keychain below for machines where only the Keychain secret was transferred.
  }

  const keychainValue = await requireLocalSecret(
    "ENABLE_BANKING_PRIVATE_KEY",
    `finanztool.enablebanking.privateKey.${applicationId}`,
  );
  return normalizePrivateKey(keychainValue);
}

function normalizePrivateKey(value) {
  const text = String(value ?? "").trim();
  if (text.includes("-----BEGIN")) return text.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(text, "base64").toString("utf8").trim();
    if (decoded.includes("-----BEGIN")) return decoded;
  } catch {
    // Keep original value for the final crypto error; it will be more specific.
  }
  return text;
}

export async function readEnableBankingSessionId() {
  return readLocalSecret("ENABLE_BANKING_SESSION_ID", ENABLE_BANKING_SESSION_ID_SERVICE);
}

export async function storeEnableBankingSessionId(sessionId) {
  if (!sessionId) return;
  if (process.platform !== "darwin") return;
  await execFileAsync("security", [
    "add-generic-password",
    "-U",
    "-s",
    ENABLE_BANKING_SESSION_ID_SERVICE,
    "-a",
    "finanztool",
    "-w",
    sessionId,
  ]);
}

export async function createEnableBankingClientFromLocalSecrets() {
  const applicationId = await requireLocalSecret(
    "ENABLE_BANKING_APPLICATION_ID",
    ENABLE_BANKING_APPLICATION_ID_SERVICE,
  );
  const privateKey = await readPrivateKey(applicationId);
  return new EnableBankingClient({ applicationId, privateKey });
}

export class EnableBankingClient {
  constructor({ applicationId, privateKey, baseUrl = ENABLE_BANKING_BASE_URL }) {
    this.applicationId = applicationId;
    this.privateKey = privateKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  headers() {
    return {
      Authorization: `Bearer ${createJwt({
        applicationId: this.applicationId,
        privateKey: this.privateKey,
      })}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  async request(path, options = {}) {
    const timeoutMs = Number(process.env.ENABLE_BANKING_REQUEST_TIMEOUT_MS ?? 45_000);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(timeoutMs),
      headers: {
        ...this.headers(),
        ...(options.headers ?? {}),
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = body?.message ?? body?.error_description ?? body?.error ?? text ?? "unknown";
      const error = new Error(`Enable Banking API Fehler ${response.status}: ${message}`);
      error.status = response.status;
      error.responseBody = body;
      throw error;
    }
    return body;
  }

  async getApplication() {
    return this.request("/application");
  }

  async startAuthorization(request) {
    return this.request("/auth", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async createSession(code) {
    return this.request("/sessions", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  async getSession(sessionId) {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}`);
  }

  async getBalances(accountId) {
    return this.request(`/accounts/${encodeURIComponent(accountId)}/balances`);
  }

  async getTransactions(accountId, {
    dateFrom,
    dateTo,
    continuationKey,
    transactionStatus,
    strategy,
  } = {}) {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (continuationKey) params.set("continuation_key", continuationKey);
    if (transactionStatus) params.set("transaction_status", transactionStatus);
    if (strategy) params.set("strategy", strategy);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/accounts/${encodeURIComponent(accountId)}/transactions${suffix}`);
  }
}
