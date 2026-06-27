export const EVENT_MODEL_VERSION = "event_model_v1_2026-06-27";

export const EVENT_COLLECTIONS = [
  "transactions",
  "ledgerEntries",
  "costEvents",
  "incomeEvents",
];

const COLLECTION_EVENT_KIND = {
  transactions: "asset_transaction",
  ledgerEntries: "cash_or_account_movement",
  costEvents: "cost",
  incomeEvents: "income",
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function roundMoney(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
}

function compactObject(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function currencyOf(event) {
  return String(event.currency ?? event.amountCurrency ?? "EUR").toUpperCase();
}

function eurAmount(value, event) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (currencyOf(event) !== "EUR") return null;
  return roundMoney(value);
}

function absEurAmount(value, event) {
  const amount = eurAmount(value, event);
  return amount === null ? null : roundMoney(Math.abs(amount));
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function instrumentIdFromEvent(event) {
  if (event.instrumentId) return String(event.instrumentId);
  if (event.isin) return `isin_${String(event.isin).toUpperCase()}`;
  if (event.symbol) return `${String(event.source ?? "instrument")}_${String(event.symbol).toUpperCase()}`;
  if (event.assetId) return `${String(event.source ?? "asset")}_${String(event.assetId)}`;
  if (event.coin) return `${String(event.source ?? "crypto")}_${String(event.coin).toUpperCase()}`;
  if (event.metal) return `metal_${String(event.metal).toLowerCase().replace(/\s+/g, "_")}`;
  if (event.normalizedMetal) return `metal_${String(event.normalizedMetal).toLowerCase().replace(/\s+/g, "_")}`;
  if (event.epic) return `capitalcom_${String(event.epic).toUpperCase()}`;
  return null;
}

export function sourceAccountIdFromEvent(event) {
  return firstPresent(
    event.sourceAccountId,
    event.accountId,
    event.accountNumber,
    event.depotNumber,
    event.portfolioId,
    event.customerId,
    event.providerAccountId,
  ) ?? null;
}

function eventDateFromEvent(event) {
  return firstPresent(
    event.eventDate,
    event.date,
    event.bookingDate,
    event.valueDate,
    event.settlementDate,
    event.tradeDate,
    event.paymentDate,
    event.documentDate,
  ) ?? null;
}

function eventGroupIdFromEvent(event) {
  if (event.eventGroupId) return event.eventGroupId;
  const source = event.source ?? "unknown";
  const natural = firstPresent(
    event.naturalKey,
    event.transactionId,
    event.orderNumber,
    event.brokerTransactionNumber,
    event.sourceDocumentFactId,
    event.sourceDocumentId,
    event.id,
  );
  return natural ? `${source}_${natural}` : null;
}

function dedupeKeyFromEvent(event) {
  return firstPresent(
    event.dedupeKey,
    event.naturalKey,
    event.transactionId,
    event.orderNumber,
    event.brokerTransactionNumber,
    event.sourceDocumentFactId,
    event.sourceDocumentId,
    event.id,
  ) ?? null;
}

function allocationLevel(event, collection) {
  if (event.allocationLevel) return event.allocationLevel;
  if (event.sourcePositionId) return "position";
  if (instrumentIdFromEvent(event)) return "instrument";
  if (sourceAccountIdFromEvent(event)) return "source_account";
  if (event.source) return collection === "costEvents" || collection === "incomeEvents" ? "source" : "unknown";
  return "unknown";
}

function allocationMethod(event) {
  if (event.allocationMethod) return event.allocationMethod;
  const text = `${event.type ?? ""} ${event.category ?? ""} ${event.subcategory ?? ""}`.toLowerCase();
  if (text.includes("allocation") || text.includes("allocated") || text.includes("anteilig")) return "proportional";
  if (event.sourceDocumentFactId || event.sourceDocumentId) return "document";
  if (event.transactionId || event.naturalKey || event.orderNumber) return "transaction";
  if (/api/i.test(`${event.sourceDataProvider ?? ""} ${event.sourceChannel ?? ""}`)) return "api";
  return "unknown";
}

function allocationStatus(event, collection) {
  if (event.allocationStatus) return event.allocationStatus;
  const method = allocationMethod(event);
  if (method === "proportional" || method === "manual") return "allocated";
  const level = allocationLevel(event, collection);
  if (["position", "instrument", "source_account"].includes(level)) return "direct";
  if (level === "source") return "unallocated";
  return "pending";
}

function allocationConfidence(event) {
  if (event.allocationConfidence) return event.allocationConfidence;
  if (event.confidence) return event.confidence;
  const method = allocationMethod(event);
  if (event.summaryOnly || event.possibleDuplicateOfCashLedger || event.possibleDuplicateOfTransactionFees) return "inferred";
  if (method === "proportional") return "estimated";
  if (["document", "transaction", "api", "manual"].includes(method)) return "exact";
  return "unknown";
}

function comparisonScope(event, collection) {
  if (event.comparisonScope) return event.comparisonScope;
  const level = allocationLevel(event, collection);
  if (level === "position" || level === "instrument") return "product";
  if (level === "source_account") return "account";
  if (event.source) return "broker";
  return "unknown";
}

function costClass(event) {
  const text = `${event.type ?? ""} ${event.category ?? ""} ${event.subcategory ?? ""} ${event.bookingText ?? ""}`.toLowerCase();
  if (/tax|steuer|withholding|capital_gains/.test(text)) return "tax";
  if (/interest|zins|financing|credit|swap|overnight/.test(text)) return "financing";
  if (/storage|lager|custody|verwahrung/.test(text)) return "custody";
  if (/product|fund|mifid|ter|expense/.test(text)) return "product";
  if (/broker|order|provision|fee|gebuehr|gebühr|commission|external/.test(text)) return "broker";
  return event.type ? "other" : "unknown";
}

function incomeClass(event) {
  const text = `${event.type ?? ""} ${event.category ?? ""} ${event.subcategory ?? ""} ${event.bookingText ?? ""}`.toLowerCase();
  if (/dividend|ausschuett|ausschütt|distribution/.test(text)) return "distribution";
  if (/interest|zins/.test(text)) return "interest";
  if (/reward|earn|staking/.test(text)) return "reward";
  if (/cashback|rebate|bonus|refund|rueckerstattung|rückerstattung/.test(text)) return "cashback_or_rebate";
  return event.type ? "other" : "unknown";
}

function financialImpactEur(collection, event) {
  const amount = typeof event.amount === "number" ? event.amount : null;
  const netAmount = typeof event.netAmount === "number" ? event.netAmount : null;
  if (collection === "costEvents") {
    const value = absEurAmount(amount ?? event.amountAbs ?? event.amountAbsEur, event);
    return value === null ? null : -value;
  }
  if (collection === "incomeEvents") {
    return absEurAmount(netAmount ?? amount, event);
  }
  if (collection === "ledgerEntries" || collection === "transactions") {
    return eurAmount(amount, event);
  }
  return null;
}

export function normalizeEventDocument(collection, event, now = new Date()) {
  if (!EVENT_COLLECTIONS.includes(collection)) return event;
  if (!isObject(event)) return event;

  const instrumentId = instrumentIdFromEvent(event);
  const sourceAccountId = sourceAccountIdFromEvent(event);
  const eventDate = eventDateFromEvent(event);
  const collectionKind = COLLECTION_EVENT_KIND[collection];
  const amount = typeof event.amount === "number" ? event.amount : null;
  const grossAmount = typeof event.grossAmount === "number" ? event.grossAmount : null;
  const netAmount = typeof event.netAmount === "number" ? event.netAmount : null;
  const taxAmount = typeof event.taxAmount === "number" ? event.taxAmount : typeof event.tax === "number" ? event.tax : null;
  const feeAmount = typeof event.feeAmount === "number" ? event.feeAmount : typeof event.fee === "number" ? event.fee : null;

  const additions = compactObject({
    eventModelVersion: event.eventModelVersion ?? EVENT_MODEL_VERSION,
    eventCollection: collection,
    eventKind: event.eventKind ?? collectionKind,
    eventType: event.eventType ?? event.type ?? event.category ?? null,
    eventDate,
    sourceAccountId,
    instrumentId,
    eventGroupId: eventGroupIdFromEvent(event),
    dedupeKey: dedupeKeyFromEvent(event),
    amountEur: event.amountEur ?? eurAmount(amount, event),
    amountAbsEur: event.amountAbsEur ?? absEurAmount(amount, event),
    grossAmountEur: event.grossAmountEur ?? eurAmount(grossAmount, event),
    netAmountEur: event.netAmountEur ?? eurAmount(netAmount, event),
    taxAmountEur: event.taxAmountEur ?? absEurAmount(taxAmount, event),
    feeAmountEur: event.feeAmountEur ?? absEurAmount(feeAmount, event),
    financialImpactEur: event.financialImpactEur ?? financialImpactEur(collection, event),
    allocationLevel: allocationLevel(event, collection),
    allocationStatus: allocationStatus(event, collection),
    allocationMethod: allocationMethod(event),
    allocationConfidence: allocationConfidence(event),
    comparisonScope: comparisonScope(event, collection),
    providerComparisonRelevant:
      event.providerComparisonRelevant ??
      (collection === "costEvents" || collection === "incomeEvents" || collection === "transactions"),
    costClass: collection === "costEvents" ? event.costClass ?? costClass(event) : event.costClass,
    incomeClass: collection === "incomeEvents" ? event.incomeClass ?? incomeClass(event) : event.incomeClass,
    normalizedAt: event.normalizedAt ?? now,
  });

  return {
    ...event,
    ...additions,
  };
}

export function normalizeEventCollections(events, now = new Date()) {
  return Object.fromEntries(
    Object.entries(events).map(([collection, documents]) => [
      collection,
      EVENT_COLLECTIONS.includes(collection) && Array.isArray(documents)
        ? documents.map((event) => normalizeEventDocument(collection, event, now))
        : documents,
    ]),
  );
}
