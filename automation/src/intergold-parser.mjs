import { formatIsoDateFromGerman, parseGermanNumber } from "./summary-utils.mjs";

export function normalizeMetalName(value) {
  return String(value ?? "")
    .replace(/oxid$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactIntergoldId(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 120);
}

export function convertMetalValue(quantity, quantityUnit, price, priceUnit) {
  if (
    typeof quantity !== "number" ||
    typeof price !== "number" ||
    !quantityUnit ||
    !priceUnit
  ) {
    return null;
  }
  if (quantityUnit === priceUnit) return quantity * price;
  if (quantityUnit === "kg" && priceUnit === "g") return quantity * 1000 * price;
  if (quantityUnit === "g" && priceUnit === "kg") return (quantity / 1000) * price;
  return null;
}

export function parseIntergoldConfirmation(text, filePath = "") {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const invoiceNumber = normalized.match(/Rechnungsbeleg\s+(AR\d+)/i)?.[1] ?? null;
  const invoiceDateRaw =
    normalized.match(/Belegdatum:\s*(\d{2}\.\d{2}\.\d{2,4})/i)?.[1] ??
    normalized.match(/Rechnungsbeleg\s+AR\d+\s+vom\s+(\d{2}\.\d{2}\.\d{2,4})/i)?.[1] ??
    null;
  const invoiceDate = formatIsoDateFromGerman(invoiceDateRaw);
  const totalAmount = parseGermanNumber(normalized.match(/Endsumme\s+([\d.,]+)\s*€/i)?.[1] ?? "");
  const positions = [];
  const positionPattern =
    /\b(\d+)\s+(HW-\d+)\s+([A-Za-zÄÖÜäöüß\s-]+?)\s+([\d.,]+)\s+(kg|g)\s+([\d.]+,\d{2})/gi;

  for (const match of normalized.matchAll(positionPattern)) {
    const metal = match[3].trim();
    positions.push({
      lineNumber: Number.parseInt(match[1], 10),
      articleNumber: match[2],
      invoiceNumber,
      invoiceDate,
      metal,
      normalizedMetal: normalizeMetalName(metal),
      quantity: parseGermanNumber(match[4]),
      unit: match[5],
      lineCostValue: parseGermanNumber(match[6]),
      sourceDocument: filePath,
    });
  }

  const lineCostTotal = positions.reduce((sum, position) => sum + (position.lineCostValue ?? 0), 0);
  const feeAmount =
    totalAmount != null && lineCostTotal > 0 ? Math.max(0, totalAmount - lineCostTotal) : 0;
  const positionsWithCostBasis = positions.map((position) => {
    const ratio = lineCostTotal > 0 ? (position.lineCostValue ?? 0) / lineCostTotal : 0;
    const allocatedFee = feeAmount * ratio;
    return {
      ...position,
      allocatedFee,
      costValue: (position.lineCostValue ?? 0) + allocatedFee,
    };
  });

  return {
    invoiceNumber,
    invoiceDate,
    totalAmount,
    lineCostTotal,
    feeAmount,
    positions: positionsWithCostBasis,
    sourceDocument: filePath,
  };
}
