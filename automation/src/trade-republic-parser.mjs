import { parseCsv, rowsToObjects } from "./summary-utils.mjs";

function detectDelimiter(firstLine) {
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons >= commas ? ";" : ",";
}

function parseNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitize(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function getTimestamp(row) {
  return sanitize(row.datetime) ?? sanitize(row.date) ?? null;
}

function classify(row) {
  const category = String(row.category ?? "").toUpperCase();
  const type = String(row.type ?? "").toUpperCase();
  if (type.includes("BUY") || type.includes("SELL")) return "trade";
  if (type.includes("INTEREST")) return "interest";
  if (type.includes("EARNINGS") || type.includes("DIVIDEND")) return "dividend";
  if (type.includes("TAX")) return "tax";
  if (type.includes("FEE")) return "fee";
  if (category === "CASH") return "cash";
  if (category === "CORPORATE_ACTION") return "corporate_action";
  return "other";
}

function buildHoldings(orderedRows) {
  const byAsset = new Map();
  const realizedByAsset = new Map();

  for (const row of orderedRows) {
    const symbol = sanitize(row.symbol);
    const type = String(row.type ?? "").toUpperCase();
    const amount = parseNumber(row.amount) ?? 0;
    const fee = parseNumber(row.fee) ?? 0;
    const tax = parseNumber(row.tax) ?? 0;
    const shares = parseNumber(row.shares) ?? 0;
    if (!symbol) continue;

    const current = byAsset.get(symbol) ?? {
      symbol,
      name: sanitize(row.name),
      assetClass: sanitize(row.asset_class),
      quantity: 0,
      costValue: 0,
      buyCostTotal: 0,
      buyQuantityTotal: 0,
      sellProceedsTotal: 0,
      sellQuantityTotal: 0,
    };

    if (type === "BUY") {
      const price = parseNumber(row.price) ?? 0;
      const grossFromAmount = amount !== 0 ? Math.abs(amount) : 0;
      const grossFromShares = shares > 0 && price > 0 ? shares * price : 0;
      const gross = grossFromAmount > 0 ? grossFromAmount : grossFromShares;
      const buyCost = gross + Math.abs(fee) + Math.abs(tax);
      current.quantity += shares;
      current.costValue += buyCost;
      current.buyCostTotal += buyCost;
      current.buyQuantityTotal += shares;
      byAsset.set(symbol, current);
      continue;
    }

    if (type === "SELL") {
      const avgCost = current.quantity > 0 ? current.costValue / current.quantity : 0;
      const soldQuantity = Math.min(current.quantity, shares);
      const removedCost = avgCost * soldQuantity;
      const proceeds = amount + fee + tax;
      const realized = proceeds - removedCost;

      current.quantity -= soldQuantity;
      current.costValue -= removedCost;
      current.sellProceedsTotal += proceeds;
      current.sellQuantityTotal += soldQuantity;
      if (Math.abs(current.quantity) < 1e-9) current.quantity = 0;
      if (Math.abs(current.costValue) < 1e-9) current.costValue = 0;
      byAsset.set(symbol, current);

      const realizedCurrent = realizedByAsset.get(symbol) ?? 0;
      realizedByAsset.set(symbol, realizedCurrent + realized);
      continue;
    }

    if (type === "SPLIT") {
      current.quantity += shares;
      byAsset.set(symbol, current);
      continue;
    }
  }

  return [...byAsset.values()].map((position) => ({
    ...position,
    avgCostPerShare: position.quantity > 0 ? position.costValue / position.quantity : null,
    realizedPnL: realizedByAsset.get(position.symbol) ?? 0,
  }));
}

export function parseTradeRepublicCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], holdings: [], warnings: ["CSV enthaelt zu wenig Zeilen."] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const rows = rowsToObjects(parseCsv(csvText, delimiter)).map((row) => ({
    ...row,
    parsed: {
      datetime: getTimestamp(row),
      category: classify(row),
      amount: parseNumber(row.amount),
      fee: parseNumber(row.fee),
      tax: parseNumber(row.tax),
      shares: parseNumber(row.shares),
      price: parseNumber(row.price),
      name: sanitize(row.name),
      symbol: sanitize(row.symbol),
      transactionId: sanitize(row.transaction_id),
      type: sanitize(row.type),
      assetClass: sanitize(row.asset_class),
      currency: sanitize(row.currency) ?? "EUR",
      description: sanitize(row.description),
    },
  }));

  const ordered = [...rows].sort((left, right) =>
    String(left.parsed.datetime ?? "").localeCompare(String(right.parsed.datetime ?? "")),
  );
  const holdings = buildHoldings(ordered);
  return { rows: ordered, holdings, warnings: [] };
}
