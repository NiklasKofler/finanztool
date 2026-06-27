export function parseGermanNumber(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSignedGermanNumber(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const sign = trimmed.endsWith("-") ? -1 : 1;
  const parsed = parseGermanNumber(trimmed.replace(/[+-]$/, ""));
  return parsed == null ? null : sign * parsed;
}

function parseMoneyNumber(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, "");
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[^\d,.-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number.parseFloat(normalized);
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
  if (/WELCOME_LETTER|welcome_letter/i.test(fileName) || /Willkommensbrief/i.test(text.slice(0, 1000))) {
    return "welcome_letter";
  }
  if (/VL_FORM|vl_form/i.test(fileName)) return "account_form";
  if (/BASIC_INFORMATION|basic_information/i.test(fileName) || /Allgemeine Informationen zu ETFs/i.test(text.slice(0, 1000))) {
    return "basic_information";
  }
  if (/DEPOSITOR_INFO_DOCUMENT|Einlagensicherung/i.test(fileName)) return "basic_information";
  if (
    /TERMS_AND_CONDITIONS|CONTRACT_TERMS|DATA_PROTECTION_DECLARATION|AGB|Vertragsbedingungen|Datenschutz/i.test(fileName) ||
    /Ginmon.*(?:AGB|Allgemeine Geschäftsbedingungen|Vertragsbedingungen)/i.test(text.slice(0, 1000))
  ) {
    return "legal_terms";
  }
  if (/Vermögensstatus|ASSET_STATUS_REPORT|Depotwert gesamt|Gesamtvermögen/i.test(haystack)) {
    return "asset_status";
  }
  if (/CORPORATE_ACTION|Gebührenänderungen|Gattungsbezeichnung.*Depotbestand|kapma_/i.test(haystack)) {
    return "corporate_action";
  }
  if (/ANNUAL_STATEMENT|Jahresdepotauszug|Depotauszug per|jda_/i.test(haystack)) {
    return "annual_statement";
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
  const period = normalized.match(/Zeitraum vom\s*(\d{1,2}\.\d{1,2}\.\d{4}\s*[–-]\s*\d{1,2}\.\d{1,2}\.\d{4})/i)?.[1] ?? null;
  const baseFeeLine = normalized.match(
    /Grundgebühr\s+([\d.,]+)\s*€\s+0[.,]75(?:00)?%\s*p\.a\.\s+([\d.,]+)\s*€/i,
  );
  const baseFee = parseMoneyNumber(
    baseFeeLine?.[2] ?? normalized.match(/0[.,]75(?:00)?%\s*p\.a\.\s+([\d.,]+)\s*€/i)?.[1] ?? "",
  );
  const calculationBasis = parseMoneyNumber(baseFeeLine?.[1] ?? "");
  const discount = parseMoneyNumber(normalized.match(/(-?[\d.,]+)\s*€\s+Discount/i)?.[1] ?? "");
  const totalAmount = parseMoneyNumber(
    normalized.match(/Rechnungsbetrag\s+Total amount\s+[\d.,]+\s*€\s+(-?[\d.,]+)\s*€/i)?.[1] ??
      normalized.match(/Total amount\s+[\d.,]+\s*€\s+(-?[\d.,]+)\s*€/i)?.[1] ??
      normalized.match(/Rechnungsbetrag\s+([\d.,]+)\s*€\s+Total amount/i)?.[1] ??
      "",
  );
  const vatIncluded = parseMoneyNumber(
    normalized.match(/VAT included of 19%\s+MwSt\. inkl\. von 19%\s+(-?[\d.,]+)\s*€/i)?.[1] ??
      normalized.match(/MwSt\. inkl\. von 19%\s+(-?[\d.,]+)\s*€/i)?.[1] ??
      "",
  );
  return {
    invoiceDate,
    invoiceNumber,
    customerId,
    period,
    calculationBasis,
    baseFee,
    discount,
    totalAmount,
    vatIncluded,
    sourceDocument: filePath,
  };
}

export function parseGinmonTrade(text, filePath = "") {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const accountNumber =
    normalized.match(/Depot-Nr\.\s*([0-9]+)/i)?.[1] ??
    filePath.match(/wpabr_([0-9]{10,12})_/i)?.[1] ??
    null;
  const settlement =
    normalized.match(/Abrechnungs-Nr\.\s*([0-9]+)\s*\/\s*(\d{2}\.\d{2}\.\d{4})/i) ??
    normalized.match(/Ausführungs-Nr\.\s*([0-9]+)\s*\/\s*(\d{2}\.\d{2}\.\d{4})/i) ??
    normalized.match(/\b([0-9]{6,})\s*\/\s*(\d{2}\.\d{2}\.\d{4})/i);
  const actionText = normalized.match(/Wertpapierabrechnung\s+(Kauf|Verkauf)/i)?.[1] ?? null;
  const side = actionText?.toLowerCase() === "verkauf" ? "sell" : actionText ? "buy" : null;
  const securityLine =
    normalized.match(/Gattungsbezeichnung\s+ISIN\s+(.+?)\s+([A-Z]{2}[A-Z0-9]{10})\s+Nominal/i) ??
    normalized.match(/Gattungsbezeichnung\s+(.+?)\s+ISIN\s+([A-Z]{2}[A-Z0-9]{10})/i);
  const name = securityLine?.[1]?.trim() ?? null;
  const isin =
    securityLine?.[2] ?? normalized.match(/\bISIN\s+([A-Z]{2}[A-Z0-9]{10})\b/i)?.[1] ?? null;
  const quantityAndPrice = normalized.match(/Nominal\s+(?:Kurs\s+)?STK\s+([\d.,]+)\s+EUR\s+([\d.,]+)/i);
  const quantity = parseGermanNumber(quantityAndPrice?.[1] ?? normalized.match(/Nominal\s+STK\s+([\d.,]+)/i)?.[1] ?? "");
  const price = parseGermanNumber(quantityAndPrice?.[2] ?? normalized.match(/\bKurs\s+EUR\s+([\d.,]+)/i)?.[1] ?? "");
  const tradeDate = parseGermanDate(normalized.match(/Handelstag\s+(\d{2}\.\d{2}\.\d{4})/i)?.[1]);
  const tradeTime = normalized.match(/Handelszeit\s+([0-9:]+)\*?/i)?.[1] ?? null;
  const exchange = normalized.match(/Börse\s+(.+?)\s+Verwahrart/i)?.[1]?.trim() ?? null;
  const settlementDate = parseGermanDate(
    normalized.match(/\bWert\s+Konto-Nr\.?.*?(\d{2}\.\d{2}\.\d{4})/i)?.[1] ??
      normalized.match(/\bWert\s+(\d{2}\.\d{2}\.\d{4})/i)?.[1],
  );
  const grossAmount = parseSignedGermanNumber(normalized.match(/Kurswert\s+EUR\s+([-\d.,+]+)/i)?.[1] ?? "");
  const cashAmount =
    parseSignedGermanNumber(normalized.match(/Betrag zu Ihren Lasten.*?EUR\s+([-\d.,+]+)/i)?.[1] ?? "") ??
    parseSignedGermanNumber(normalized.match(/Betrag zu Ihren Gunsten.*?EUR\s+([-\d.,+]+)/i)?.[1] ?? "");

  return {
    accountNumber,
    settlementNumber: settlement?.[1] ?? null,
    settlementDocumentDate: parseGermanDate(settlement?.[2]),
    side,
    name,
    isin,
    quantity,
    price,
    tradeDate,
    tradeTime,
    exchange,
    settlementDate,
    grossAmount,
    cashAmount,
    sourceDocument: filePath,
  };
}

export function parseGinmonEarnings(text, filePath = "") {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const accountNumber =
    normalized.match(/Depot-Nr\.\s*([0-9]+)/i)?.[1] ??
    filePath.match(/divid_([0-9]{10,12})_/i)?.[1] ??
    null;
  const execution =
    normalized.match(/Ausführungs-Nr\.\s*([0-9]+)\s*\/\s*(\d{2}\.\d{2}\.\d{4})/i);
  const eventType =
    normalized.match(/Abrechnung einer Vorabpauschale/i)
      ? "advance_lump_sum"
      : normalized.match(/Ertragsgutschrift|Dividende/i)
        ? "distribution"
        : "earnings";
  const name = normalized.match(/Gattungsbezeichnung\s+(.+?)\s+ISIN\s+[A-Z]{2}[A-Z0-9]{10}/i)?.[1]?.trim() ?? null;
  const isin = normalized.match(/\bISIN\s+([A-Z]{2}[A-Z0-9]{10})\b/i)?.[1] ?? null;
  const quantity = parseGermanNumber(normalized.match(/Nominal\s+STK\s+([\d.,]+)/i)?.[1] ?? "");
  const exDate = parseGermanDate(normalized.match(/Ex-Tag\s+(\d{2}\.\d{2}\.\d{4})/i)?.[1]);
  const paymentDate = parseGermanDate(normalized.match(/Zahltag\s+(\d{2}\.\d{2}\.\d{4})/i)?.[1]);
  const yearlyAmountPerShare = parseGermanNumber(
    normalized.match(/Jahreswert Vorabpauschale pro Stück\s+EUR\s+([\d.,]+)/i)?.[1] ?? "",
  );
  const investmentIncome = parseGermanNumber(
    normalized.match(/Investmentertrag.*?EUR\s+([\d.,]+)/i)?.[1] ?? "",
  );
  const taxDate = parseGermanDate(normalized.match(/Steuerlicher Stichtag:\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]);
  const fundType = normalized.match(/Fondsart:\s+(.+?)\s+Angewendete/i)?.[1]?.trim() ?? null;
  const partialExemptionPct = parseGermanNumber(
    normalized.match(/Angewendete Teilfreistellungsquote:\s*([\d.,]+)%/i)?.[1] ?? "",
  );

  return {
    accountNumber,
    executionNumber: execution?.[1] ?? null,
    executionDocumentDate: parseGermanDate(execution?.[2]),
    eventType,
    name,
    isin,
    quantity,
    exDate,
    paymentDate,
    yearlyAmountPerShare,
    investmentIncome,
    taxDate,
    fundType,
    partialExemptionPct,
    sourceDocument: filePath,
  };
}

export function parseGinmonCorporateAction(text, filePath = "") {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const accountNumber =
    normalized.match(/Depot-Nr\.\s*([0-9]+)/i)?.[1] ??
    filePath.match(/kapma_([0-9]{10,12})_/i)?.[1] ??
    null;
  const noticeDate = parseGermanDate(normalized.match(/München,\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]);
  const name = normalized.match(/Gattungsbezeichnung\s+(.+?)\s+ISIN\s+[A-Z]{2}[A-Z0-9]{10}/i)?.[1]?.trim() ?? null;
  const isin = normalized.match(/\bISIN\s+([A-Z]{2}[A-Z0-9]{10})\b/i)?.[1] ?? null;
  const quantity = parseGermanNumber(normalized.match(/Depotbestand\s+STK\s+([\d.,]+)/i)?.[1] ?? "");
  const effectiveDate = parseGermanDate(normalized.match(/mit Wirkung zum\s+(\d{2}\.\d{2}\.\d{4})/i)?.[1]);
  const actionText =
    normalized.match(/mit Wirkung zum\s+\d{2}\.\d{2}\.\d{4}\s+(.+?)\s+Weitere Informationen/i)?.[1]?.trim() ??
    normalized.match(/Information\s+Sehr geehrte.+?,\s+(.+?)\s+Dieses Schreiben dient/i)?.[1]?.trim() ??
    null;
  const actionType = /Gebührenänderungen/i.test(actionText ?? normalized)
    ? "fee_change"
    : /Verschmelzung|Fusion/i.test(actionText ?? normalized)
      ? "merger"
      : /Ausschüttung/i.test(actionText ?? normalized)
        ? "distribution_notice"
        : "corporate_action";
  const informationUrl = normalized.match(/https?:\/\/\S+|www\.[^\s]+/i)?.[0] ?? null;

  return {
    accountNumber,
    noticeDate,
    effectiveDate,
    actionType,
    actionText,
    name,
    isin,
    quantity,
    quantityText: quantity == null ? null : `${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 4 }).format(quantity)} Stk.`,
    informationUrl,
    sourceDocument: filePath,
  };
}

export function parseGinmonAnnualStatement(text, filePath = "") {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const accountNumber =
    normalized.match(/Depot-Nr\.\s*([0-9]+)/i)?.[1] ??
    filePath.match(/jda_([0-9]{10,12})_/i)?.[1] ??
    null;
  const statementNumber = normalized.match(/Auszug-Nr\.\s*([A-Z0-9]+)/i)?.[1] ?? null;
  const documentDate = parseGermanDate(normalized.match(/München,\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]);
  const statementDate = parseGermanDate(
    normalized.match(/Jahresdepotauszug per\s+(\d{2}\.\d{2}\.\d{4})/i)?.[1] ??
      normalized.match(/Depotauszug per\s+(\d{2}\.\d{2}\.\d{4})/i)?.[1],
  );
  const declaredPositionCount = parseGermanNumber(normalized.match(/Insgesamt\s+([0-9]+)\s+Posten/i)?.[1] ?? "");
  const positions = [];
  const positionPattern =
    /STK\s+([\d.,]+)\s+(.+?)\s+([A-Z]{2}[A-Z0-9]{10})\s+(Wertpapierrechnung|Girosammelverwahrung)\s+([A-Za-zÄÖÜäöüß]+)/g;

  for (const match of normalized.matchAll(positionPattern)) {
    positions.push({
      accountNumber,
      quantity: parseGermanNumber(match[1]),
      quantityText: `${match[1]} Stk.`,
      name: match[2].trim(),
      isin: match[3],
      custodyType: match[4],
      custodyCountry: match[5],
      statementDate,
      sourceDocument: filePath,
    });
  }

  return {
    accountNumber,
    statementNumber,
    documentDate,
    statementDate,
    declaredPositionCount,
    positions,
    sourceDocument: filePath,
  };
}

export function parseGinmonAccountStatement(text, filePath = "") {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const accountNumber =
    normalized.match(/Kontonummer:\s*([0-9]+)/i)?.[1] ??
    filePath.match(/FC_([0-9]{10,12})_/i)?.[1] ??
    null;
  const iban = normalized.match(/\bIBAN:\s*([A-Z0-9]+)/i)?.[1] ?? null;
  const bic = normalized.match(/\bBIC.*?:\s*([A-Z0-9]+)/i)?.[1] ?? null;
  const previousStatement =
    normalized.match(/Letzter Auszug Nr\.\s*([0-9]+)\s+vom\s+(\d{2}\.\d{2}\.\d{4})/i) ?? null;
  const period = normalized.match(/Umsatzzeitraum\s+(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/i);
  const statement = normalized.match(/Auszug Nr\.\s*([0-9]+)\s+(\d{2}\.\d{2}\.\d{4})/i);
  const openingBalance = parseSignedGermanNumber(
    normalized.match(/Alter Kontostand:\s*EUR\s+([-\d.,+]+)/i)?.[1] ?? "",
  );
  const closingBalance = parseSignedGermanNumber(
    normalized.match(/Neuer Kontostand:\s*EUR\s+([-\d.,+]+)/i)?.[1] ?? "",
  );
  const entries = [];
  const entryPattern =
    /(\d{2}\.\d{2}\.)\s+(\d{2}\.\d{2}\.)\s+(.+?)\s+([-\d.,]+[+-])(?=\s+\d{2}\.\d{2}\.|\s+Neuer Kontostand:|\s+Hinweis|\s+Seite\s+\d+\/\d+|$)/g;
  for (const match of normalized.matchAll(entryPattern)) {
    const year = statement?.[2]?.slice(-4) ?? period?.[2]?.slice(-4) ?? new Date().getFullYear();
    entries.push({
      bookingDate: parseGermanDate(`${match[1]}${year}`),
      valueDate: parseGermanDate(`${match[2]}${year}`),
      text: match[3].trim(),
      amount: parseSignedGermanNumber(match[4]),
      currency: "EUR",
    });
  }

  return {
    accountNumber,
    iban,
    bic,
    previousStatementNumber: previousStatement?.[1] ?? null,
    previousStatementDate: parseGermanDate(previousStatement?.[2]),
    periodStart: parseGermanDate(period?.[1]),
    periodEnd: parseGermanDate(period?.[2]),
    statementNumber: statement?.[1] ?? null,
    statementDate: parseGermanDate(statement?.[2]),
    openingBalance,
    closingBalance,
    entries,
    sourceDocument: filePath,
  };
}
