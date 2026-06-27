import { normalizeEventCollections, normalizeEventDocument } from "./event-model.mjs";

const source = "flatex";
const sourceLabel = "Flatex";

function hasNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function nonZeroNumber(value) {
  return hasNumber(value) && value !== 0;
}

function negativeCost(value) {
  return nonZeroNumber(value) ? -Math.abs(value) : null;
}

function eventDate(fact) {
  return (
    fact.settlementDate ??
    fact.paymentDate ??
    fact.inflowDate ??
    fact.tradeDate ??
    fact.valuationDate ??
    fact.documentDate ??
    null
  );
}

function isReversalFact(fact) {
  return /storno/i.test(`${fact.sourceDocument ?? ""} ${fact.title ?? ""} ${fact.name ?? ""}`);
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
    depotNumber: fact.depotNumber ?? null,
    documentDate: fact.documentDate ?? null,
    updatedAt: now,
  };
}

function cleanName(name) {
  return String(name ?? "")
    .replace(/^Nr\.[0-9/]+\s+(?:Kauf|Verkauf)\s+/i, "")
    .replace(/^Kofler,\s*Niklas\s+Nr\.[0-9]+\s+/i, "")
    .trim() || null;
}

function pushCost(events, fact, suffix, type, amount, now, extra = {}) {
  const costAmount = negativeCost(amount);
  if (costAmount == null) return;
  events.costEvents.push({
    id: `flatex_cost_${fact.id}_${suffix}`,
    ...baseEvent(fact, now),
    type,
    date: eventDate(fact),
    amount: costAmount,
    currency: fact.currency ?? "EUR",
    isin: fact.isin ?? null,
    name: cleanName(fact.name),
    transactionId: fact.transactionNumber ?? fact.orderNumber ?? fact.id,
    cashImpact: extra.cashImpact ?? true,
    summaryOnly: extra.summaryOnly ?? false,
    isReversal: isReversalFact(fact),
    ...extra,
  });
}

function addSecurityTrade(events, fact, now) {
  if (!fact.isin && !fact.orderNumber && !fact.transactionNumber) return;
  const id = `flatex_tx_${fact.id}`;
  const fee = [fact.provision, fact.externalFees].filter(nonZeroNumber).reduce((sum, value) => sum + Math.abs(value), 0);
  const tax = negativeCost(fact.withheldTax);
  events.transactions.push({
    id,
    ...baseEvent(fact, now),
    type: "security_trade",
    category: "trade",
    side: fact.side ?? null,
    date: fact.tradeDate ?? fact.settlementDate ?? fact.documentDate ?? null,
    settlementDate: fact.settlementDate ?? null,
    tradeTime: fact.tradeTime ?? null,
    bookingText: `${fact.side === "sell" ? "Verkauf" : "Kauf"} ${cleanName(fact.name) ?? fact.isin ?? ""}`.trim(),
    isin: fact.isin ?? null,
    wkn: fact.wkn ?? null,
    name: cleanName(fact.name),
    quantity: fact.quantity ?? null,
    price: fact.price ?? null,
    grossAmount: fact.grossAmount ?? null,
    amount: fact.cashAmount ?? null,
    fee: fee || null,
    tax,
    profitLoss: fact.profitLoss ?? null,
    currency: fact.currency ?? "EUR",
    transactionId: fact.transactionNumber ?? fact.orderNumber ?? fact.id,
    orderNumber: fact.orderNumber ?? null,
    brokerTransactionNumber: fact.transactionNumber ?? null,
    exchange: fact.exchange ?? null,
    dedupeKey: fact.dedupeKey ?? fact.id,
    isReversal: isReversalFact(fact),
  });

  if (hasNumber(fact.cashAmount)) {
    events.ledgerEntries.push({
      id: `flatex_ledger_${fact.id}`,
      ...baseEvent(fact, now),
      date: fact.settlementDate ?? fact.tradeDate ?? fact.documentDate ?? null,
      bookingText: `${fact.side === "sell" ? "Wertpapierverkauf" : "Wertpapierkauf"} ${cleanName(fact.name) ?? fact.isin ?? ""}`.trim(),
      category: "security_trade_cash",
      amount: fact.cashAmount,
      currency: fact.currency ?? "EUR",
      isin: fact.isin ?? null,
      name: cleanName(fact.name),
      quantity: fact.quantity ?? null,
      price: fact.price ?? null,
      transactionId: fact.transactionNumber ?? fact.orderNumber ?? fact.id,
      orderNumber: fact.orderNumber ?? null,
      isReversal: isReversalFact(fact),
    });
  }

  pushCost(events, fact, "provision", "broker_provision", fact.provision, now);
  pushCost(events, fact, "external_fees", "external_fee", fact.externalFees, now);
  pushCost(events, fact, "tax", "capital_gains_tax", fact.withheldTax, now);
}

