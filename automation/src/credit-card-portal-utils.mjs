import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { bankAccountsSource, refreshBankAccountsSummary } from "./bank-accounts-summary-utils.mjs";

export function defaultChromePath() {
  return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}

export async function launchCreditCardBrowser(profileName, { headless = false } = {}) {
  const profilePath = path.join(os.homedir(), ".finanztool", "browser-profiles", profileName);
  await fs.mkdir(profilePath, { recursive: true });
  const context = await chromium.launchPersistentContext(profilePath, {
    executablePath: process.env.CREDIT_CARD_CHROME_PATH ?? defaultChromePath(),
    headless,
    acceptDownloads: true,
    viewport: { width: 1400, height: 1000 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page, profilePath };
}

export function parseEuro(value) {
  const normalized = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function roundCurrency(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

export function timestampRunId(prefix, date = new Date()) {
  return `${prefix}_${date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
}

export async function clickOptionalButton(page, pattern, { timeout = 1500 } = {}) {
  const button = page.getByRole("button", { name: pattern }).first();
  if (await button.isVisible({ timeout }).catch(() => false)) {
    await button.click({ timeout });
    return true;
  }
  return false;
}

export async function writeCreditCardSnapshot(firestore, snapshot, { writeEnabled, now = new Date() } = {}) {
  const importId = snapshot.importId ?? timestampRunId(`portal_${snapshot.source}`, now);
  if (!writeEnabled) return { importId, written: false };

  const accountId = `${snapshot.source}_card`;
  const accountDocumentId = `${bankAccountsSource}_${accountId}`;
  const positionId = accountDocumentId;
  await firestore.deleteDocument("sourceAccounts", accountId).catch(() => {});
  await firestore.deleteDocument("sourcePositions", accountId).catch(() => {});
  await firestore.setDocument("sourceAccounts", accountDocumentId, {
    source: bankAccountsSource,
    providerSource: snapshot.source,
    bankKey: snapshot.source,
    agentStatusId: snapshot.source,
    accountId,
    label: snapshot.displayName,
    bankName: snapshot.displayName,
    accountType: "credit_card",
    currency: snapshot.currency ?? "EUR",
    status: "ACTIVE",
    currentValue: snapshot.currentValue,
    debtValue: snapshot.debtValue,
    reservedValue: snapshot.reservedValue,
    availableWithCredit: snapshot.availableWithCredit,
    creditLineEstimate: snapshot.creditLineEstimate,
    sourceDataProvider: snapshot.sourceDataProvider,
    sourceDataUpdatedAt: snapshot.sourceDataUpdatedAt,
    lastSeenAt: now,
    updatedAt: now,
    importId,
  });

  await firestore.setDocument("sourcePositions", positionId, {
    id: positionId,
    source: bankAccountsSource,
    providerSource: snapshot.source,
    bankKey: snapshot.source,
    agentStatusId: snapshot.source,
    accountId,
    bankName: snapshot.displayName,
    name: snapshot.displayName,
    category: "credit_card",
    currency: snapshot.currency ?? "EUR",
    quantity: 1,
    currentValue: snapshot.currentValue,
    cashValue: snapshot.currentValue,
    debtValue: snapshot.debtValue,
    reservedValue: snapshot.reservedValue,
    availableWithCredit: snapshot.availableWithCredit,
    creditLineEstimate: snapshot.creditLineEstimate,
    accountValueIncluded: true,
    sourceDataProvider: snapshot.sourceDataProvider,
    sourceDataUpdatedAt: snapshot.sourceDataUpdatedAt,
    valuationDate: snapshot.valuationDate,
    valuationMethod: snapshot.valuationMethod,
    status: "ACTIVE",
    updatedAt: now,
    importId,
  });

  await refreshBankAccountsSummary(firestore, {
    now,
    importId,
    status: "OK",
    valuationMethod: "bank_accounts_with_credit_cards_v1",
    sourceDataProvider: "mixed_bank_and_credit_card_sources",
  });

  await firestore.setDocument("sourceSummaries", snapshot.source, {
    source: snapshot.source,
    displayName: snapshot.displayName,
    currentValue: snapshot.currentValue,
    cashValue: snapshot.currentValue,
    netValue: snapshot.currentValue,
    debtValue: snapshot.debtValue,
    reservedValue: snapshot.reservedValue,
    availableWithCredit: snapshot.availableWithCredit,
    creditLineEstimate: snapshot.creditLineEstimate,
    valuationDate: snapshot.valuationDate,
    positionCount: 1,
    accountCount: 1,
    accounts: [
      {
        accountId,
        providerSource: snapshot.source,
        bankKey: snapshot.source,
        agentStatusId: snapshot.source,
        label: snapshot.displayName,
        accountType: "credit_card",
        currentValue: snapshot.currentValue,
        cashValue: snapshot.currentValue,
        debtValue: snapshot.debtValue,
        reservedValue: snapshot.reservedValue,
        availableWithCredit: snapshot.availableWithCredit,
        creditLineEstimate: snapshot.creditLineEstimate,
      },
    ],
    status: snapshot.status ?? "VERIFIED",
    sourceDataProvider: snapshot.sourceDataProvider,
    sourceDataUpdatedAt: snapshot.sourceDataUpdatedAt,
    lastAgentRunAt: now,
    lastAgentSuccessAt: now,
    valuationMethod: snapshot.valuationMethod,
    updatedAt: now,
    importId,
  });

  await firestore.setDocument("imports", importId, {
    source: snapshot.source,
    parser: snapshot.valuationMethod,
    status: "IMPORTED",
    currentValue: snapshot.currentValue,
    debtValue: snapshot.debtValue,
    reservedValue: snapshot.reservedValue,
    availableWithCredit: snapshot.availableWithCredit,
    creditLineEstimate: snapshot.creditLineEstimate,
    valuationDate: snapshot.valuationDate,
    updatedAt: now,
  });

  await firestore.setDocument("agentStatus", snapshot.source, {
    source: snapshot.source,
    status: "OK",
    message: `${snapshot.displayName}: Saldo ${snapshot.currentValue.toFixed(2)} EUR, verfuegbar ${snapshot.availableWithCredit?.toFixed?.(2) ?? "n/a"} EUR`,
    lastAgentRunAt: now,
    lastAgentSuccessAt: now,
    lastSuccessAt: now,
    valuationDate: snapshot.valuationDate,
    currentValue: snapshot.currentValue,
    debtValue: snapshot.debtValue,
    importId,
    updatedAt: now,
  });

  return { importId, written: true };
}
