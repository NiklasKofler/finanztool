export function parseGermanNumber(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMoneyNumber(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes(",")) return parseGermanNumber(trimmed);
  const parsed = Number.parseFloat(trimmed.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(day, month, year) {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseGermanDate(value) {
  if (!value) return null;
  const numeric = value.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (numeric) {
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
    return toIsoDate(numeric[1], numeric[2], year);
  }

  const long = value.match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(20\d{2})/);
  if (!long) return null;
  const months = {
    januar: "01",
    februar: "02",
    maerz: "03",
    märz: "03",
    april: "04",
    mai: "05",
    juni: "06",
    juli: "07",
    august: "08",
    september: "09",
    oktober: "10",
    november: "11",
    dezember: "12",
  };
  const month = months[long[2].toLowerCase()];
  return month ? toIsoDate(long[1], month, long[3]) : null;
}

export function classifyGinmonDocument(fileName, text) {
  const haystack = `${fileName} ${text}`;
  if (/Vermögensstatus|ASSET_STATUS_REPORT|Depotwert gesamt|Gesamtvermögen/i.test(haystack)) {
    return "asset_status";
  }
  if (/QUARTERLY_REPORT|Quartalsbericht|QUARTALSBERICHT/i.test(haystack)) return "quarterly_report";
  if (/INVOICE|Gebührenabrechnung|Rechnungsnummer|Rechnungsbetrag/i.test(haystack)) return "invoice";
  if (/ACCOUNT_STATEMENT|Kontoauszug/i.test(haystack)) return "account_statement";
  if (/ACCOUNT_BALANCE|Kontostand/i.test(haystack)) return "account_balance";
  if (/SECURITY_EARNINGS|Ertragsgutschrift|Dividende/i.test(haystack)) return "earnings";
  if (/WP_TRADE|Wertpapierabrechnung|wpabr/i.test(haystack)) return "trade";
  if (/ANNUAL_PROFITS_DECLARATION|Erträgnisaufstellung/i.test(haystack)) return "annual_tax";
  return "unknown";
}

export function parseGinmonAssetStatus(text, filePath = "") {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const accountNumber =
    normalized.match(/Konto\/Depotnummer:\s*([0-9]+)/i)?.[1] ??
    normalized.match(/Depot\s+([0-9]{8,})/i)?.[1] ??
    null;
  const createdDate = parseGermanDate(normalized.match(/Erstellungsdatum:\s*(\d{2}\.\d{2}\.\d{4})/)?.[1]);
  const valuationDate = parseGermanDate(
    normalized.match(/Vermögensstatus zum\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöüß]+\s+20\d{2})/i)?.[1] ??
      normalized.match(/Depotübersicht zum\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöüß]+\s+20\d{2})/i)?.[1],
  );
  const depotValue = parseGermanNumber(normalized.match(/Depotwert gesamt\s+([\d.,]+)/i)?.[1] ?? "");
  const cashValue = parseGermanNumber(normalized.match(/Kontosalden gesamt\s+([\d.,]+)/i)?.[1] ?? "");
  const totalValue = parseGermanNumber(normalized.match(/Gesamtvermögen\s+([\d.,]+)/i)?.[1] ?? "");
  const transactionFees = parseGermanNumber(
    normalized.match(/angefallene Transaktionsgebühren\s+(-?[\d.,]+)/i)?.[1] ?? "",
  );
  const custodyFees = parseGermanNumber(normalized.match(/Depotgebühren\s+(-?[\d.,]+)/i)?.[1] ?? "");
  const managementFees = parseGermanNumber(
    normalized.match(/Gesamtverwaltungsgebühren\s+(-?[\d.,]+)/i)?.[1] ?? "",
  );
  const totalFees = parseGermanNumber(
    normalized.match(/Gesamt Gebühren und Entgelte\s+(-?[\d.,]+)/i)?.[1] ?? "",
  );

  const positions = [];
  const positionPattern =
    /([A-Z0-9][A-Z0-9().+\-/& ]{2,}?)\s+EUR\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+(-?[\d.,]+)\s+([\d.,]+)\s+([A-Z]{2}[A-Z0-9]{10})\/([A-Z0-9]+)/g;

  for (const match of normalized.matchAll(positionPattern)) {
    const name = match[1].trim();
    if (/Investmentfonds|Bezeichnung|Depotübersicht|Vermögensstatus/i.test(name)) continue;
    const currentValue = parseGermanNumber(match[6]);
    const performanceValue = parseGermanNumber(match[5]);
    const costValue =
      currentValue != null && performanceValue != null ? currentValue - performanceValue : null;
    positions.push({
      accountNumber,
      name,
      category: "Investmentfonds",
      isin: match[7],
      wkn: match[8],
      quantity: parseGermanNumber(match[2]),
      quantityText: `${match[2]} Stk.`,
      costPrice: parseGermanNumber(match[3]),
      quoteValue: parseGermanNumber(match[4]),
      quoteText: `${match[4]} EUR`,
      currentValue,
      costValue,
      performanceValue,
      performancePct: costValue ? performanceValue / costValue : null,
      valuationDate,
      sourceDocument: filePath,
    });
  }

  if (cashValue != null) {
    positions.push({
      accountNumber,
      name: "Geldkonto",
      category: "Cash",
      quantityText: "1 Konto",
      currentValue: cashValue,
      valuationDate,
      sourceDocument: filePath,
    });
  }

  return {
    accountNumber,
    createdDate,
    valuationDate,
    depotValue,
    cashValue,
    totalValue,
    fees: {
      transactionFees,
      custodyFees,
      managementFees,
      totalFees,
    },
    positions,
    sourceDocument: filePath,
  };
}

