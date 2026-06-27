import { normalizeEventCollections, normalizeEventDocument } from "./event-model.mjs";

const source = "ginmon";
const sourceLabel = "Ginmon";

function hasNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function nonZeroNumber(value) {
  return hasNumber(value) && value !== 0;
}

function roundCurrency(value) {
  return hasNumber(value) ? Math.round(value * 100) / 100 : value;
}

function negativeCost(value) {
  return nonZeroNumber(value) ? -Math.abs(value) : null;
}

function parseGermanSignedAmount(text) {
  const match = String(text ?? "").match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})([+-])/);
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return match[2] === "-" ? -value : value;
}

function cashAmountFromTrade(fact) {
  const amount = hasNumber(fact.cashAmount) ? Math.abs(fact.cashAmount) : Math.abs(fact.grossAmount ?? 0);
  if (!amount) return null;
  return fact.side === "buy" ? -roundCurrency(amount) : roundCurrency(amount);
}

function baseEvent(fact, now) {
  return {
    source,
    sourceLabel,
    importId: fact.documentId ?? null,
    sourceDocumentId: fact.documentId ?? null,
    sourceDocumentFactId: fact.id ?? null,
    documentType: fact.documentType ?? null,
    factType: fact.factType ?? null,
    accountNumber: fact.accountNumber ?? null,
    customerId: fact.customerId ?? null,
    updatedAt: now,
  };
}

function cleanName(name) {
  return String(name ?? "").replace(/\s+/g, " ").trim() || null;
}

