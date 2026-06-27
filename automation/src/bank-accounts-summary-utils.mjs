export const bankAccountsSource = "bank_accounts";

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function parseMaybeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function newestDate(values) {
  const dates = values.map(parseMaybeDate).filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
}

function isActiveRecord(record) {
  return record?.status !== "MISSING" && record?.status !== "CLOSED" && record?.status !== "DELETED";
}

function accountSummaryFromAccount(account, position) {
  const bankKey = account.bankKey ?? position?.bankKey ?? null;
  const providerSource = account.providerSource ?? position?.providerSource ?? null;
  const rawLabel = account.label ?? position?.name ?? "Konto";
  const label =
    (bankKey === "bank99" || providerSource === "bank99") && String(rawLabel).toLowerCase().startsWith("bank99:")
      ? "bank99 Konto"
      : rawLabel;

  return {
    accountId: account.accountId ?? position?.accountId ?? account.id,
    bankKey,
    bankName: account.bankName ?? position?.bankName ?? null,
    providerSource,
    label,
    agentStatusId: account.agentStatusId ?? position?.agentStatusId ?? null,
    accountType: account.accountType ?? position?.category ?? null,
    accountNumber: account.ibanMasked ?? account.accountNumber ?? null,
    providerAccountId: account.providerAccountId ?? position?.providerAccountId ?? null,
    status: account.status ?? position?.status ?? null,
    staleReason: account.staleReason ?? position?.staleReason ?? null,
    staleIssueType: account.staleIssueType ?? position?.staleIssueType ?? null,
    lastSkippedAt: account.lastSkippedAt ?? position?.lastSkippedAt ?? null,
    lastDataSuccessAt: account.lastDataSuccessAt ?? position?.lastDataSuccessAt ?? null,
    lastSeenAt: account.lastSeenAt ?? position?.lastSeenAt ?? null,
    updatedAt: account.updatedAt ?? position?.updatedAt ?? null,
    sourceDataUpdatedAt: account.sourceDataUpdatedAt ?? position?.sourceDataUpdatedAt ?? null,
    currentValue: account.currentValue ?? position?.currentValue ?? null,
    cashValue: account.cashValue ?? position?.cashValue ?? account.currentValue ?? position?.currentValue ?? null,
    debtValue: account.debtValue ?? position?.debtValue ?? null,
    reservedValue: account.reservedValue ?? position?.reservedValue ?? null,
    availableWithCredit: account.availableWithCredit ?? position?.availableWithCredit ?? null,
    creditLineEstimate: account.creditLineEstimate ?? position?.creditLineEstimate ?? null,
    valuationDate: account.sourceDataUpdatedAt ?? position?.sourceDataUpdatedAt ?? position?.valuationDate ?? null,
    positionCount: 1,
    transactionCount: account.transactionCount ?? position?.transactionCount ?? null,
    transactionSyncedCount: account.transactionSyncedCount ?? position?.transactionSyncedCount ?? null,
    transactionNewCount: account.transactionNewCount ?? null,
    transactionDuplicateCount: account.transactionDuplicateCount ?? null,
    latestTransactionDate: account.latestTransactionDate ?? position?.latestTransactionDate ?? null,
    sourceDataProvider: account.sourceDataProvider ?? position?.sourceDataProvider ?? null,
  };
}

export async function refreshBankAccountsSummary(
  firestore,
  {
    now = new Date(),
    importId = null,
    status = null,
    valuationMethod = "bank_accounts_mixed_sources_v1",
    sourceDataProvider = "mixed_bank_and_credit_card_sources",
    preserveAgentTimestamps = true,
  } = {},
) {
  const [summaries, accounts, positions] = await Promise.all([
    firestore.listDocuments("sourceSummaries"),
    firestore.listDocuments("sourceAccounts"),
    firestore.listDocuments("sourcePositions"),
  ]);
  const existingSummary = summaries.find((entry) => entry.id === bankAccountsSource) ?? {};
  const activeAccounts = accounts.filter((account) => account.source === bankAccountsSource && isActiveRecord(account));
  const activePositions = positions.filter(
    (position) =>
      position.source === bankAccountsSource &&
      position.accountValueIncluded !== false &&
      isActiveRecord(position),
  );
  const positionByAccountId = new Map(activePositions.map((position) => [position.accountId, position]));
  const accountSummaries = activeAccounts.map((account) =>
    accountSummaryFromAccount(account, positionByAccountId.get(account.accountId)),
  );

  for (const position of activePositions) {
    if (!activeAccounts.some((account) => account.accountId === position.accountId)) {
      accountSummaries.push(accountSummaryFromAccount({}, position));
    }
  }

  const valuedAccounts = accountSummaries.filter((account) => typeof account.currentValue === "number");
  const totalValue = roundCurrency(valuedAccounts.reduce((sum, account) => sum + account.currentValue, 0));
  const totalAvailableWithCredit = roundCurrency(
    valuedAccounts.reduce((sum, account) => sum + (account.availableWithCredit ?? account.currentValue), 0),
  );
  const totalCreditLineEstimate = roundCurrency(
    valuedAccounts.reduce((sum, account) => sum + (account.creditLineEstimate ?? 0), 0),
  );
  const sourceDataUpdatedAt =
    newestDate(accountSummaries.map((account) => account.valuationDate)) ??
    existingSummary.sourceDataUpdatedAt ??
    now.toISOString();
  const nextStatus = status ?? existingSummary.status ?? "OK";
  const nextSummary = {
    ...existingSummary,
    source: bankAccountsSource,
    displayName: "Bankkonten",
    currentValue: totalValue,
    cashValue: totalValue,
    netValue: totalValue,
    availableWithCredit: totalAvailableWithCredit,
    creditLineEstimate: totalCreditLineEstimate || null,
    positionCount: accountSummaries.length,
    accountCount: accountSummaries.length,
    accounts: accountSummaries,
    sourceDataProvider,
    sourceDataUpdatedAt,
    valuationDate: sourceDataUpdatedAt,
    status: nextStatus,
    valuationMethod,
    updatedAt: now,
    importId: importId ?? existingSummary.importId ?? null,
  };

  if (!preserveAgentTimestamps) {
    nextSummary.lastAgentRunAt = now;
    nextSummary.lastAgentSuccessAt = now;
  }

  await firestore.setDocument("sourceSummaries", bankAccountsSource, nextSummary);
  return nextSummary;
}
