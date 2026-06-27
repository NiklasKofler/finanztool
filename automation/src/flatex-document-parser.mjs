export function parseGermanNumber(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const cleaned = String(value).trim();
  if (!cleaned || cleaned === "-") return null;
  const sign = cleaned.endsWith("-") ? -1 : 1;
  const normalized = cleaned
    .replace(/[+-]$/, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? sign * parsed : null;
}

export function parseGermanDate(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function normalizeText(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬁ/g, "fi")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyFlatexDocument(fileName, text = "") {
  const haystack = `${fileName} ${text}`.toLowerCase();
  if (/wertpapierabrechnung|kauffondszertifikate|sammelabrechnung/.test(haystack)) return "security_trade";
  if (/dividendeauslaend|dividendengutschrift|fondsertragsausschuettung|fondsertragsausschüttung/.test(haystack)) return "income_distribution";
  if (/fondsthesaurierung|ertragsmitteilung - thesaurierender/.test(haystack)) return "fund_accumulation";
  if (/kontoauszug|aufstellung über kundenfinanzinstrumente|aufstellung ueber kundenfinanzinstrumente/.test(haystack)) return "account_statement";
  if (/depotauszug/.test(haystack)) return "depot_statement";
  if (/saldenmitteilung/.test(haystack)) return "balance_notice";
  if (/steuerbescheinigung|steuerreporting/.test(haystack)) return "tax_certificate";
  if (/fusion/.test(haystack)) return "corporate_action";
  if (/cfd-abrechnung/.test(haystack)) return "cfd_statement";
  if (/orderbestaetigung|orderbestätigung|orderaenderung|orderänderung|auftragsstreichung/.test(haystack)) return "order_notice";
  if (/bestaetigungneuanlageaenderungzahlungsplaene|bestätigungneuanlageänderungzahlungspläne|zahlungsplaene|zahlungspläne/.test(haystack)) return "savings_plan_notice";
  if (/mifidkosteninformation|kosteninformation/.test(haystack)) return "cost_information";
  if (/gutschrifts-belastungsanzeige/.test(haystack)) return "cash_adjustment";
  if (/sepa-lastschriftmandat|bestaetigunganlagemandat|bestätigung.*mandat|mandatsreferenz/.test(haystack)) return "sepa_mandate";
  if (/konto-depotinformation|serienanschreibendepot|kundenanschreiben|anschreibeninformationsbogeneinlagensicherung|willkommensbrief|zusendungagb|risikoklasse|referenzkontoaenderung|referenzkontoänderung|basisinformationsblatt|verkaufspropekt|verkaufsprospekt|kontoeroeffnung|kontoeröffnung|info_amundi/.test(haystack)) return "info_notice";
  if (/studienbeihilfenbehörde|studienbeihilfenbehoerde|stipendienstelle|mah[n]?ung/.test(haystack)) return "misfiled_external";
  if (/screencapture/.test(haystack)) return "screenshot";
  return "unknown";
}

export function commonFlatexFields(text, filePath = "") {
  const normalized = normalizeText(text);
  const fileName = filePath.split("/").pop() ?? "";
  return {
    documentDate: parseGermanDate(
      normalized.match(/Graz,\s*(?:den\s*)?(\d{2}\.\d{2}\.\d{4})/i)?.[1] ??
        fileName.match(/^(\d{8})/)?.[1]?.replace(/(\d{4})(\d{2})(\d{2})/, "$3.$2.$1"),
    ),
    accountNumber:
      normalized.match(/Kontonummer\s*:?\s*([0-9]{8,})/i)?.[1] ??
      normalized.match(/Konto Nr\.\s*:?\s*([0-9]{8,})/i)?.[1] ??
      fileName.match(/_([0-9]{10,12})_[0-9]+\.pdf$/i)?.[1] ??
      null,
    depotNumber:
      normalized.match(/Depotnummer\s*:?\s*([0-9]{8,})/i)?.[1] ??
      normalized.match(/Ihre Depotnummer\s*:?\s*([0-9]{8,})/i)?.[1] ??
      null,
    customerNumber: normalized.match(/Kundennummer\s*:?\s*([0-9]{6,})/i)?.[1] ?? null,
    postboxDocumentId: fileName.match(/_([0-9]{8,})\.pdf$/i)?.[1] ?? null,
    sourceDocument: filePath,
  };
}

function instrumentFromBlock(block) {
  const match = block.match(/([A-Z0-9ÄÖÜ().,&'\- /]+?)\s*\(([A-Z]{2}[A-Z0-9]{10})\/([A-Z0-9]+)\)/i);
  return {
    name: match?.[1]?.trim() ?? null,
    isin: match?.[2] ?? block.match(/\b([A-Z]{2}[A-Z0-9]{10})\b/)?.[1] ?? null,
    wkn: match?.[3] ?? null,
  };
}

function parseTradeBlock(block, common) {
  const instrument = instrumentFromBlock(block);
  const sideText = block.match(/\b(Kauf|Verkauf)\b/i)?.[1] ?? null;
  const quantity =
    parseGermanNumber(block.match(/(?:Ordervolumen|Ausgeführt|davon ausgef\.)\s*:\s*([\d.,]+)/i)?.[1] ?? "") ??
    parseGermanNumber(block.match(/\bSt\.\s*:\s*([\d.,]+)/i)?.[1] ?? "");
  return {
    ...instrument,
    accountNumber: common.accountNumber,
    depotNumber: common.depotNumber,
    orderNumber: block.match(/Nr\.([0-9]+\/[0-9]+)/i)?.[1] ?? null,
    transactionNumber: block.match(/Transaktion-Nr\.:\s*([0-9]+)/i)?.[1] ?? null,
    side: sideText?.toLowerCase() === "verkauf" ? "sell" : sideText ? "buy" : null,
    quantity,
    quantityText: quantity == null ? null : `${quantity} St.`,
    tradeDate: parseGermanDate(
      block.match(/Schlusstag\s*:\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1] ??
        block.match(/Handelstag\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1],
    ),
    tradeTime: block.match(/Schlusstag\s*:\s*\d{2}\.\d{2}\.\d{4},\s*([0-9:]+)\s*Uhr/i)?.[1] ??
      block.match(/Ausführungszeit\s*([0-9:]+)\s*Uhr/i)?.[1] ??
      null,
    settlementDate: parseGermanDate(block.match(/Valuta\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]),
    exchange: block.match(/Handelsplatz\s*:\s*(.+?)\s+(?:davon|Schlusstag|Kurs|Ausgeführt)/i)?.[1]?.trim() ??
      block.match(/Ausf\.platz\/-art\s+(.+?)\s+Herrn/i)?.[1]?.trim() ??
      null,
    price: parseGermanNumber(block.match(/\bKurs\s*:?\s*([\d.,]+)\s*EUR/i)?.[1] ?? ""),
    grossAmount: parseGermanNumber(block.match(/Kurswert\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    provision: parseGermanNumber(block.match(/Provision\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    externalFees: parseGermanNumber(block.match(/Fremde Spesen\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    withheldTax: parseGermanNumber(block.match(/(?:Einbeh\. Steuer|Einbeh\. KESt)\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    profitLoss: parseGermanNumber(block.match(/Gewinn\/Verlust\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    cashAmount: parseGermanNumber(block.match(/Endbetrag\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    currency: "EUR",
  };
}

export function parseFlatexSecurityTrade(text, filePath = "") {
  const normalized = normalizeText(text);
  const common = commonFlatexFields(normalized, filePath);
  const blocks = [];
  const pattern = /Nr\.[0-9]+\/[0-9]+\s+(?:Kauf|Verkauf)\s+.+?(?=(?:\s+Nr\.[0-9]+\/[0-9]+\s+(?:Kauf|Verkauf)\s)|(?:\s+Die Verrechnung)|(?:\s+__+)|$)/gi;
  for (const match of normalized.matchAll(pattern)) blocks.push(match[0]);
  const trades = (blocks.length ? blocks : [normalized])
    .map((block) => parseTradeBlock(block, common))
    .filter((trade) => trade.isin || trade.name || trade.orderNumber);
  return { ...common, trades };
}

export function parseFlatexIncomeDistribution(text, filePath = "") {
  const normalized = normalizeText(text);
  const common = commonFlatexFields(normalized, filePath);
  return {
    ...common,
    ...instrumentFromBlock(normalized),
    transactionNumber: normalized.match(/Nr\.([0-9]+)/i)?.[1] ?? normalized.match(/Transaktion-Nr\.:\s*([0-9]+)/i)?.[1] ?? null,
    quantity: parseGermanNumber(normalized.match(/\bSt\.\s*:\s*([\d.,]+)/i)?.[1] ?? ""),
    exDate: parseGermanDate(normalized.match(/Extag\s*:\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]),
    paymentDate: parseGermanDate(normalized.match(/Zahlungstag\s*:\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]),
    settlementDate: parseGermanDate(normalized.match(/Valuta\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]),
    grossPerShare: parseGermanNumber(normalized.match(/(?:Bruttodividende|Ausschüttung) pro Stück\s*:\s*([\d.,]+)/i)?.[1] ?? ""),
    grossAmount: parseGermanNumber(normalized.match(/(?:Bruttodividende|Ausschüttung)\s*:?\s*([-\d.,]+)\s*[A-Z]{3}/i)?.[1] ?? ""),
    taxBase: parseGermanNumber(normalized.match(/Bemessungs-?\s*grundlage\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    withheldTax: parseGermanNumber(normalized.match(/Einbeh\. Steuer\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    withholdingTaxRate: parseGermanNumber(normalized.match(/Quellenst\.-satz\s*:?\s*([\d.,]+)\s*%/i)?.[1] ?? ""),
    withholdingTax: parseGermanNumber(normalized.match(/Gez\. Quellenst\.\s*:?\s*([-\d.,]+)\s*[A-Z]{3}/i)?.[1] ?? ""),
    fxRate: parseGermanNumber(normalized.match(/Devisenkurs\s*:?\s*([\d.,]+)/i)?.[1] ?? ""),
    cashAmount: parseGermanNumber(normalized.match(/Endbetrag\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
  };
}

export function parseFlatexFundAccumulation(text, filePath = "") {
  const normalized = normalizeText(text);
  const common = commonFlatexFields(normalized, filePath);
  return {
    ...common,
    ...instrumentFromBlock(normalized),
    transactionNumber: normalized.match(/Nr\.([0-9]+)/i)?.[1] ?? normalized.match(/Transaktion-Nr\.:\s*([0-9]+)/i)?.[1] ?? null,
    quantity: parseGermanNumber(normalized.match(/\bSt\.\s*:\s*([\d.,]+)/i)?.[1] ?? ""),
    exDate: parseGermanDate(normalized.match(/Extag\s*:\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]),
    settlementDate: parseGermanDate(normalized.match(/Valuta\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]),
    inflowDate: parseGermanDate(normalized.match(/Zuflusstag\s*:\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]),
    grossPerShare: parseGermanNumber(normalized.match(/Bruttothesaurierung pro Stück\s*:\s*([\d.,]+)/i)?.[1] ?? ""),
    grossAmount: parseGermanNumber(normalized.match(/Bruttothesaurierung\s*:?\s*([-\d.,]+)\s*[A-Z]{3}/i)?.[1] ?? ""),
    taxableIncome: parseGermanNumber(normalized.match(/steuerpflichtiger Ertrag\s*:?\s*([-\d.,]+)\s*[A-Z]{3}/i)?.[1] ?? ""),
    withheldTax: parseGermanNumber(normalized.match(/Einbeh\. Steuer\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    fxRate: parseGermanNumber(normalized.match(/Devisenkurs\s*:?\s*([\d.,]+)/i)?.[1] ?? ""),
    cashAmount: parseGermanNumber(normalized.match(/Endbetrag\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
  };
}

export function parseFlatexAccountStatement(text, filePath = "") {
  const normalized = normalizeText(text);
  const common = commonFlatexFields(normalized, filePath);
  const positions = [];
  const pattern = /\b([A-Z]{2}[A-Z0-9]{10})\*{0,4}\s+([-\d.,]+)\s*EUR/g;
  for (const match of normalized.matchAll(pattern)) {
    positions.push({
      isin: match[1],
      marketValue: parseGermanNumber(match[2]),
      currency: "EUR",
    });
  }
  return {
    ...common,
    statementDate: parseGermanDate(normalized.match(/Aufstellung zum\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]),
    accountBalance: parseGermanNumber(normalized.match(/Kontostand\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    positions,
  };
}

export function parseFlatexDepotStatement(text, filePath = "") {
  const normalized = normalizeText(text);
  const common = commonFlatexFields(normalized, filePath);
  const positions = [];
  const lines = String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬁ/g, "fi")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headerMatch = line.match(/^([0-9.]+,[0-9]{6})\s+(.+?)\s+(Clearstream\s+(?:Lux\.|Nat\.))/i);
    if (!headerMatch) continue;
    const lookahead = lines.slice(index + 1, index + 10);
    const isin = lookahead.map((entry) => entry.match(/\b([A-Z]{2}[A-Z0-9]{10})\b/)?.[1]).find(Boolean) ?? null;
    const valueLine = lookahead.find((entry) => /[-\d.]+,\d{2}\s*EUR\s+[-\d.]+,\d{6}\s*(?:EUR|USD)/i.test(entry));
    const valueMatch = valueLine?.match(/([-\d.]+,\d{2})\s*EUR\s+([-\d.]+,\d{6})\s*(EUR|USD)(?:\s+([-\d.]+,\d{6}))?/i);
    if (!isin || !valueMatch) continue;
    positions.push({
      quantity: parseGermanNumber(headerMatch[1]),
      quantityText: `${headerMatch[1]} Stück`,
      name: headerMatch[2].trim(),
      isin,
      custodyText: headerMatch[3].trim(),
      marketValue: parseGermanNumber(valueMatch[1]),
      valuationPrice: parseGermanNumber(valueMatch[2]),
      valuationCurrency: valueMatch[3] ?? "EUR",
      fxRate: parseGermanNumber(valueMatch[4] ?? ""),
      currency: "EUR",
    });
  }
  if (!positions.length) {
    const positionPattern = /([\d.,]+)\s+(.+?)\s+(?:Clearstream\s+(?:Lux\.|Nat\.)|[A-Za-z. ]+)\s+([A-Z]{2}[A-Z0-9]{10})\s+(.+?)\s+([-\d.,]+)\s*EUR\s+([-\d.,]+)\s*EUR/gi;
    for (const match of normalized.matchAll(positionPattern)) {
      positions.push({
        quantity: parseGermanNumber(match[1]),
        quantityText: `${match[1]} Stück`,
        name: match[2].trim(),
        isin: match[3],
        custodyText: match[4].trim(),
        marketValue: parseGermanNumber(match[5]),
        valuationPrice: parseGermanNumber(match[6]),
        currency: "EUR",
      });
    }
  }
  return {
    ...common,
    statementDate: parseGermanDate(normalized.match(/Depotauszug zum\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]),
    statementNumber: normalized.match(/Auszugsnummer\s*:?\s*([0-9/]+)/i)?.[1] ?? null,
    declaredPositionCount: parseGermanNumber(normalized.match(/Anzahl Posten\s*:?\s*([0-9]+)/i)?.[1] ?? ""),
    totalValue: parseGermanNumber(normalized.match(/Wert der Posten\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    positions,
  };
}

export function parseFlatexCorporateAction(text, filePath = "") {
  const normalized = normalizeText(text);
  const common = commonFlatexFields(normalized, filePath);
  const instruments = [];
  const pattern = /\b([A-Z0-9]{3,8})\s+([A-Z]{2}[A-Z0-9]{10})\s+(.+?)\s+([\d.,]+)(?=\s+(?:Sehr geehrte|WKN|Steuerpfl|Einbeh|Verrechnung|Belastung|$))/gi;
  for (const match of normalized.matchAll(pattern)) {
    instruments.push({
      wkn: match[1],
      isin: match[2],
      name: match[3].trim(),
      quantity: parseGermanNumber(match[4]),
    });
  }
  return {
    ...common,
    actionType: /storno/i.test(normalized) ? "reversal" : /fusion/i.test(normalized) ? "merger" : "corporate_action",
    valuationDate: parseGermanDate(normalized.match(/Valuta\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]),
    ratio: normalized.match(/Verhältnis\s+([\d.,]+\s+zu\s+[\d.,]+)/i)?.[1] ?? null,
    taxableIncome: parseGermanNumber(normalized.match(/Steuerpfl\. Ertrag\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    withheldTax: parseGermanNumber(normalized.match(/Einbeh\. Steuer\*{0,2}\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    cashAmount: parseGermanNumber(normalized.match(/Belastung\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
    instruments,
  };
}

export function parseFlatexTaxCertificate(text, filePath = "") {
  const normalized = normalizeText(text);
  const common = commonFlatexFields(normalized, filePath);
  const entries = [];
  const entryPattern = /(Kennzahl\s+[0-9]+).*?([-\d.,]+)\s*EUR(?:\s+([-\d.,]+)\s*EUR)?(?:\s+([-\d.,]+)\s*EUR)?/gi;
  for (const match of normalized.matchAll(entryPattern)) {
    entries.push({
      label: match[1],
      income: parseGermanNumber(match[2]),
      creditableForeignTax: parseGermanNumber(match[3] ?? ""),
      capitalGainsTax: parseGermanNumber(match[4] ?? ""),
    });
  }
  return {
    ...common,
    taxYear: normalized.match(/Steuerreporting.*?(\d{4})/i)?.[1] ?? null,
    orderNumber: normalized.match(/Ordnungsnummer:\s*([0-9]+)/i)?.[1] ?? null,
    entries,
  };
}

export function parseFlatexCashAdjustment(text, filePath = "") {
  const normalized = normalizeText(text);
  const common = commonFlatexFields(normalized, filePath);
  const grossAmount = parseGermanNumber(
    normalized.match(/in Höhe von\s*([-\d.,]+)\s*EUR/i)?.[1] ??
      normalized.match(/in Hoehe von\s*([-\d.,]+)\s*EUR/i)?.[1] ??
      normalized.match(/(?:Endbetrag|Belastung|Gutschrift)\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ??
      "",
  );
  const isDebit = /wir belasten/i.test(normalized);
  const isCredit = /wir schreiben gut|gutschrift/i.test(normalized);
  const cashAmount =
    grossAmount == null ? null : isDebit ? -Math.abs(grossAmount) : isCredit ? Math.abs(grossAmount) : grossAmount;
  return {
    ...common,
    title:
      normalized.match(/Graz,\s*(?:den\s*)?\d{2}\.\d{2}\.\d{4}\s+(.+?)\s+Kundennummer/i)?.[1]?.trim() ??
      normalized.match(/(Depotservicegebühr\s+[A-Z]{2}[A-Z0-9]{10})/i)?.[1]?.trim() ??
      null,
    adjustmentType: /Depotservicegebühr/i.test(normalized) ? "depot_service_fee" : "cash_adjustment",
    valuationDate: parseGermanDate(normalized.match(/Valuta\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]),
    wkn: normalized.match(/\b([A-Z0-9]{3,8})\s+([A-Z]{2}[A-Z0-9]{10})\s+/i)?.[1] ?? null,
    isin: normalized.match(/\b([A-Z]{2}[A-Z0-9]{10})\b/)?.[1] ?? null,
    name: normalized.match(/\b[A-Z0-9]{3,8}\s+[A-Z]{2}[A-Z0-9]{10}\s+(.+?)\s+[\d.,]+\s+Sehr geehr/i)?.[1]?.trim() ?? null,
    quantity: parseGermanNumber(
      normalized.match(/\b[A-Z0-9]{3,8}\s+[A-Z]{2}[A-Z0-9]{10}\s+.+?\s+([\d.,]+)\s+Sehr geehr/i)?.[1] ?? "",
    ),
    grossAmount,
    amount: cashAmount,
    cashAmount,
    currency: "EUR",
  };
}

function parseCostSummaryLine(normalized, label) {
  return parseGermanNumber(normalized.match(new RegExp(`${label}\\s+([\\d.,]+)`, "i"))?.[1] ?? "");
}

function parseProductCostBlock(block) {
  return {
    serviceCosts: parseCostSummaryLine(block, "Dienstleistungskosten"),
    otherCosts: parseCostSummaryLine(block, "Weitere Kosten"),
    productCosts: parseCostSummaryLine(block, "Produktkosten"),
    fxCosts: parseCostSummaryLine(block, "Fremdwährungskosten|Fremdwaehrungskosten"),
    rebates: parseCostSummaryLine(block, "Rückvergütung|Rueckverguetung"),
  };
}

export function parseFlatexCostInformation(text, filePath = "") {
  const normalized = normalizeText(text);
  const common = commonFlatexFields(normalized, filePath);
  const products = [];
  const productMatches = [...normalized.matchAll(/([A-Z0-9ÄÖÜ.,&'()\- /]+?)\s*\/\s*([A-Z]{2}[A-Z0-9]{10})\s+([-\d.,]+)/gi)];
  for (let index = 0; index < productMatches.length; index += 1) {
    const match = productMatches[index];
    const next = productMatches[index + 1];
    const block = normalized.slice(match.index ?? 0, next?.index ?? normalized.length);
    const costs = parseProductCostBlock(block);
    products.push({
      name: match[1].trim(),
      isin: match[2],
      totalCosts: parseGermanNumber(match[3]),
      currency: "EUR",
      ...costs,
    });
  }
  return {
    ...common,
    title: "Jaehrliche Kosteninformation",
    costYear: normalized.match(/Kalenderjahr\s*(\d{4})/i)?.[1] ?? null,
    totalCosts: parseCostSummaryLine(normalized, "Gesamtkosten"),
    serviceCosts: parseCostSummaryLine(normalized, "Dienstleistungskosten"),
    otherCosts: parseCostSummaryLine(normalized, "Weitere Kosten"),
    productCosts: parseCostSummaryLine(normalized, "Produktkosten"),
    fxCosts: parseCostSummaryLine(normalized, "Fremdwährungskosten|Fremdwaehrungskosten"),
    rebates: parseCostSummaryLine(normalized, "Rückvergütung|Rueckverguetung"),
    ancillaryCosts: parseCostSummaryLine(normalized, "Nebendienstleistungen"),
    products,
    currency: "EUR",
  };
}

export function parseFlatexSimpleNotice(text, filePath = "") {
  const normalized = normalizeText(text);
  return {
    ...commonFlatexFields(normalized, filePath),
    title:
      normalized.match(/(?:Graz,\s*(?:den\s*)?\d{2}\.\d{2}\.\d{4}\s+)(.{5,120}?)(?:\s+Ihre|\s+Kundennummer|\s+Kontonummer|\s+Herrn|\s+Niklas|$)/i)?.[1]?.trim() ??
      null,
    containsIsin: /\b[A-Z]{2}[A-Z0-9]{10}\b/.test(normalized),
    isin: normalized.match(/\b([A-Z]{2}[A-Z0-9]{10})\b/)?.[1] ?? null,
    amount: parseGermanNumber(normalized.match(/(?:Endbetrag|Belastung|Gutschrift)\s*:?\s*([-\d.,]+)\s*EUR/i)?.[1] ?? ""),
  };
}

export function parseFlatexDocumentByType(type, text, filePath = "") {
  if (type === "security_trade") return parseFlatexSecurityTrade(text, filePath);
  if (type === "income_distribution") return parseFlatexIncomeDistribution(text, filePath);
  if (type === "fund_accumulation") return parseFlatexFundAccumulation(text, filePath);
  if (type === "account_statement") return parseFlatexAccountStatement(text, filePath);
  if (type === "depot_statement") return parseFlatexDepotStatement(text, filePath);
  if (type === "corporate_action") return parseFlatexCorporateAction(text, filePath);
  if (type === "tax_certificate") return parseFlatexTaxCertificate(text, filePath);
  if (type === "cash_adjustment") return parseFlatexCashAdjustment(text, filePath);
  if (type === "cost_information") return parseFlatexCostInformation(text, filePath);
  if (type === "unknown") return null;
  return parseFlatexSimpleNotice(text, filePath);
}
