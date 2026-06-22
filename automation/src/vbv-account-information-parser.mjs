function normalizeText(text) {
  return String(text ?? "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseGermanNumber(value) {
  const normalized = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

export function parseGermanDate(value) {
  const match = String(value ?? "").match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function firstMoneyMatch(text, pattern) {
  const match = text.match(pattern);
  return parseGermanNumber(match?.[1]);
}

function roundCurrency(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function roundRatio(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
}

function parseContractBlock(block, index) {
  const normalized = normalizeText(block);
  const employer =
    firstMatch(normalized, /Vertrag:\s*([\s\S]*?)\s+Anwartschaft zum/i) ??
    `VBV Vertrag ${index + 1}`;
  const balanceMatches = [
    ...normalized.matchAll(/Anwartschaft zum\s+(\d{2}\.\d{2}\.\d{4})\s+€\s*([\d.\s-]+,\d{2})/gi),
  ];
  const openingBalance = balanceMatches[0];
  const closingBalance = balanceMatches[balanceMatches.length - 1];
  const contributionsMatch = normalized.match(/Beiträge im Jahr\s+(\d{4})\s+€\s*([\d.\s-]+,\d{2})/i);

  const openingBalanceValue = parseGermanNumber(openingBalance?.[2]);
  const contributionsValue = parseGermanNumber(contributionsMatch?.[2]);
  const administrationCosts = firstMoneyMatch(normalized, /Verwaltungskosten\s+€\s*([\d.\s-]+,\d{2})/i);
  const socialInsuranceCosts = firstMoneyMatch(
    normalized,
    /Barauslagen\s*\(Kosten Sozialversicherungsträger\)\s+€\s*([\d.\s-]+,\d{2})/i,
  );
  const investmentResultNet = firstMoneyMatch(
    normalized,
    /Zugewiesenes Veranlagungsergebnis\s*\(netto\*\)\s+€\s*([\d.\s-]+,\d{2})/i,
  );
  const closingBalanceValue = parseGermanNumber(closingBalance?.[2]);
  const totalCosts = roundCurrency((administrationCosts ?? 0) + (socialInsuranceCosts ?? 0));
  const costValue = roundCurrency((openingBalanceValue ?? 0) + (contributionsValue ?? 0));
  const performanceValue = roundCurrency((investmentResultNet ?? 0) + (totalCosts ?? 0));
  const movementValue = roundCurrency((closingBalanceValue ?? 0) - (openingBalanceValue ?? 0));

  return {
    employer: employer.replace(/\s+/g, " "),
    openingDate: parseGermanDate(openingBalance?.[1]),
    openingBalance: openingBalanceValue,
    contributionYear: contributionsMatch?.[1] ? Number.parseInt(contributionsMatch[1], 10) : null,
    contributions: contributionsValue,
    administrationCosts,
    socialInsuranceCosts,
    totalCosts,
    investmentResultNet,
    costValue,
    performanceValue,
    performancePct: costValue ? roundRatio(performanceValue / costValue) : null,
    movementValue,
    closingDate: parseGermanDate(closingBalance?.[1]),
    closingBalance: closingBalanceValue,
    rawText: normalized.slice(0, 2000),
  };
}

export function parseVbvAccountInformationText(text) {
  const normalized = normalizeText(text);
  const statementDate = parseGermanDate(firstMatch(normalized, /Wien,\s*(\d{2}\.\d{2}\.\d{4})/i));
  const customerNumber = firstMatch(normalized, /Kundennummer:\s*(\d+)/i);
  const totalMatch = normalized.match(
    /Ihre gesamte Anwartschaft zum\s+(\d{2}\.\d{2}\.\d{4})\s+beträgt\s+€\s*([\d.\s-]+,\d{2})/i,
  );
  const valuationDate = parseGermanDate(totalMatch?.[1]);
  const totalValue = parseGermanNumber(totalMatch?.[2]);
  const guaranteedCapital = firstMoneyMatch(
    normalized,
    /garantierte Kapital bereits\s+€\s*([\d.\s-]+,\d{2})/i,
  );
  const contractBlocks = [
    ...normalized.matchAll(/Vertrag:\s*([\s\S]*?)(?=Vertrag:|Ihre gesamte Anwartschaft|Unsere Kapitalgarantie|Freundliche Grüße)/gi),
  ].map((match) => `Vertrag: ${match[1]}`);
  const contracts = contractBlocks.map(parseContractBlock);
  const parsedContractsValue = Math.round(
    contracts.reduce((sum, contract) => sum + (contract.closingBalance ?? 0), 0) * 100,
  ) / 100;
  const hasRequiredSummary =
    Boolean(valuationDate) &&
    typeof totalValue === "number" &&
    contracts.length > 0 &&
    contracts.every((contract) => contract.employer && typeof contract.closingBalance === "number");
  const valueDifference =
    typeof totalValue === "number" ? Math.round((totalValue - parsedContractsValue) * 100) / 100 : null;
  const openingBalanceTotal = roundCurrency(contracts.reduce((sum, contract) => sum + (contract.openingBalance ?? 0), 0));
  const contributionsTotal = roundCurrency(contracts.reduce((sum, contract) => sum + (contract.contributions ?? 0), 0));
  const administrationCostsTotal = roundCurrency(
    contracts.reduce((sum, contract) => sum + (contract.administrationCosts ?? 0), 0),
  );
  const socialInsuranceCostsTotal = roundCurrency(
    contracts.reduce((sum, contract) => sum + (contract.socialInsuranceCosts ?? 0), 0),
  );
  const totalCosts = roundCurrency(contracts.reduce((sum, contract) => sum + (contract.totalCosts ?? 0), 0));
  const investmentResultNetTotal = roundCurrency(
    contracts.reduce((sum, contract) => sum + (contract.investmentResultNet ?? 0), 0),
  );
  const costValue = roundCurrency((openingBalanceTotal ?? 0) + (contributionsTotal ?? 0));
  const performanceValue = roundCurrency((investmentResultNetTotal ?? 0) + (totalCosts ?? 0));
  const movementValue = roundCurrency((totalValue ?? 0) - (openingBalanceTotal ?? 0));
  const guaranteeSurplus = roundCurrency((totalValue ?? 0) - (guaranteedCapital ?? 0));

  return {
    source: "vbv",
    documentType: "account_information",
    parseStatus: hasRequiredSummary && Math.abs(valueDifference ?? 0) < 0.02 ? "PARSED" : "INCOMPLETE",
    statementDate,
    valuationDate,
    customerNumber,
    totalValue,
    guaranteedCapital,
    guaranteeSurplus,
    openingBalanceTotal,
    contributionsTotal,
    administrationCostsTotal,
    socialInsuranceCostsTotal,
    totalCosts,
    investmentResultNetTotal,
    costValue,
    performanceValue,
    performancePct: costValue ? roundRatio(performanceValue / costValue) : null,
    movementValue,
    parsedContractsValue,
    valueDifference,
    contracts,
    rawText: normalized.slice(0, 12000),
  };
}

export function buildVbvAccountInformationFacts(parsed, { documentId, importId, fileHash, semanticHash, importedAt }) {
  const base = {
    source: "vbv",
    documentId,
    importId,
    fileHash,
    semanticHash,
    documentType: parsed.documentType,
    statementDate: parsed.statementDate,
    valuationDate: parsed.valuationDate,
    importedAt,
  };
  const facts = [
    {
      id: `${documentId}_summary`,
      ...base,
      factType: "vbv_account_information_summary",
      totalValue: parsed.totalValue,
      guaranteedCapital: parsed.guaranteedCapital,
      guaranteeSurplus: parsed.guaranteeSurplus,
      openingBalanceTotal: parsed.openingBalanceTotal,
      contributionsTotal: parsed.contributionsTotal,
      administrationCostsTotal: parsed.administrationCostsTotal,
      socialInsuranceCostsTotal: parsed.socialInsuranceCostsTotal,
      totalCosts: parsed.totalCosts,
      investmentResultNetTotal: parsed.investmentResultNetTotal,
      costValue: parsed.costValue,
      performanceValue: parsed.performanceValue,
      performancePct: parsed.performancePct,
      movementValue: parsed.movementValue,
      parsedContractsValue: parsed.parsedContractsValue,
      valueDifference: parsed.valueDifference,
      customerNumber: parsed.customerNumber,
      contractCount: parsed.contracts.length,
      status: parsed.parseStatus,
    },
  ];

  parsed.contracts.forEach((contract, index) => {
    facts.push({
      id: `${documentId}_contract_${index + 1}`,
      ...base,
      factType: "vbv_contract_snapshot",
      contractIndex: index + 1,
      employer: contract.employer,
      openingDate: contract.openingDate,
      openingBalance: contract.openingBalance,
      contributionYear: contract.contributionYear,
      contributions: contract.contributions,
      administrationCosts: contract.administrationCosts,
      socialInsuranceCosts: contract.socialInsuranceCosts,
      totalCosts: contract.totalCosts,
      investmentResultNet: contract.investmentResultNet,
      costValue: contract.costValue,
      performanceValue: contract.performanceValue,
      performancePct: contract.performancePct,
      movementValue: contract.movementValue,
      closingDate: contract.closingDate,
      closingBalance: contract.closingBalance,
      rawText: contract.rawText,
      status: parsed.parseStatus,
    });
  });

  return facts;
}