function addIncomeDistribution(events, fact, now) {
  const id = `flatex_income_${fact.id}`;
  const amount = hasNumber(fact.grossAmount) ? fact.grossAmount : fact.cashAmount;
  if (nonZeroNumber(amount)) {
    events.incomeEvents.push({
      id,
      ...baseEvent(fact, now),
      type: "dividend",
      date: fact.paymentDate ?? fact.settlementDate ?? fact.exDate ?? fact.documentDate ?? null,
      amount,
      netAmount: fact.cashAmount ?? null,
      grossAmount: fact.grossAmount ?? null,
      currency: fact.currency ?? "EUR",
      isin: fact.isin ?? null,
      wkn: fact.wkn ?? null,
      name: cleanName(fact.name),
      quantity: fact.quantity ?? null,
      transactionId: fact.transactionNumber ?? fact.id,
      taxAmount: [fact.withheldTax, fact.withholdingTax].filter(nonZeroNumber).reduce((sum, value) => sum + Math.abs(value), 0) || null,
      fxRate: fact.fxRate ?? null,
      isReversal: isReversalFact(fact),
    });
  }

  if (hasNumber(fact.cashAmount)) {
    events.ledgerEntries.push({
      id: `flatex_ledger_${fact.id}`,
      ...baseEvent(fact, now),
      date: fact.settlementDate ?? fact.paymentDate ?? fact.exDate ?? fact.documentDate ?? null,
      bookingText: `Dividende/Ausschuettung ${cleanName(fact.name) ?? fact.isin ?? ""}`.trim(),
      category: "income_distribution_cash",
      amount: fact.cashAmount,
      currency: fact.currency ?? "EUR",
      isin: fact.isin ?? null,
      name: cleanName(fact.name),
      transactionId: fact.transactionNumber ?? fact.id,
      isReversal: isReversalFact(fact),
    });
  }

  pushCost(events, fact, "withheld_tax", "capital_gains_tax", fact.withheldTax, now);
  pushCost(events, fact, "withholding_tax", "withholding_tax", fact.withholdingTax, now);
}

function addFundAccumulation(events, fact, now) {
  const amount = hasNumber(fact.taxableIncome) ? fact.taxableIncome : fact.grossAmount;
  if (nonZeroNumber(amount)) {
    events.incomeEvents.push({
      id: `flatex_income_${fact.id}`,
      ...baseEvent(fact, now),
      type: "fund_accumulation",
      date: fact.inflowDate ?? fact.settlementDate ?? fact.exDate ?? fact.documentDate ?? null,
      amount,
      grossAmount: fact.grossAmount ?? null,
      taxableIncome: fact.taxableIncome ?? null,
      netAmount: 0,
      cashImpact: false,
      nonCash: true,
      currency: fact.currency ?? "EUR",
      isin: fact.isin ?? null,
      wkn: fact.wkn ?? null,
      name: cleanName(fact.name),
      quantity: fact.quantity ?? null,
      transactionId: fact.transactionNumber ?? fact.id,
      fxRate: fact.fxRate ?? null,
      isReversal: isReversalFact(fact),
    });
  }

  if (hasNumber(fact.cashAmount)) {
    events.ledgerEntries.push({
      id: `flatex_ledger_${fact.id}`,
      ...baseEvent(fact, now),
      date: fact.settlementDate ?? fact.inflowDate ?? fact.exDate ?? fact.documentDate ?? null,
      bookingText: `Fondsthesaurierung Steuer ${cleanName(fact.name) ?? fact.isin ?? ""}`.trim(),
      category: "fund_accumulation_tax_cash",
      amount: fact.cashAmount,
      currency: fact.currency ?? "EUR",
      isin: fact.isin ?? null,
      name: cleanName(fact.name),
      transactionId: fact.transactionNumber ?? fact.id,
      isReversal: isReversalFact(fact),
    });
  }

  pushCost(events, fact, "withheld_tax", "fund_accumulation_tax", fact.withheldTax, now);
}

