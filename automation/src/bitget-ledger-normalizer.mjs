const SOURCE = "bitget";

export function parseBitgetNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function bitgetTimestamp(value) {
  const timestamp = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(timestamp)) return null;
  const millis = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(millis).toISOString();
}

function cleanId(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function upper(value) {
  return String(value ?? "").toUpperCase();
}

function lower(value) {
  return String(value ?? "").toLowerCase();
}

function billCategory(bill) {
  const group = lower(bill.groupType);
  const business = lower(bill.businessType);
  if (business.includes("interest")) return "interest";
  if (group === "financial") return "interest";
  if (business.includes("fee") || business.includes("deduction")) return "fee";
  if (group === "transaction" || business === "buy" || business === "sell") return "trade";
  if (group === "deposit") return "deposit";
  if (group === "withdraw") return "withdrawal";
  if (group === "transfer") return "transfer";
  if (group === "convert") return "convert";
  return group || "other";
}

function baseCoinFromSymbol(symbol) {
  const text = upper(symbol);
  for (const quote of ["USDT", "USDC", "EUR", "BTC", "ETH"]) {
    if (text.endsWith(quote) && text.length > quote.length) return text.slice(0, -quote.length);
  }
  return null;
}

function quoteCoinFromSymbol(symbol) {
  const text = upper(symbol);
  for (const quote of ["USDT", "USDC", "EUR", "BTC", "ETH"]) {
    if (text.endsWith(quote) && text.length > quote.length) return quote;
  }
  return null;
}

export function normalizeBitgetBill(bill, { importId, now } = {}) {
  const billId = cleanId(bill.billId ?? bill.bizOrderId ?? `${bill.coin}_${bill.cTime}`);
  const amount = parseBitgetNumber(bill.size);
  const fee = parseBitgetNumber(bill.fees);
  const category = billCategory(bill);

  return {
    id: `bitget_bill_${billId}`,
    source: SOURCE,
    importId,
    date: bitgetTimestamp(bill.cTime),
    bookingText: bill.businessType ?? bill.groupType ?? "Bitget bill",
    category,
    coin: upper(bill.coin),
    amount,
    quantity: amount,
    fee,
    currency: upper(bill.coin),
    bitgetBillId: bill.billId ?? null,
    bitgetBizOrderId: bill.bizOrderId ?? null,
    bitgetGroupType: bill.groupType ?? null,
    bitgetBusinessType: bill.businessType ?? null,
    balance: parseBitgetNumber(bill.balance),
    updatedAt: now,
    raw: bill,
  };
}

export function normalizeBitgetFill(fill, { importId, now } = {}) {
  const tradeId = cleanId(fill.tradeId ?? fill.orderId ?? `${fill.symbol}_${fill.cTime}`);
  const symbol = upper(fill.symbol);
  const fee = parseBitgetNumber(fill.feeDetail?.totalFee);
  const feeCurrency = upper(fill.feeDetail?.feeCoin);
  const quantity = parseBitgetNumber(fill.size);
  const amount = parseBitgetNumber(fill.amount);
  const price = parseBitgetNumber(fill.priceAvg);

  return {
    id: `bitget_fill_${tradeId}`,
    source: SOURCE,
    importId,
    date: bitgetTimestamp(fill.cTime),
    bookingText: `${upper(fill.side)} ${symbol}`.trim(),
    category: "trade",
    side: upper(fill.side),
    symbol,
    baseCoin: baseCoinFromSymbol(symbol),
    quoteCoin: quoteCoinFromSymbol(symbol),
    quantity,
    price,
    amount,
    currency: quoteCoinFromSymbol(symbol),
    fee,
    feeCurrency,
    orderType: fill.orderType ?? null,
    tradeScope: fill.tradeScope ?? null,
    bitgetOrderId: fill.orderId ?? null,
    bitgetTradeId: fill.tradeId ?? null,
    transactionId: fill.tradeId ?? fill.orderId ?? null,
    updatedAt: now,
    raw: fill,
  };
}

export function costEventFromBitgetFill(transaction, { now } = {}) {
  if (!transaction || !transaction.fee) return null;
  return {
    id: `${transaction.id}_fee`,
    source: SOURCE,
    importId: transaction.importId,
    date: transaction.date,
    type: "fee",
    bookingText: `Fee ${transaction.symbol ?? ""}`.trim(),
    amount: transaction.fee,
    amountAbs: Math.abs(transaction.fee),
    currency: transaction.feeCurrency,
    symbol: transaction.symbol,
    transactionId: transaction.transactionId,
    updatedAt: now,
    raw: transaction.raw?.feeDetail ?? null,
  };
}

export function normalizeBitgetEarnRecord(record, { importId, now } = {}) {
  const orderId = cleanId(record.orderId ?? `${record.coinName}_${record.orderType}_${record.ts}`);
  const orderType = lower(record.orderType);
  const amount = parseBitgetNumber(record.amount);
  return {
    id: `bitget_earn_${orderId}`,
    source: SOURCE,
    importId,
    date: bitgetTimestamp(record.ts),
    type: orderType === "pay_interest" ? "interest" : orderType || "earn",
    category: orderType === "pay_interest" ? "interest" : `earn_${orderType || "record"}`,
    bookingText: `Earn ${record.orderType ?? "record"} ${record.coinName ?? ""}`.trim(),
    coin: upper(record.coinName),
    settleCoin: upper(record.settleCoinName),
    amount,
    quantity: amount,
    currency: upper(record.settleCoinName ?? record.coinName),
    productType: record.productType ?? null,
    productLevel: record.productLevel ?? null,
    period: record.period ?? null,
    bitgetOrderId: record.orderId ?? null,
    transactionId: record.orderId ?? null,
    updatedAt: now,
    raw: record,
  };
}

export function incomeEventFromEarnRecord(record, { now } = {}) {
  if (!record || record.type !== "interest") return null;
  return {
    id: `bitget_income_${cleanId(record.bitgetOrderId ?? record.id)}`,
    source: SOURCE,
    importId: record.importId,
    date: record.date,
    type: "interest",
    bookingText: record.bookingText,
    amount: record.amount,
    quantity: record.quantity,
    currency: record.currency,
    coin: record.coin,
    productType: record.productType,
    productLevel: record.productLevel,
    transactionId: record.transactionId,
    updatedAt: now,
    raw: record.raw,
  };
}

export function normalizeBitgetTaxRecord(record, { importId, now } = {}) {
  const id = cleanId(record.id ?? record.bizOrderId ?? `${record.coin}_${record.ts}`);
  return {
    id: `bitget_tax_spot_${id}`,
    source: SOURCE,
    importId,
    factType: "tax_spot_record",
    date: bitgetTimestamp(record.ts),
    coin: upper(record.coin),
    bitgetTaxType: record.spotTaxType ?? null,
    amount: parseBitgetNumber(record.amount),
    fee: parseBitgetNumber(record.fee),
    balance: parseBitgetNumber(record.balance),
    bitgetRecordId: record.id ?? null,
    bitgetBizOrderId: record.bizOrderId ?? null,
    updatedAt: now,
    raw: record,
  };
}