function uniqueFacts(facts) {
  const seen = new Set();
  const unique = [];
  for (const fact of facts) {
    const key = fact.dedupeKey || `${fact.factType}|${fact.documentId}|${fact.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(fact);
  }
  return unique;
}

function uniqueEvents(events) {
  const uniqueById = new Map();
  for (const event of events) {
    if (!uniqueById.has(event.id)) uniqueById.set(event.id, event);
  }
  return [...uniqueById.values()];
}

function addTrade(events, fact, now) {
  if (!fact.isin || !fact.side) return;
  const amount = cashAmountFromTrade(fact);
  const id = `ginmon_tx_${fact.id}`;
  events.transactions.push({
    id,
    ...baseEvent(fact, now),
    type: "security_trade",
    category: "trade",
    side: fact.side,
    date: fact.tradeDate ?? fact.settlementDate ?? fact.settlementDocumentDate ?? null,
    settlementDate: fact.settlementDate ?? null,
    tradeTime: fact.tradeTime ?? null,
    bookingText: `${fact.side === "sell" ? "Verkauf" : "Kauf"} ${cleanName(fact.name) ?? fact.isin}`.trim(),
    isin: fact.isin ?? null,
    name: cleanName(fact.name),
    quantity: fact.quantity ?? null,
    price: fact.price ?? null,
    grossAmount: fact.grossAmount ?? null,
    amount,
    currency: fact.currency ?? "EUR",
    transactionId: fact.settlementNumber ?? fact.id,
    brokerTransactionNumber: fact.settlementNumber ?? null,
    exchange: fact.exchange ?? null,
    dedupeKey: fact.dedupeKey ?? fact.id,
  });

  if (hasNumber(amount)) {
    events.ledgerEntries.push({
      id: `ginmon_ledger_trade_${fact.id}`,
      ...baseEvent(fact, now),
      date: fact.settlementDate ?? fact.tradeDate ?? fact.settlementDocumentDate ?? null,
      bookingText: `${fact.side === "sell" ? "Wertpapierverkauf" : "Wertpapierkauf"} ${cleanName(fact.name) ?? fact.isin}`.trim(),
      category: "security_trade_cash",
      amount,
      currency: fact.currency ?? "EUR",
      isin: fact.isin ?? null,
      name: cleanName(fact.name),
      quantity: fact.quantity ?? null,
      price: fact.price ?? null,
      transactionId: fact.settlementNumber ?? fact.id,
    });
  }
}

function cashCategory(text, amount) {
  if (/Verwalterpreis|Gebuehrenrechnung|Gebührenrechnung/i.test(text)) return "management_fee";
  if (/Ertrag|Dividende|Aussch/i.test(text)) return "income_distribution_cash";
  if (/SEPA-Lastschrift/i.test(text)) return "cash_inflow";
  if (/SEPA-Überweisung|SEPA-Ueberweisung/i.test(text)) return amount < 0 ? "cash_outflow" : "cash_inflow";
  return amount < 0 ? "cash_outflow" : "cash_inflow";
}

function firstIsin(text) {
  return String(text ?? "").match(/\b([A-Z]{2}[A-Z0-9]{10})\*?\b/)?.[1] ?? null;
}

function addCashLedgerEntry(events, fact, now) {
  const text = String(fact.text ?? "");
  if (/Wertpapierkauf|Wertpapierverkauf/i.test(text)) return;
  const amount = parseGermanSignedAmount(text);
  if (!nonZeroNumber(amount)) return;
  const category = cashCategory(text, amount);
  const id = `ginmon_ledger_cash_${fact.id}`;
  events.ledgerEntries.push({
    id,
    ...baseEvent(fact, now),
    date: fact.valueDate ?? fact.bookingDate ?? null,
    bookingDate: fact.bookingDate ?? null,
    valueDate: fact.valueDate ?? null,
    bookingText: text,
    category,
    amount: roundCurrency(amount),
    currency: fact.currency ?? "EUR",
    isin: firstIsin(text),
    transactionId: fact.dedupeKey ?? fact.id,
    dedupeKey: fact.dedupeKey ?? fact.id,
  });

  if (category === "management_fee") {
    events.costEvents.push({
      id: `ginmon_cost_fee_${fact.id}`,
      ...baseEvent(fact, now),
      type: "management_fee",
      date: fact.valueDate ?? fact.bookingDate ?? null,
      amount: negativeCost(amount),
      currency: fact.currency ?? "EUR",
      cashImpact: true,
      summaryOnly: false,
      transactionId: fact.dedupeKey ?? fact.id,
      dedupeKey: fact.dedupeKey ?? fact.id,
    });
  }

  if (category === "income_distribution_cash") {
    events.incomeEvents.push({
      id: `ginmon_income_cash_${fact.id}`,
      ...baseEvent(fact, now),
      type: "distribution",
      date: fact.valueDate ?? fact.bookingDate ?? null,
      amount: roundCurrency(amount),
      netAmount: roundCurrency(amount),
      currency: fact.currency ?? "EUR",
      isin: firstIsin(text),
      transactionId: fact.dedupeKey ?? fact.id,
      dedupeKey: fact.dedupeKey ?? fact.id,
    });
  }
}

function addInvoice(events, fact, now) {
  if (!nonZeroNumber(fact.totalAmount)) return;
  events.costEvents.push({
    id: `ginmon_cost_invoice_${fact.invoiceNumber ?? fact.id}`,
    ...baseEvent(fact, now),
    type: "invoice_management_fee",
    date: fact.invoiceDate ?? null,
    amount: negativeCost(fact.totalAmount),
    currency: "EUR",
    invoiceNumber: fact.invoiceNumber ?? null,
    period: fact.period ?? null,
    baseFee: fact.baseFee ?? null,
    discount: fact.discount ?? null,
    vatIncluded: fact.vatIncluded ?? null,
    cashImpact: false,
    summaryOnly: true,
    possibleDuplicateOfCashLedger: true,
    transactionId: fact.invoiceNumber ?? fact.id,
  });
}

function addEarning(events, fact, now) {
  if (!nonZeroNumber(fact.investmentIncome)) return;
  events.incomeEvents.push({
    id: `ginmon_income_${fact.id}`,
    ...baseEvent(fact, now),
    type: fact.eventType ?? "earning",
    date: fact.paymentDate ?? fact.exDate ?? fact.taxDate ?? null,
    amount: fact.investmentIncome,
    currency: "EUR",
    isin: fact.isin ?? null,
    name: cleanName(fact.name),
    quantity: fact.quantity ?? null,
    yearlyAmountPerShare: fact.yearlyAmountPerShare ?? null,
    fundType: fact.fundType ?? null,
    partialExemptionPct: fact.partialExemptionPct ?? null,
    cashImpact: false,
    summaryOnly: false,
    transactionId: fact.executionNumber ?? fact.id,
  });
}

function addLatestAssetStatusFeeOverviews(events, facts, now) {
  const latestByAccount = new Map();
  for (const fact of facts) {
    if (fact.factType !== "account_snapshot") continue;
    if (!nonZeroNumber(fact.totalFees)) continue;
    const key = fact.accountNumber ?? fact.customerId ?? fact.id;
    const existing = latestByAccount.get(key);
    if (!existing || String(fact.valuationDate ?? "") > String(existing.valuationDate ?? "")) {
      latestByAccount.set(key, fact);
    }
  }

  for (const fact of latestByAccount.values()) {
    events.costEvents.push({
      id: `ginmon_cost_asset_status_${fact.accountNumber ?? fact.customerId ?? fact.id}_${fact.valuationDate ?? "unknown"}`,
      ...baseEvent(fact, now),
      type: "asset_status_fee_overview",
      date: fact.valuationDate ?? null,
      amount: negativeCost(fact.totalFees),
      currency: "EUR",
      managementFees: fact.managementFees ?? null,
      transactionFees: fact.transactionFees ?? null,
      custodyFees: fact.custodyFees ?? null,
      cashImpact: false,
      summaryOnly: true,
      possibleDuplicateOfCashLedger: true,
      transactionId: fact.id,
    });
  }
}

export function buildGinmonEventsFromFacts(facts, now = new Date()) {
  const ginmonFacts = uniqueFacts(facts.filter((fact) => fact.source === source));
  const events = {
    transactions: [],
    ledgerEntries: [],
    costEvents: [],
    incomeEvents: [],
  };

  for (const fact of ginmonFacts) {
    if (fact.factType === "trade") addTrade(events, fact, now);
    if (fact.factType === "cash_ledger_entry") addCashLedgerEntry(events, fact, now);
    if (fact.factType === "invoice") addInvoice(events, fact, now);
    if (fact.factType === "earning") addEarning(events, fact, now);
  }
  addLatestAssetStatusFeeOverviews(events, ginmonFacts, now);

  return {
    ...normalizeEventCollections({
      transactions: uniqueEvents(events.transactions),
      ledgerEntries: uniqueEvents(events.ledgerEntries),
      costEvents: uniqueEvents(events.costEvents),
      incomeEvents: uniqueEvents(events.incomeEvents),
    }, now),
  };
}

async function deleteExistingSourceDocuments(firestore, collection) {
  const existing = (await firestore.listDocuments(collection)).filter((document) => document.source === source);
  for (const document of existing) {
    await firestore.deleteDocument(collection, document.id);
  }
  return existing.length;
}

async function writeCollection(firestore, collection, documents) {
  for (const document of documents) {
    const { id, ...data } = normalizeEventDocument(collection, document);
    await firestore.setDocument(collection, id, data);
  }
}

export async function replaceGinmonEvents(firestore, facts, now = new Date()) {
  const events = buildGinmonEventsFromFacts(facts, now);
  const deleted = {
    transactions: await deleteExistingSourceDocuments(firestore, "transactions"),
    ledgerEntries: await deleteExistingSourceDocuments(firestore, "ledgerEntries"),
    costEvents: await deleteExistingSourceDocuments(firestore, "costEvents"),
    incomeEvents: await deleteExistingSourceDocuments(firestore, "incomeEvents"),
  };

  await writeCollection(firestore, "transactions", events.transactions);
  await writeCollection(firestore, "ledgerEntries", events.ledgerEntries);
  await writeCollection(firestore, "costEvents", events.costEvents);
  await writeCollection(firestore, "incomeEvents", events.incomeEvents);

  return {
    deleted,
    written: {
      transactions: events.transactions.length,
      ledgerEntries: events.ledgerEntries.length,
      costEvents: events.costEvents.length,
      incomeEvents: events.incomeEvents.length,
    },
    events,
  };
}
