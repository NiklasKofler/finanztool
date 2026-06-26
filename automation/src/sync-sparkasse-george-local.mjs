import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createEnableBankingClientFromLocalSecrets } from "./enable-banking-client.mjs";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const source = "bank_accounts";
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const startAuth = process.argv.includes("--start-auth");
const openAuth = process.argv.includes("--open");
const includeTransactions = process.argv.includes("--transactions");
const runId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const importId = `api_bank_accounts_${runId}`;
const rateLimitPath = path.resolve(__dirname, "../runtime/enable-banking-rate-limits.json");
const defaultInitialTransactionLookbackDays = Number(
  process.env.ENABLE_BANKING_TRANSACTION_INITIAL_LOOKBACK_DAYS ??
    process.env.ENABLE_BANKING_TRANSACTION_LOOKBACK_DAYS ??
    30,
);
const defaultIncrementalOverlapDays = Number(process.env.ENABLE_BANKING_TRANSACTION_OVERLAP_DAYS ?? 2);
const maxTransactionPages = Number(process.env.ENABLE_BANKING_TRANSACTION_MAX_PAGES ?? 20);

const bankConfigs = [
  {
    key: "erste",
    aspspName: "Erste Bank",
    country: "AT",
    displayName: "Erste/Sparkasse",
    legacySessionService: "finanztool.enablebanking.sessionId",
  },
  {
    key: "revolut",
    aspspName: "Revolut",
    country: "AT",
    displayName: "Revolut",
  },
  {
    key: "bank99",
    aspspName: "bank99",
    country: "AT",
    displayName: "bank99",
    maxReadsPerDay: 4,
  },
];

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizeAuthCode(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.searchParams.get("code") ?? text;
  } catch {
    return text;
  }
}

function findBank(key) {
  const normalized = String(key ?? "erste").trim().toLowerCase();
  const bank = bankConfigs.find((item) => item.key === normalized);
  if (!bank) {
    throw new Error(
      `Unbekannte Bank "${key}". Erlaubt: ${bankConfigs.map((item) => item.key).join(", ")}`,
    );
  }
  return bank;
}

function sessionService(bank) {
  return `finanztool.enablebanking.sessionId.${bank.key}`;
}

function pendingBankService() {
  return "finanztool.enablebanking.pendingBank";
}