export function parseGinmonQuarterlyReport(text, filePath = "") {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const accountNumber = normalized.match(/Depotnummer:\s*([0-9]+)/i)?.[1] ?? null;
  const strategy =
    normalized.match(/mit der Anlagestrategie\s+([A-Za-z0-9ÄÖÜäöüß -]+?)\s+haben wir/i)?.[1]?.replace(/\s+/g, " ").trim() ??
    normalized.match(/Anlagestrategie:\s*([A-Za-z0-9ÄÖÜäöüß -]+?)(?:\s+Lars\s+Reiner|\s+Ulrich\s+Bauer|$)/i)?.[1]?.replace(/\s+/g, " ").trim() ??
    null;
  const period =
    normalized.match(/ZEITRAUM\s+(\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}\.\d{2}\.\d{4})/i)?.[1] ?? null;
  const reportDate = parseGermanDate(normalized.match(/Frankfurt am Main,\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]);
  const managementFees = parseGermanNumber(
    normalized.match(/Verwaltungsgebühren\s+EUR\s+(-?[\d.,]+)/i)?.[1] ?? "",
  );
  const totalValue = parseGermanNumber(
    normalized.match(/Gesamtwert \(Stichtag\)\s+EUR\s+(-?[\d.,]+)/i)?.[1] ?? "",
  );
  return { accountNumber, strategy, period, reportDate, managementFees, totalValue, sourceDocument: filePath };
}

export function parseGinmonInvoice(text, filePath = "") {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const fileName = filePath.split("/").pop() ?? "";
  const invoiceDate = parseGermanDate(
    normalized.match(/Rechnungsdatum\s*\/\s*Invoice date\s*:\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1] ??
      normalized.match(/\b(\d{2}\.\d{2}\.\d{4})\s+\d{10,}/)?.[1],
  );
  const invoiceNumber =
    normalized.match(/\b(\d{14})\s+GM\d+/)?.[1] ??
    fileName.match(/_(\d{14})\.pdf$/i)?.[1] ??
    normalized.match(/Rechnungsnummer\s*\/\s*Invoice no\s*:\s*([A-Z0-9]+)/i)?.[1] ??
    null;
  const customerId =
    normalized.match(/\b(GM\d+)\b/)?.[1] ??
    normalized.match(/Kundennummer\s*\/\s*Customer ID\s*:\s*(GM\d+)/i)?.[1] ??
    null;
  const period = normalized.match(/Zeitraum vom\s*(\d{2}\.\d{2}\.\d{4}\s*[–-]\s*\d{2}\.\d{2}\.\d{4})/i)?.[1] ?? null;
  const baseFee = parseMoneyNumber(
    normalized.match(/([-\d.,]+)\s*€\s+0\.7500%\s*p\.a\./i)?.[1] ?? "",
  );
  const discount = parseMoneyNumber(normalized.match(/(-?[\d.,]+)\s*€\s+Discount/i)?.[1] ?? "");
  const totalAmount = parseMoneyNumber(
    normalized.match(/Rechnungsbetrag\s+Total amount\s+[\d.,]+\s*€\s+(-?[\d.,]+)\s*€/i)?.[1] ??
      normalized.match(/Total amount\s+[\d.,]+\s*€\s+(-?[\d.,]+)\s*€/i)?.[1] ??
      "",
  );
  const vatIncluded = parseMoneyNumber(
    normalized.match(/VAT included of 19%\s+MwSt\. inkl\. von 19%\s+(-?[\d.,]+)\s*€/i)?.[1] ?? "",
  );
  return {
    invoiceDate,
    invoiceNumber,
    customerId,
    period,
    baseFee,
    discount,
    totalAmount,
    vatIncluded,
    sourceDocument: filePath,
  };
}