function addCashAdjustment(events, fact, now) {
  if (hasNumber(fact.cashAmount)) {
    events.ledgerEntries.push({
      id: `flatex_ledger_${fact.id}`,
      ...baseEvent(fact, now),
      date: fact.valuationDate ?? fact.documentDate ?? null,
      bookingText: fact.title ?? fact.adjustmentType ?? "Flatex Belastung/Gutschrift",
      category: fact.adjustmentType ?? "cash_adjustment",
      amount: fact.cashAmount,
      currency: fact.currency ?? "EUR",
      isin: fact.isin ?? null,
      name: cleanName(fact.name),
      quantity: fact.quantity ?? null,
      transactionId: fact.id,
      isReversal: isReversalFact(fact),
    });
  }

  if (fact.adjustmentType === "depot_service_fee") {
    pushCost(events, fact, "depot_service_fee", "depot_service_fee", fact.grossAmount ?? fact.cashAmount, now);
  }
}

function addCostInformation(events, fact, now) {
  if (fact.factType === "cost_information" && nonZeroNumber(fact.totalCosts)) {
    pushCost(events, fact, "annual_total", "mifid_annual_cost_information", fact.totalCosts, now, {
      date: fact.documentDate ?? null,
      costYear: fact.costYear ?? null,
      cashImpact: false,
      summaryOnly: true,
      possibleDuplicateOfTransactionFees: true,
      serviceCosts: fact.serviceCosts ?? null,
      otherCosts: fact.otherCosts ?? null,
      productCosts: fact.productCosts ?? null,
      fxCosts: fact.fxCosts ?? null,
      rebates: fact.rebates ?? null,
    });
  }
  if (fact.factType === "cost_information_product" && nonZeroNumber(fact.totalCosts)) {
    pushCost(events, fact, "annual_product", "mifid_product_cost_information", fact.totalCosts, now, {
      date: fact.documentDate ?? null,
      costYear: fact.costYear ?? null,
      cashImpact: false,
      summaryOnly: true,
      possibleDuplicateOfTransactionFees: true,
      isin: fact.isin ?? null,
      name: cleanName(fact.name),
      serviceCosts: fact.serviceCosts ?? null,
      otherCosts: fact.otherCosts ?? null,
      productCosts: fact.productCosts ?? null,
      fxCosts: fact.fxCosts ?? null,
      rebates: fact.rebates ?? null,
    });
  }
}

function addCorporateAction(events, fact, now) {
  if (!fact.instruments?.length && !hasNumber(fact.cashAmount) && !hasNumber(fact.taxableIncome)) return;
  events.transactions.push({
    id: `flatex_tx_${fact.id}`,
    ...baseEvent(fact, now),
    type: "corporate_action",
    category: fact.actionType ?? "corporate_action",
    date: fact.valuationDate ?? fact.documentDate ?? null,
    bookingText: fact.actionType ?? "Kapitalmassnahme",
    amount: fact.cashAmount ?? null,
    taxableIncome: fact.taxableIncome ?? null,
    instruments: fact.instruments ?? [],
    transactionId: fact.id,
    isReversal: isReversalFact(fact),
  });
  if (hasNumber(fact.cashAmount)) {
    events.ledgerEntries.push({
      id: `flatex_ledger_${fact.id}`,
      ...baseEvent(fact, now),
      date: fact.valuationDate ?? fact.documentDate ?? null,
      bookingText: fact.actionType ?? "Kapitalmassnahme",
      category: fact.actionType ?? "corporate_action",
      amount: fact.cashAmount,
      currency: "EUR",
      transactionId: fact.id,
      isReversal: isReversalFact(fact),
    });
  }
  pushCost(events, fact, "withheld_tax", "corporate_action_tax", fact.withheldTax, now);
}

export function buildFlatexEventsFromFacts(facts, now = new Date()) {
  const events = {
    transactions: [],
    ledgerEntries: [],
    costEvents: [],
    incomeEvents: [],
  };

  for (const fact of facts.filter((entry) => entry.source === source)) {
    if (fact.factType === "security_trade") addSecurityTrade(events, fact, now);
    if (fact.factType === "income_distribution") addIncomeDistribution(events, fact, now);
    if (fact.factType === "fund_accumulation") addFundAccumulation(events, fact, now);
    if (fact.factType === "cash_adjustment") addCashAdjustment(events, fact, now);
    if (fact.factType === "cost_information" || fact.factType === "cost_information_product") addCostInformation(events, fact, now);
    if (fact.factType === "corporate_action") addCorporateAction(events, fact, now);
  }

  return normalizeEventCollections(events, now);
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

export async function replaceFlatexEvents(firestore, facts, now = new Date()) {
  const events = buildFlatexEventsFromFacts(facts, now);
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