async function readKeychainSecret(service) {
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await execFileAsync("security", ["find-generic-password", "-s", service, "-w"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function writeKeychainSecret(service, value) {
  if (!value || process.platform !== "darwin") return;
  await execFileAsync("security", [
    "add-generic-password",
    "-U",
    "-s",
    service,
    "-a",
    "finanztool",
    "-w",
    value,
  ]);
}

async function readBankSessionId(bank) {
  const envSpecific = process.env[`ENABLE_BANKING_SESSION_ID_${bank.key.toUpperCase()}`]?.trim();
  if (envSpecific) return envSpecific;
  const specific = await readKeychainSecret(sessionService(bank));
  if (specific) return specific;
  if (bank.legacySessionService) {
    return (
      process.env.ENABLE_BANKING_SESSION_ID?.trim() ??
      (await readKeychainSecret(bank.legacySessionService))
    );
  }
  return null;
}

async function storeBankSessionId(bank, sessionId) {
  await writeKeychainSecret(sessionService(bank), sessionId);
  if (bank.legacySessionService) await writeKeychainSecret(bank.legacySessionService, sessionId);
}

function parseAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
    : text.replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function sanitizeId(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180) || "unknown";
}

function stableHash(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 24);
}

function viennaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const item = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${item.year}-${item.month}-${item.day}`;
}

function isoDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return viennaDateKey(date);
}

function todayIsoDate() {
  return viennaDateKey();
}

function isoDateShift(dateValue, days) {
  if (!dateValue) return null;
  const isoDate = String(dateValue).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function maskIban(value) {
  if (!value) return null;
  const text = String(value);
  return text.length <= 8 ? text : `${text.slice(0, 2)}...${text.slice(-4)}`;
}

function accountIdentifier(account) {
  const identifications = Array.isArray(account?.identifications) ? account.identifications : [];
  const accountId = account?.account_id ?? account?.accountId ?? null;
  if (accountId?.iban) return accountId.iban;
  const iban = identifications.find((item) => (item?.schemeName ?? item?.scheme_name) === "IBAN")?.identification;
  return iban ?? identifications[0]?.identification ?? null;
}

function providerAccountId(account) {
  if (typeof account === "string") return account;
  return account?.uid ?? account?.accountId ?? account?.account_id ?? account?.id ?? account?.resourceId ?? account?.identificationHash ?? account?.identification_hash;
}

function accountLabel(account, bank) {
  if (typeof account === "string") return `${bank.displayName} Konto`;
  return account?.details ?? account?.product ?? account?.name ?? account?.cashAccountType ?? account?.cash_account_type ?? `${bank.displayName} Konto`;
}

function signedBalance(balance) {
  const balanceAmount = balance?.balanceAmount ?? balance?.balance_amount;
  const amount = parseAmount(balanceAmount?.amount);
  if (amount === null) return null;
  return (balance?.creditDebitIndicator ?? balance?.credit_debit_indicator) === "DBIT"
    ? -Math.abs(amount)
    : amount;
}

function balanceType(balance) {
  return balance?.balanceType ?? balance?.balance_type ?? null;
}

function balanceCurrency(balance) {
  return balance?.balanceAmount?.currency ?? balance?.balance_amount?.currency ?? null;
}

function balanceReferenceDate(balance) {
  return (
    balance?.referenceDate ??
    balance?.reference_date ??
    balance?.lastChangeDateTime ??
    balance?.last_change_date_time ??
    null
  );
}

function transactionAmount(transaction) {
  const amountValue = parseAmount(
    transaction?.transaction_amount?.amount ??
      transaction?.transactionAmount?.amount ??
      transaction?.amount,
  );
  if (amountValue === null) return null;
  const indicator = transaction?.credit_debit_indicator ?? transaction?.creditDebitIndicator ?? null;
  if (indicator === "DBIT") return -Math.abs(amountValue);
  if (indicator === "CRDT") return Math.abs(amountValue);
  return amountValue;
}

function transactionCurrency(transaction, fallback = "EUR") {
  return (
    transaction?.transaction_amount?.currency ??
    transaction?.transactionAmount?.currency ??
    transaction?.currency ??
    fallback
  );
}

function remittanceText(transaction) {
  const remittance =
    transaction?.remittance_information ??
    transaction?.remittanceInformation ??
    transaction?.remittance_information_unstructured ??
    transaction?.remittanceInformationUnstructured ??
    [];
  if (Array.isArray(remittance)) return remittance.filter(Boolean).join(" · ");
  return String(remittance ?? "").trim();
}

function partyName(party) {
  return party?.name ?? party?.organisation_name ?? party?.private_name ?? null;
}

function counterpartyName(transaction) {
  const indicator = transaction?.credit_debit_indicator ?? transaction?.creditDebitIndicator ?? null;
  if (indicator === "DBIT") return partyName(transaction?.creditor) ?? partyName(transaction?.debtor) ?? null;
  if (indicator === "CRDT") return partyName(transaction?.debtor) ?? partyName(transaction?.creditor) ?? null;
  return partyName(transaction?.creditor) ?? partyName(transaction?.debtor) ?? null;
}

function counterpartyIban(transaction) {
  const indicator = transaction?.credit_debit_indicator ?? transaction?.creditDebitIndicator ?? null;
  const creditorIban = transaction?.creditor_account?.iban ?? transaction?.creditorAccount?.iban ?? null;
  const debtorIban = transaction?.debtor_account?.iban ?? transaction?.debtorAccount?.iban ?? null;
  if (indicator === "DBIT") return creditorIban ?? debtorIban;
  if (indicator === "CRDT") return debtorIban ?? creditorIban;
  return creditorIban ?? debtorIban;
}

function transactionBookingText(transaction) {
  return (
    remittanceText(transaction) ||
    transaction?.note ||
    transaction?.bank_transaction_code?.description ||
    transaction?.bankTransactionCode?.description ||
    counterpartyName(transaction) ||
    transaction?.entry_reference ||
    transaction?.transaction_id ||
    "Bankumsatz"
  );
}

function classifyBankLedgerEntry(transaction, amount, bookingText) {
  const text = `${bookingText ?? ""} ${transaction?.bank_transaction_code?.description ?? ""}`.toLowerCase();
  if (/kapitalertragsteuer|kest|steuer|tax/.test(text)) return "tax";
  if (/kontofuehrung|kontoführung|kontoentgelt|gebuehr|gebühr|entgelt|spesen|fee|card fee|jahresentgelt/.test(text)) {
    return "fee";
  }
  if (/habenzins|sollzins|zinsen|zins|interest/.test(text)) return "interest";
  if (/cashback|bonus|praemie|prämie/.test(text)) return "bonus";
  return amount >= 0 ? "cash_inflow" : "cash_outflow";
}

function normalizedTransactionId(transaction, account) {
  const accountStableKey = account.identificationHash ?? account.providerAccountId ?? account.accountId;
  const providerReference = transaction?.entry_reference ?? transaction?.entryReference ?? null;
  if (providerReference) {
    return `bank_accounts_ledger_${sanitizeId(account.bankKey)}_${sanitizeId(accountStableKey)}_${sanitizeId(providerReference)}`;
  }
  const amount = transactionAmount(transaction);
  const currency = transactionCurrency(transaction, account.currency);
  const date = transaction?.booking_date ?? transaction?.bookingDate ?? transaction?.value_date ?? transaction?.valueDate ?? transaction?.transaction_date ?? transaction?.transactionDate ?? "";
  return `bank_accounts_ledger_${sanitizeId(account.bankKey)}_${sanitizeId(accountStableKey)}_${stableHash([
    date,
    amount,
    currency,
    transactionBookingText(transaction),
    counterpartyName(transaction),
    transaction?.reference_number ?? transaction?.referenceNumber ?? "",
  ].join("|"))}`;
}

function normalizeBankTransaction(transaction, account, { now }) {
  const amount = transactionAmount(transaction);
  const currency = transactionCurrency(transaction, account.currency);
  const date =
    transaction?.booking_date ??
    transaction?.bookingDate ??
    transaction?.value_date ??
    transaction?.valueDate ??
    transaction?.transaction_date ??
    transaction?.transactionDate ??
    now.toISOString().slice(0, 10);
  const bookingText = transactionBookingText(transaction);
  const category = classifyBankLedgerEntry(transaction, amount ?? 0, bookingText);
  const id = normalizedTransactionId(transaction, account);
  const transactionId =
    transaction?.entry_reference ??
    transaction?.entryReference ??
    transaction?.transaction_id ??
    transaction?.transactionId ??
    id;
  return {
    id,
    source,
    sourceLabel: "Bankkonten",
    sourceChannel: "enable_banking_api",
    importId,
    accountId: account.accountId,
    providerAccountId: account.providerAccountId,
    bankKey: account.bankKey,
    bankName: account.bankName,
    accountLabel: account.label,
    date,
    bookingDate: transaction?.booking_date ?? transaction?.bookingDate ?? null,
    valueDate: transaction?.value_date ?? transaction?.valueDate ?? null,
    transactionDate: transaction?.transaction_date ?? transaction?.transactionDate ?? null,
    bookingText,
    category,
    amount,
    currency,
    status: transaction?.status ?? null,
    creditDebitIndicator: transaction?.credit_debit_indicator ?? transaction?.creditDebitIndicator ?? null,
    counterpartyName: counterpartyName(transaction),
    counterpartyIban: counterpartyIban(transaction),
    merchantCategoryCode: transaction?.merchant_category_code ?? transaction?.merchantCategoryCode ?? null,
    bankTransactionCode: transaction?.bank_transaction_code ?? transaction?.bankTransactionCode ?? null,
    referenceNumber: transaction?.reference_number ?? transaction?.referenceNumber ?? null,
    transactionId,
    naturalKey: id,
    sourceDataProvider: "enable_banking",
    sourceDataUpdatedAt: now,
    updatedAt: now,
    raw: transaction,
  };
}

function uniqueById(documents) {
  return [...new Map(documents.map((document) => [document.id, document])).values()];
}

function summarizeExistingTransactionsByAccount(ledgerEntries) {
  const stats = new Map();
  for (const entry of uniqueById(ledgerEntries)) {
    if (!entry.accountId) continue;
    const current =
      stats.get(entry.accountId) ??
      { totalCount: 0, latestTransactionDate: null };
    current.totalCount += 1;
    current.latestTransactionDate = newestDate([current.latestTransactionDate, entry.date]);
    stats.set(entry.accountId, current);
  }
  return stats;
}

function transactionDateRangeForAccount(accountId, existingTransactionStatsByAccount) {
  const explicitDateFrom = readArg("--date-from") ?? process.env.ENABLE_BANKING_TRANSACTION_DATE_FROM ?? null;
  const dateTo = readArg("--date-to") ?? process.env.ENABLE_BANKING_TRANSACTION_DATE_TO ?? todayIsoDate();
  if (explicitDateFrom) {
    return {
      mode: "explicit_date_range",
      dateFrom: explicitDateFrom,
      dateTo,
      overlapDays: 0,
      previousLatestTransactionDate: existingTransactionStatsByAccount.get(accountId)?.latestTransactionDate ?? null,
    };
  }

  const explicitLookbackDays = readArg("--transaction-days");
  if (explicitLookbackDays) {
    return {
      mode: "explicit_lookback",
      dateFrom: isoDateDaysAgo(Number(explicitLookbackDays)),
      dateTo,
      overlapDays: 0,
      previousLatestTransactionDate: existingTransactionStatsByAccount.get(accountId)?.latestTransactionDate ?? null,
    };
  }

  const existingStats = existingTransactionStatsByAccount.get(accountId);
  const previousLatestTransactionDate = existingStats?.latestTransactionDate ?? null;
  if (previousLatestTransactionDate) {
    const overlapDays = defaultIncrementalOverlapDays;
    return {
      mode: "incremental",
      dateFrom: isoDateShift(previousLatestTransactionDate, -overlapDays) ?? isoDateDaysAgo(overlapDays),
      dateTo,
      overlapDays,
      previousLatestTransactionDate,
    };
  }

  return {
    mode: "initial",
    dateFrom: isoDateDaysAgo(defaultInitialTransactionLookbackDays),
    dateTo,
    overlapDays: 0,
    previousLatestTransactionDate: null,
  };
}

function costEventFromBankLedgerEntry(entry, { now }) {
  if (!["fee", "tax"].includes(entry.category) || typeof entry.amount !== "number") return null;
  return {
    id: `${entry.id}_${entry.category}`,
    source,
    sourceLabel: "Bankkonten",
    sourceChannel: "enable_banking_api",
    importId,
    date: entry.date,
    type: entry.category,
    amount: Math.abs(entry.amount),
    currency: entry.currency,
    accountId: entry.accountId,
    bankKey: entry.bankKey,
    bankName: entry.bankName,
    bookingText: entry.bookingText,
    transactionId: entry.transactionId,
    ledgerEntryId: entry.id,
    sourceDataProvider: "enable_banking",
    updatedAt: now,
  };
}

function incomeEventFromBankLedgerEntry(entry, { now }) {
  if (!["interest", "bonus"].includes(entry.category) || typeof entry.amount !== "number" || entry.amount <= 0) {
    return null;
  }
  return {
    id: `${entry.id}_${entry.category}`,
    source,
    sourceLabel: "Bankkonten",
    sourceChannel: "enable_banking_api",
    importId,
    date: entry.date,
    type: entry.category,
    amount: entry.amount,
    currency: entry.currency,
    accountId: entry.accountId,
    bankKey: entry.bankKey,
    bankName: entry.bankName,
    bookingText: entry.bookingText,
    transactionId: entry.transactionId,
    ledgerEntryId: entry.id,
    sourceDataProvider: "enable_banking",
    updatedAt: now,
  };
}

function selectBalanceInfo(balances) {
  const items = Array.isArray(balances?.balances) ? balances.balances : [];
  const candidates = items
    .filter((balance) => signedBalance(balance) !== null)
    .map((balance) => ({ balance, amount: signedBalance(balance) }));
  const clbd = candidates.filter((item) => balanceType(item.balance) === "CLBD");
  const preferred = clbd.length ? clbd : candidates;
  if (!preferred.length) {
    return {
      currentBalance: null,
      availableBalance: null,
      creditLineEstimate: null,
      balanceCount: items.length,
      balanceAmbiguity: false,
    };
  }
  const sorted = preferred.toSorted((left, right) => left.amount - right.amount);
  const current = sorted[0];
  const available = sorted[sorted.length - 1];
  const amounts = new Set(sorted.map((item) => item.amount));
  const creditLineEstimate =
    sorted.length > 1 && amounts.size > 1 ? roundCurrency(available.amount - current.amount) : null;
  return {
    currentBalance: current.balance,
    availableBalance: available.balance,
    creditLineEstimate,
    balanceCount: items.length,
    balanceAmbiguity: sorted.length > 1 && amounts.size > 1,
  };
}

function newestDate(values) {
  const dates = values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());
  return dates[0]?.toISOString() ?? null;
}

function sessionIdFromResponse(session) {
  return session?.session_id ?? session?.sessionId ?? session?.id ?? session?.uid ?? null;
}

function normalizeAccount(account, session) {
  if (typeof account !== "string") return account;
  const accountData = Array.isArray(session.accounts_data)
    ? session.accounts_data.find((item) => providerAccountId(item) === account)
    : null;
  return { ...(accountData ?? {}), uid: account };
}

function summarizeAccount(account, balances, bank) {
  const providerId = providerAccountId(account);
  const balanceInfo = selectBalanceInfo(balances);
  const bestBalance = balanceInfo.currentBalance;
  const availableBalance = balanceInfo.availableBalance;
  const amount = bestBalance ? signedBalance(bestBalance) : null;
  const availableAmount = availableBalance ? signedBalance(availableBalance) : null;
  const identifier = typeof account === "string" ? null : accountIdentifier(account);
  const currency =
    balanceCurrency(bestBalance) ??
    balanceCurrency(availableBalance) ??
    (typeof account === "string" ? null : account.currency) ??
    "EUR";
  const bankDataDate = balanceReferenceDate(bestBalance) ?? balanceReferenceDate(availableBalance);

  return {
    accountId: `${bank.key}:${providerId}`,
    providerAccountId: providerId,
    bankKey: bank.key,
    bankName: bank.displayName,
    label: accountLabel(account, bank),
    ibanMasked: maskIban(identifier),
    identificationHash: typeof account === "string" ? null : account.identificationHash ?? account.identification_hash ?? null,
    accountType: typeof account === "string" ? "unknown" : account.cashAccountType ?? account.cash_account_type ?? "unknown",
    currency,
    currentValue: typeof amount === "number" ? roundCurrency(amount) : null,
    availableWithCredit: typeof availableAmount === "number" ? roundCurrency(availableAmount) : null,
    creditLineEstimate: balanceInfo.creditLineEstimate,
    balanceType: balanceType(bestBalance),
    creditDebitIndicator: bestBalance?.creditDebitIndicator ?? bestBalance?.credit_debit_indicator ?? null,
    balanceCount: balanceInfo.balanceCount,
    balanceAmbiguity: balanceInfo.balanceAmbiguity,
    sourceDataUpdatedAt: bankDataDate,
    rawAccount: {
      product: typeof account === "string" ? null : account.product ?? null,
      details: typeof account === "string" ? null : account.details ?? null,
      cashAccountType: typeof account === "string" ? null : account.cashAccountType ?? account.cash_account_type ?? null,
      holderPresent: Boolean(typeof account !== "string" && account.holder),
    },
  };
}

function currentViennaDateKey() {
  return viennaDateKey();
}

async function readRateLimitState() {
  try {
    return JSON.parse(await fs.readFile(rateLimitPath, "utf8"));
  } catch {
    return {};
  }
}

async function writeRateLimitState(state) {
  await fs.mkdir(path.dirname(rateLimitPath), { recursive: true });
  await fs.writeFile(rateLimitPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function reserveBankRead(bank) {
  if (!bank.maxReadsPerDay) return { allowed: true, count: null };
  const dateKey = currentViennaDateKey();
  const state = await readRateLimitState();
  const entry =
    state[bank.key]?.date === dateKey
      ? state[bank.key]
      : { date: dateKey, count: 0, maxReadsPerDay: bank.maxReadsPerDay };
  if (entry.count >= bank.maxReadsPerDay) {
    return {
      allowed: false,
      count: entry.count,
      maxReadsPerDay: bank.maxReadsPerDay,
      reason: `${bank.displayName}: Tageslimit ${bank.maxReadsPerDay} Abrufe erreicht`,
    };
  }
  entry.count += 1;
  entry.maxReadsPerDay = bank.maxReadsPerDay;
  entry.lastReservedAt = new Date().toISOString();
  state[bank.key] = entry;
  await writeRateLimitState(state);
  return { allowed: true, count: entry.count, maxReadsPerDay: bank.maxReadsPerDay };
}

async function handleAuthorizationStart(client) {
  const bank = findBank(readArg("--bank") ?? process.env.ENABLE_BANKING_BANK ?? "erste");
  const validUntil =
    readArg("--valid-until") ??
    process.env.ENABLE_BANKING_VALID_UNTIL ??
    new Date(Date.now() + 155 * 24 * 60 * 60 * 1000).toISOString();
  const redirectUri =
    readArg("--redirect-uri") ??
    process.env.ENABLE_BANKING_REDIRECT_URI ??
    "https://finanzperformance-tool.web.app/open-banking/callback";
  const state = `${source}_${bank.key}_${runId}`;
  const response = await client.startAuthorization({
    access: {
      balances: true,
      transactions: true,
      valid_until: validUntil,
    },
    aspsp: {
      name: bank.aspspName,
      country: bank.country,
    },
    psu_type: "personal",
    redirect_url: redirectUri,
    state,
    language: "de",
  });
  const authorizationUri = response?.authorizationUri ?? response?.authorization_uri ?? response?.url;
  if (!authorizationUri) throw new Error("Enable Banking lieferte keine Authorization-URL.");
  await writeKeychainSecret("finanztool.enablebanking.pendingState", state);
  await writeKeychainSecret(pendingBankService(), bank.key);
  await writeKeychainSecret(
    "finanztool.enablebanking.pendingAuthorizationId",
    response?.authorization_id ?? response?.authorizationId ?? "",
  );
  await writeKeychainSecret("finanztool.enablebanking.validUntil", validUntil);
  if (openAuth) {
    await execFileAsync("open", [authorizationUri]);
    console.log(`[ok] ${bank.displayName}-Authorisierung im Browser geoeffnet.`);
  } else {
    console.log(JSON.stringify({ authorizationUri, bank: bank.key, state, validUntil, redirectUri }, null, 2));
  }
}

async function handleAuthorizationCallback(client, code) {
  const bank = findBank(readArg("--bank") ?? process.env.ENABLE_BANKING_BANK ?? (await readKeychainSecret(pendingBankService())) ?? "erste");
  const session = await client.createSession(code);
  const sessionId = sessionIdFromResponse(session);
  if (!sessionId) throw new Error("Enable Banking Session-Antwort enthaelt keine Session-ID.");
  await storeBankSessionId(bank, sessionId);
  console.log(JSON.stringify({ status: "OK", bank: bank.key, sessionStored: true }, null, 2));
}

async function readBankSnapshots(client, bank, { existingTransactionStatsByAccount = new Map() } = {}) {
  const sessionId = await readBankSessionId(bank);
  if (!sessionId) {
    return {
      accountSnapshots: [],
      transactionStats: [],
      ledgerEntries: [],
      skippedBank: {
        bank: bank.key,
        label: bank.displayName,
        reason: "Keine Enable-Banking-Session gespeichert",
      },
    };
  }

  const reservation = await reserveBankRead(bank);
  if (!reservation.allowed) {
    return {
      accountSnapshots: [],
      transactionStats: [],
      ledgerEntries: [],
      skippedBank: {
        bank: bank.key,
        label: bank.displayName,
        reason: reservation.reason,
      },
    };
  }

  const session = await client.getSession(sessionId);
  const accounts = Array.isArray(session.accounts) ? session.accounts : [];
  if (!accounts.length) {
    return {
      accountSnapshots: [],
      transactionStats: [],
      ledgerEntries: [],
      skippedBank: {
        bank: bank.key,
        label: bank.displayName,
        reason: "Session enthaelt keine Konten",
      },
      rateLimitReservation: bank.maxReadsPerDay ? reservation : null,
    };
  }

  const accountSnapshots = [];
  const transactionStats = [];
  const ledgerEntries = [];
  const transactionStatus = readArg("--transaction-status") ?? process.env.ENABLE_BANKING_TRANSACTION_STATUS ?? "BOOK";
  const strategy = readArg("--transaction-strategy") ?? process.env.ENABLE_BANKING_TRANSACTION_STRATEGY ?? undefined;
  for (const rawAccount of accounts) {
    const account = normalizeAccount(rawAccount, session);
    const id = providerAccountId(account);
    if (!id) continue;
    const balances = await client.getBalances(id);
    const snapshot = summarizeAccount(account, balances, bank);
    accountSnapshots.push(snapshot);

    if (includeTransactions) {
      const dateRange = transactionDateRangeForAccount(snapshot.accountId, existingTransactionStatsByAccount);
      let continuationKey = null;
      let count = 0;
      let pageCount = 0;
      let maxPagesReached = false;
      let latestTransactionDate = null;
      do {
        pageCount += 1;
        const page = await client.getTransactions(id, {
          dateFrom: dateRange.dateFrom,
          dateTo: dateRange.dateTo,
          continuationKey,
          transactionStatus,
          strategy,
        });
        const transactions = Array.isArray(page.transactions) ? page.transactions : [];
        const normalizedTransactions = transactions.map((transaction) =>
          normalizeBankTransaction(transaction, snapshot, { now: new Date() }),
        );
        ledgerEntries.push(...normalizedTransactions);
        count += transactions.length;
        const newestTransactionDate = newestDate(normalizedTransactions.map((entry) => entry.date));
        latestTransactionDate = newestDate([latestTransactionDate, newestTransactionDate]);
        continuationKey = page.continuationKey ?? page.continuation_key ?? null;
        if (continuationKey && pageCount >= maxTransactionPages) {
          maxPagesReached = true;
          continuationKey = null;
        }
      } while (continuationKey);
      transactionStats.push({
        accountId: snapshot.accountId,
        bank: bank.key,
        fetchedCount: count,
        pageCount,
        maxPagesReached,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        mode: dateRange.mode,
        overlapDays: dateRange.overlapDays,
        previousLatestTransactionDate: dateRange.previousLatestTransactionDate,
        transactionStatus,
        strategy: strategy ?? "default",
        latestTransactionDate,
      });
    }
  }

  return {
    accountSnapshots,
    transactionStats,
    ledgerEntries,
    rateLimitReservation: bank.maxReadsPerDay ? reservation : null,
  };
}

async function main() {
  const code = normalizeAuthCode(readArg("--code") ?? process.env.ENABLE_BANKING_AUTH_CODE);
  const client = await createEnableBankingClientFromLocalSecrets();

  if (startAuth) {
    await handleAuthorizationStart(client);
    return;
  }

  if (code) {
    await handleAuthorizationCallback(client, code);
    return;
  }

  const allAccountSnapshots = [];
  const allTransactionStats = [];
  const allLedgerEntries = [];
  const skippedBanks = [];
  const bankErrors = [];
  const rateLimitReservations = [];
  const firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  const existingSourceLedgerEntries = includeTransactions
    ? (await firestore.listDocuments("ledgerEntries")).filter((entry) => entry.source === source)
    : [];
  const existingTransactionStatsByAccount = summarizeExistingTransactionsByAccount(existingSourceLedgerEntries);

  for (const bank of bankConfigs) {
    try {
      const result = await readBankSnapshots(client, bank, { existingTransactionStatsByAccount });
      allAccountSnapshots.push(...result.accountSnapshots);
      allTransactionStats.push(...result.transactionStats);
      allLedgerEntries.push(...result.ledgerEntries);
      if (result.skippedBank) skippedBanks.push(result.skippedBank);
      if (result.rateLimitReservation) rateLimitReservations.push({ bank: bank.key, ...result.rateLimitReservation });
    } catch (error) {
      bankErrors.push({
        bank: bank.key,
        label: bank.displayName,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!allAccountSnapshots.length && bankErrors.length) {
    throw new Error(bankErrors.map((error) => `${error.label}: ${error.message}`).join("; "));
  }

  const now = new Date();
  const validAccounts = allAccountSnapshots.filter((account) => typeof account.currentValue === "number");
  const totalValue = roundCurrency(validAccounts.reduce((sum, account) => sum + account.currentValue, 0));
  const totalAvailableWithCredit = roundCurrency(
    validAccounts.reduce((sum, account) => sum + (account.availableWithCredit ?? account.currentValue), 0),
  );
  const totalCreditLineEstimate = roundCurrency(
    validAccounts.reduce((sum, account) => sum + (account.creditLineEstimate ?? 0), 0),
  );
  const sourceDataUpdatedAt = newestDate(validAccounts.map((account) => account.sourceDataUpdatedAt)) ?? now.toISOString();
  const status = bankErrors.length || skippedBanks.length ? "WARNUNG" : "OK";
  const result = {
    mode: writeEnabled ? "write" : "dry-run",
    source,
    status,
    accountCount: allAccountSnapshots.length,
    valuedAccountCount: validAccounts.length,
    skippedBanks,
    bankErrors,
    rateLimitReservations,
    currentValue: totalValue,
    availableWithCredit: totalAvailableWithCredit,
    creditLineEstimate: totalCreditLineEstimate || null,
    sourceDataUpdatedAt,
    accounts: allAccountSnapshots.map((account) => ({
      bank: account.bankName,
      label: account.label,
      ibanMasked: account.ibanMasked,
      accountType: account.accountType,
      currency: account.currency,
      currentValue: account.currentValue,
      availableWithCredit: account.availableWithCredit,
      creditLineEstimate: account.creditLineEstimate,
      balanceType: account.balanceType,
      balanceCount: account.balanceCount,
      balanceAmbiguity: account.balanceAmbiguity,
      sourceDataUpdatedAt: account.sourceDataUpdatedAt,
    })),
    transactionStats: allTransactionStats,
    ledgerEntryCount: allLedgerEntries.length,
    existingLedgerEntryCount: existingSourceLedgerEntries.length,
  };

  if (!writeEnabled) {
    console.log(JSON.stringify(result, null, 2));
    console.log("[dry-run] Keine Firestore-Daten geaendert. Fuer Schreiben --write verwenden.");
    return;
  }

  const ledgerEntries = uniqueById(allLedgerEntries);
  const existingLedgerEntryIds = new Set(existingSourceLedgerEntries.map((entry) => entry.id));
  const historicalTransactionStatsByAccount = summarizeExistingTransactionsByAccount([
    ...existingSourceLedgerEntries,
    ...ledgerEntries,
  ]);
  const transactionWriteStatsByAccount = new Map();
  for (const entry of ledgerEntries) {
    const current =
      transactionWriteStatsByAccount.get(entry.accountId) ??
      { newCount: 0, duplicateCount: 0, writtenCount: 0, latestTransactionDate: null };
    if (existingLedgerEntryIds.has(entry.id)) current.duplicateCount += 1;
    else current.newCount += 1;
    current.writtenCount += 1;
    current.latestTransactionDate = newestDate([current.latestTransactionDate, entry.date]);
    transactionWriteStatsByAccount.set(entry.accountId, current);

    await firestore.setDocument("ledgerEntries", entry.id, entry);
    await firestore.setDocument("sourceDocumentFacts", entry.id, {
      ...entry,
      factType: "bank_transaction",
      parseStatus: "OK",
      ledgerEntryId: entry.id,
    });
    const costEvent = costEventFromBankLedgerEntry(entry, { now });
    if (costEvent) await firestore.setDocument("costEvents", costEvent.id, costEvent);
    const incomeEvent = incomeEventFromBankLedgerEntry(entry, { now });
    if (incomeEvent) await firestore.setDocument("incomeEvents", incomeEvent.id, incomeEvent);
  }

  const transactionWriteStats = [...transactionWriteStatsByAccount.entries()].map(([accountId, stats]) => ({
    accountId,
    ...stats,
  }));
  const transactionTotals = transactionWriteStats.reduce(
    (totals, stats) => ({
      newCount: totals.newCount + stats.newCount,
      duplicateCount: totals.duplicateCount + stats.duplicateCount,
      writtenCount: totals.writtenCount + stats.writtenCount,
    }),
    { newCount: 0, duplicateCount: 0, writtenCount: 0 },
  );

  const existingAccounts = (await firestore.listDocuments("sourceAccounts")).filter(
    (entry) => entry.source === source,
  );
  const currentAccountIds = new Set(allAccountSnapshots.map((account) => account.accountId));
  for (const existing of existingAccounts) {
    if (!currentAccountIds.has(existing.accountId)) {
      await firestore.setDocument("sourceAccounts", existing.id, {
        ...existing,
        status: "MISSING",
        lastMissingAt: now,
        updatedAt: now,
      });
    }
  }

  const existingPositions = (await firestore.listDocuments("sourcePositions")).filter(
    (entry) => entry.source === source,
  );
  for (const existing of existingPositions) {
    if (!currentAccountIds.has(existing.accountId)) {
      await firestore.setDocument("sourcePositions", existing.id, {
        ...existing,
        accountValueIncluded: false,
        status: "MISSING",
        lastMissingAt: now,
        updatedAt: now,
      });
    }
  }

  for (const account of allAccountSnapshots) {
    const id = `bank_accounts_${sanitizeId(account.accountId)}`;
    const transactionWriteStats = transactionWriteStatsByAccount.get(account.accountId);
    const transactionFetchStats = allTransactionStats.find((item) => item.accountId === account.accountId);
    const historicalTransactionStats = historicalTransactionStatsByAccount.get(account.accountId);
    await firestore.setDocument("sourceAccounts", id, {
      source,
      accountId: account.accountId,
      providerAccountId: account.providerAccountId,
      bankKey: account.bankKey,
      bankName: account.bankName,
      label: account.label,
      accountType: account.accountType,
      currency: account.currency,
      ibanMasked: account.ibanMasked,
      identificationHash: account.identificationHash,
      status: "ACTIVE",
      currentValue: account.currentValue,
      cashValue: account.currentValue,
      availableWithCredit: account.availableWithCredit,
      creditLineEstimate: account.creditLineEstimate,
      balanceCount: account.balanceCount,
      balanceAmbiguity: account.balanceAmbiguity,
      balanceType: account.balanceType,
      transactionCount: historicalTransactionStats?.totalCount ?? transactionWriteStats?.writtenCount ?? transactionFetchStats?.fetchedCount ?? null,
      transactionSyncedCount: transactionWriteStats?.writtenCount ?? transactionFetchStats?.fetchedCount ?? null,
      transactionNewCount: transactionWriteStats?.newCount ?? null,
      transactionDuplicateCount: transactionWriteStats?.duplicateCount ?? null,
      latestTransactionDate: historicalTransactionStats?.latestTransactionDate ?? transactionWriteStats?.latestTransactionDate ?? transactionFetchStats?.latestTransactionDate ?? null,
      sourceDataProvider: "enable_banking",
      sourceDataUpdatedAt: account.sourceDataUpdatedAt,
      lastSeenAt: now,
      updatedAt: now,
      importId,
    });
    await firestore.setDocument("sourcePositions", id, {
      id,
      source,
      accountId: account.accountId,
      providerAccountId: account.providerAccountId,
      bankKey: account.bankKey,
      bankName: account.bankName,
      name: `${account.bankName}: ${account.label}`,
      category: "cash",
      currency: account.currency,
      quantity: 1,
      currentValue: account.currentValue,
      cashValue: account.currentValue,
      availableWithCredit: account.availableWithCredit,
      creditLineEstimate: account.creditLineEstimate,
      balanceCount: account.balanceCount,
      balanceAmbiguity: account.balanceAmbiguity,
      transactionCount: historicalTransactionStats?.totalCount ?? transactionWriteStats?.writtenCount ?? transactionFetchStats?.fetchedCount ?? null,
      transactionSyncedCount: transactionWriteStats?.writtenCount ?? transactionFetchStats?.fetchedCount ?? null,
      latestTransactionDate: historicalTransactionStats?.latestTransactionDate ?? transactionWriteStats?.latestTransactionDate ?? transactionFetchStats?.latestTransactionDate ?? null,
      accountValueIncluded: true,
      sourceDataProvider: "enable_banking",
      sourceDataUpdatedAt: account.sourceDataUpdatedAt,
      valuationDate: account.sourceDataUpdatedAt,
      valuationMethod: "enable_banking_balances_v1",
      status: "ACTIVE",
      updatedAt: now,
      importId,
    });
  }

  await firestore.setDocument("sourceSummaries", source, {
    source,
    displayName: "Bankkonten",
    currentValue: totalValue,
    cashValue: totalValue,
    netValue: totalValue,
    availableWithCredit: totalAvailableWithCredit,
    creditLineEstimate: totalCreditLineEstimate || null,
    positionCount: allAccountSnapshots.length,
    accountCount: allAccountSnapshots.length,
    accounts: allAccountSnapshots.map((account) => {
      const writeStats = transactionWriteStatsByAccount.get(account.accountId);
      const fetchStats = allTransactionStats.find((item) => item.accountId === account.accountId);
      const historicalStats = historicalTransactionStatsByAccount.get(account.accountId);
      return {
        accountId: account.accountId,
        bankKey: account.bankKey,
        bankName: account.bankName,
        label: account.label,
        accountNumber: account.ibanMasked,
        providerAccountId: account.providerAccountId,
        currentValue: account.currentValue,
        cashValue: account.currentValue,
        availableWithCredit: account.availableWithCredit,
        creditLineEstimate: account.creditLineEstimate,
        valuationDate: account.sourceDataUpdatedAt,
        positionCount: 1,
        transactionCount: historicalStats?.totalCount ?? writeStats?.writtenCount ?? fetchStats?.fetchedCount ?? null,
        transactionSyncedCount: writeStats?.writtenCount ?? fetchStats?.fetchedCount ?? null,
        transactionNewCount: writeStats?.newCount ?? null,
        transactionDuplicateCount: writeStats?.duplicateCount ?? null,
        latestTransactionDate: historicalStats?.latestTransactionDate ?? writeStats?.latestTransactionDate ?? fetchStats?.latestTransactionDate ?? null,
      };
    }),
    skippedBanks,
    bankErrors,
    rateLimitReservations,
    sourceDataProvider: "enable_banking",
    sourceDataUpdatedAt,
    valuationDate: sourceDataUpdatedAt,
    lastAgentRunAt: now,
    lastAgentSuccessAt: now,
    status,
    valuationMethod: "enable_banking_balances_v1",
    updatedAt: now,
    importId,
  });

  await firestore.setDocument("imports", importId, {
    source,
    parser: "enable_banking_balances_v1",
    status: "IMPORTED",
    accountCount: allAccountSnapshots.length,
    currentValue: totalValue,
    availableWithCredit: totalAvailableWithCredit,
    creditLineEstimate: totalCreditLineEstimate || null,
    sourceDataUpdatedAt,
    transactionStats: allTransactionStats,
    transactionWriteStats,
    transactionTotals,
    existingLedgerEntryCount: existingSourceLedgerEntries.length,
    ledgerEntryCount: ledgerEntries.length,
    skippedBanks,
    bankErrors,
    rateLimitReservations,
    runId,
    updatedAt: now,
  });

  const messageParts = [
    `${allAccountSnapshots.length} Konto/Konten, ${totalValue.toFixed(2)} EUR Geldstand`,
    totalCreditLineEstimate > 0
      ? `Kreditlinie ca. ${totalCreditLineEstimate.toFixed(2)} EUR`
      : null,
    includeTransactions
      ? `${transactionTotals.writtenCount} Umsatz/Umsaetze geprueft, ${transactionTotals.newCount} neu`
      : null,
    skippedBanks.length ? `${skippedBanks.length} Bank(en) ohne Abruf` : null,
    bankErrors.length ? `${bankErrors.length} Bank-Fehler` : null,
  ].filter(Boolean);

  await firestore.setDocument("agentStatus", source, {
    source,
    status,
    message: messageParts.join("; "),
    lastAgentRunAt: now,
    lastAgentSuccessAt: allAccountSnapshots.length ? now : null,
    lastSuccessAt: allAccountSnapshots.length ? now : null,
    sourceDataUpdatedAt,
    currentValue: totalValue,
    ledgerEntryCount: ledgerEntries.length,
    transactionStats: allTransactionStats,
    transactionWriteStats,
    transactionTotals,
    existingLedgerEntryCount: existingSourceLedgerEntries.length,
    skippedBanks,
    bankErrors,
    rateLimitReservations,
    importId,
    updatedAt: now,
  });

  await writeKeychainSecret("finanztool.enablebanking.lastImportId", importId);
  console.log(JSON.stringify({ ...result, transactionTotals, written: true, importId }, null, 2));
}

try {
  await main();
} catch (error) {
  const now = new Date();
  if (writeEnabled) {
    try {
      const firestore = new FirestoreRest({
        projectId,
        accessToken: await getFirebaseCliAccessToken(),
      });
      await firestore.setDocument("agentStatus", source, {
        source,
        status: "FEHLER",
        message: error instanceof Error ? error.message : String(error),
        lastAgentRunAt: now,
        lastFailureAt: now,
        updatedAt: now,
      });
    } catch {
      // Keep the original Enable Banking error visible below.
    }
  }
  console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
