import "dotenv/config";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { ensureGinmonLogin, launchGinmonBrowser } from "./ginmon-browser.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");
const driveRoot =
  process.env.DEPOT_DRIVE_ROOT ??
  path.join(
    os.homedir(),
    "Library",
    "CloudStorage",
    "GoogleDrive-niklas.kofler@gmail.com",
    "My Drive",
    "Depot",
  );
const sourceDirectories = [
  path.join(driveRoot, "00_Inbox", "Ginmon"),
  path.join(driveRoot, "01_Originale", "Ginmon"),
  path.join(driveRoot, "02_Archiviert", "Ginmon"),
];
const knownAccountMetaByCustomerId = new Map([
  ["2153769", { label: "Investment", strategy: "Investment" }],
  ["2164403", { label: "Ginmon Top Zinsen", strategy: "Ginmon Top Zinsen" }],
  ["2164405", { label: "Risikoklasse 10 Global", strategy: "Risikoklasse 10 Global" }],
]);

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function roundCurrency(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

function sum(values) {
  return values.reduce((total, value) => total + (typeof value === "number" ? value : 0), 0);
}

function accountLabelFromMeta(meta) {
  return meta?.strategy ?? meta?.label ?? meta?.accountNumber ?? meta?.customerId ?? "Ginmon";
}

function formatGermanPrice(value) {
  return new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildCustomerIdsFromSummary(summary, positions) {
  return [
    ...new Set([
      ...(summary?.accounts ?? []).map((account) => account.customerId).filter(Boolean),
      ...positions.map((position) => position.customerId).filter(Boolean),
    ]),
  ];
}

async function listPdfFiles(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listPdfFiles(filePath);
      return entry.isFile() && entry.name.toLowerCase().endsWith(".pdf") ? [filePath] : [];
    }),
  );
  return nested.flat();
}

function customerIdFromFile(filePath) {
  return path.basename(filePath).match(/customer-([0-9]+)/i)?.[1] ?? null;
}

function accountNumberFromFile(filePath) {
  return path.basename(filePath).match(/(?:VS|FC|wpabr|divid)_([0-9]{12})/i)?.[1] ?? null;
}

function latestPositionFactsByAccountAndIsin(facts) {
  const latest = new Map();
  for (const fact of facts) {
    if (fact.source !== "ginmon" || fact.factType !== "position_snapshot") continue;
    if (!fact.accountNumber) continue;
    const key = `${fact.accountNumber}_${fact.isin ?? "cash"}`;
    const existing = latest.get(key);
    if (!existing || String(fact.valuationDate ?? "") > String(existing.valuationDate ?? "")) {
      latest.set(key, fact);
    }
  }
  return latest;
}

async function discoverCustomerMetaFromFiles() {
  const files = [...new Set((await Promise.all(sourceDirectories.map(listPdfFiles))).flat())];
  const metaByCustomer = new Map();
  for (const filePath of files) {
    const customerId = customerIdFromFile(filePath);
    const accountNumber = accountNumberFromFile(filePath);
    if (!customerId) continue;
    const existing = metaByCustomer.get(customerId) ?? { customerId };
    metaByCustomer.set(customerId, {
      ...existing,
      accountNumber: existing.accountNumber ?? accountNumber ?? null,
    });
  }
  return metaByCustomer;
}

async function captureAuthorization(page) {
  let authorization = null;
  page.on("request", (request) => {
    if (authorization) return;
    if (!request.url().includes("api.ginmon.de/apeiron/v4/summary/")) return;
    authorization = request.headers().authorization ?? null;
  });
  await page.goto("https://app.ginmon.de/", { waitUntil: "domcontentloaded" });
  const startedAt = Date.now();
  while (!authorization && Date.now() - startedAt < 20000) {
    await page.waitForTimeout(500);
  }
  if (!authorization) throw new Error("Ginmon Summary API Authorization Header nicht gefunden.");
  return authorization;
}

async function fetchJson(url, authorization) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization,
    },
  });
  if (!response.ok) throw new Error(`Ginmon API Fehler ${response.status}: ${await response.text()}`);
  return response.json();
}

async function fetchCurrentSummary(authorization, customerIds) {
  const url = new URL("https://api.ginmon.de/apeiron/v4/summary/");
  for (const customerId of customerIds) url.searchParams.append("customerId", customerId);
  const payload = await fetchJson(url, authorization);
  return Array.isArray(payload) ? payload[0] : payload;
}

async function readCapturedSummary() {
  const capturePath =
    readArg("--from-capture") ??
    path.join(path.resolve("runtime"), "ginmon-summary-api-captured.json");
  const raw = JSON.parse(await fs.readFile(capturePath, "utf8"));
  const capture = Array.isArray(raw) ? raw.at(-1) : raw;
  const body = typeof capture.body === "string" ? JSON.parse(capture.body) : capture.body;
  return Array.isArray(body) ? body[0] : body;
}

function buildLivePositions({ currentSummary, existingPositions, accountMetaByCustomer, latestPositionFacts }) {
  const existingById = new Map(existingPositions.map((position) => [position.id, position]));
  const livePositions = [];

  for (const account of currentSummary.items ?? []) {
    const customerId = String(account.customerId);
    const meta = accountMetaByCustomer.get(customerId) ?? { customerId };
    const accountNumber = meta.accountNumber ?? `customer_${customerId}`;
    const portfolioLabel = accountLabelFromMeta(meta);

    for (const allocation of account.allocation ?? []) {
      const isin = allocation.security;
      const id = `ginmon_${accountNumber}_${isin}`;
      const existing = existingById.get(id);
      const documentFact = latestPositionFacts.get(`${accountNumber}_${isin}`);
      const currentValue = roundCurrency(allocation.amount);
      const quantity = typeof documentFact?.quantity === "number" ? documentFact.quantity : null;
      const apiCurrentPrice =
        typeof quantity === "number" && quantity > 0 && typeof currentValue === "number"
          ? currentValue / quantity
          : null;
      const costValue = typeof documentFact?.costValue === "number" ? roundCurrency(documentFact.costValue) : null;
      const performanceValue = typeof costValue === "number" ? roundCurrency(currentValue - costValue) : null;
      livePositions.push({
        ...(existing ?? {}),
        id,
        source: "ginmon",
        name: documentFact?.name ?? existing?.name ?? `ISIN ${isin}`,
        category: `Investmentfonds - ${portfolioLabel}`,
        isin,
        wkn: documentFact?.wkn ?? existing?.wkn ?? null,
        quantity,
        quantityText: documentFact?.quantityText ?? null,
        quantityEstimated: false,
        quoteText: apiCurrentPrice === null ? existing?.quoteText ?? null : `${formatGermanPrice(apiCurrentPrice)} EUR`,
        quotePrice: apiCurrentPrice,
        quoteCurrency: "EUR",
        quotePriceEur: apiCurrentPrice,
        quoteProvider: apiCurrentPrice === null ? existing?.quoteProvider ?? null : "ginmon_api",
        quoteAsOf: account.date ?? currentSummary.date ?? null,
        quoteStatus: apiCurrentPrice === null ? "MISSING_QUANTITY" : "OK",
        currentValue,
        costValue,
        performanceValue,
        performancePct: costValue ? performanceValue / costValue : null,
        accountNumber,
        customerId,
        portfolioLabel,
        allocationRatio: allocation.ratio ?? null,
        accountValueIncluded: true,
        valuationDate: account.date ?? currentSummary.date ?? null,
        valuationMethod: "ginmon_document_position_with_api_current_value_v1",
        sourceDocument: documentFact?.sourceDocument ?? existing?.sourceDocument ?? null,
        sourceDocumentFactId: documentFact?.id ?? null,
        dataSources: {
          quantity: documentFact ? "sourceDocumentFacts.position_snapshot" : null,
          costValue: documentFact?.costValue == null ? null : "sourceDocumentFacts.position_snapshot",
          currentValue: "ginmon_api.summary.allocation.amount",
          quote: apiCurrentPrice === null ? null : "ginmon_api.summary.allocation.amount / document_quantity",
        },
      });
    }

    const cashId = `ginmon_${accountNumber}_cash`;
    const existingCash = existingById.get(cashId);
    const cashFact = latestPositionFacts.get(`${accountNumber}_cash`);
    livePositions.push({
      ...(existingCash ?? {}),
      id: cashId,
      source: "ginmon",
      name: cashFact?.name ?? existingCash?.name ?? "Geldkonto",
      category: `Cash - ${portfolioLabel}`,
      quantity: null,
      quantityText: cashFact?.quantityText ?? existingCash?.quantityText ?? "1 Konto",
      quantityEstimated: false,
      currentValue: roundCurrency(account.liquidity ?? 0),
      costValue: null,
      performanceValue: null,
      performancePct: null,
      accountNumber,
      customerId,
      portfolioLabel,
      accountValueIncluded: true,
      valuationDate: account.date ?? currentSummary.date ?? null,
      valuationMethod: "ginmon_document_cash_with_api_current_value_v1",
      sourceDocument: cashFact?.sourceDocument ?? existingCash?.sourceDocument ?? null,
      sourceDocumentFactId: cashFact?.id ?? null,
      dataSources: {
        cashIdentity: cashFact ? "sourceDocumentFacts.position_snapshot" : null,
        currentValue: "ginmon_api.summary.liquidity",
      },
    });
  }

  return livePositions;
}

async function applyCurrentSummary(firestore, currentSummary, discoveredMetaByCustomer = new Map()) {
  const now = new Date();
  const [allPositions, summaries, documentFacts] = await Promise.all([
    firestore.listDocuments("sourcePositions"),
    firestore.listDocuments("sourceSummaries"),
    firestore.listDocuments("sourceDocumentFacts"),
  ]);
  const existingPositions = allPositions.filter((position) => position.source === "ginmon");
  const previousSummary = summaries.find((summary) => summary.id === "ginmon") ?? {};
  const latestPositionFacts = latestPositionFactsByAccountAndIsin(documentFacts);
  const accountMetaByCustomer = new Map(
    (previousSummary.accounts ?? [])
      .filter((account) => account.customerId)
      .map((account) => [String(account.customerId), account]),
  );
  for (const [customerId, meta] of discoveredMetaByCustomer) {
    const existing = accountMetaByCustomer.get(customerId) ?? {};
    accountMetaByCustomer.set(customerId, { ...meta, ...existing, customerId });
  }
  for (const [customerId, meta] of knownAccountMetaByCustomerId) {
    const existing = accountMetaByCustomer.get(customerId) ?? {};
    accountMetaByCustomer.set(customerId, { ...existing, ...meta, customerId });
  }

  for (const position of existingPositions) {
    if (position.customerId && !accountMetaByCustomer.has(String(position.customerId))) {
      accountMetaByCustomer.set(String(position.customerId), {
        accountNumber: position.accountNumber,
        customerId: String(position.customerId),
        strategy: position.portfolioLabel ?? null,
      });
    }
  }

  const livePositions = buildLivePositions({
    currentSummary,
    existingPositions,
    accountMetaByCustomer,
    latestPositionFacts,
  });
  const currentIds = new Set(livePositions.map((position) => position.id));
  const liveCustomerIds = new Set((currentSummary.items ?? []).map((item) => String(item.customerId)));

  for (const existing of existingPositions) {
    const isManagedAccount = existing.customerId && liveCustomerIds.has(String(existing.customerId));
    if (isManagedAccount && !currentIds.has(existing.id)) {
      await firestore.deleteDocument("sourcePositions", existing.id);
    }
  }

  for (const position of livePositions) {
    const { id, ...data } = position;
    await firestore.setDocument("sourcePositions", id, {
      ...data,
      updatedAt: now,
    });
  }

  const accounts = (currentSummary.items ?? []).map((account) => {
    const customerId = String(account.customerId);
    const meta = accountMetaByCustomer.get(customerId) ?? { customerId };
    const depotValue = sum((account.allocation ?? []).map((allocation) => allocation.amount));
    const accountPositionCost = livePositions
      .filter((position) => position.accountNumber === (meta.accountNumber ?? `customer_${customerId}`))
      .reduce((total, position) => total + (typeof position.costValue === "number" ? position.costValue : 0), 0);
    const performanceValue =
      accountPositionCost > 0 && typeof account.balance === "number"
        ? roundCurrency(account.balance - accountPositionCost)
        : null;
    return {
      accountNumber: meta.accountNumber ?? `customer_${customerId}`,
      customerId,
      label: accountLabelFromMeta(meta),
      strategy: meta.strategy ?? null,
      valuationDate: account.date ?? currentSummary.date ?? null,
      currentValue: roundCurrency(account.balance),
      depotValue: roundCurrency(depotValue),
      cashValue: roundCurrency(account.liquidity ?? 0),
      costValue: accountPositionCost > 0 ? roundCurrency(accountPositionCost) : null,
      performanceValue,
      performancePct: accountPositionCost > 0 && performanceValue !== null ? performanceValue / accountPositionCost : null,
      positionCount: (account.allocation ?? []).length + 1,
    };
  });
  const depotValue = roundCurrency(sum(accounts.map((account) => account.depotValue)));
  const cashValue = roundCurrency(sum(accounts.map((account) => account.cashValue)));
  const currentValue = roundCurrency(currentSummary.balance ?? sum(accounts.map((account) => account.currentValue)));
  const totalCostValue = roundCurrency(sum(accounts.map((account) => account.costValue)));
  const totalPerformanceValue =
    totalCostValue > 0 && typeof currentValue === "number" ? roundCurrency(currentValue - totalCostValue) : null;

  await firestore.setDocument("sourceSummaries", "ginmon", {
    ...previousSummary,
    source: "ginmon",
    displayName: "Ginmon",
    currentValue,
    depotValue,
    cashValue,
    netValue: currentValue,
    costValue: totalCostValue > 0 ? totalCostValue : null,
    performanceValue: totalPerformanceValue,
    performancePct: totalCostValue > 0 && totalPerformanceValue !== null ? totalPerformanceValue / totalCostValue : null,
    valuationDate: currentSummary.date,
    valuationMethod: "ginmon_documents_with_api_current_values_v1",
    positionCount: livePositions.length,
    accountCount: accounts.length,
    accounts,
    status: accounts.length ? "VERIFIED" : "UNVOLLSTAENDIG",
    updatedAt: now,
  });

  await firestore.setDocument("agentStatus", "ginmon", {
    source: "ginmon",
    status: accounts.length ? "OK" : "UNVOLLSTAENDIG",
    message: `${accounts.length} Ginmon-Depot(s), ${livePositions.length} Live-Positionen`,
    lastSuccessAt: now,
    positionCount: livePositions.length,
    currentValue,
  });

  return {
    accounts,
    currentValue,
    depotValue,
    cashValue,
    positionCount: livePositions.length,
  };
}

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});
const existingSummary = (await firestore.listDocuments("sourceSummaries")).find(
  (summary) => summary.id === "ginmon",
);
const existingPositions = (await firestore.listDocuments("sourcePositions")).filter(
  (position) => position.source === "ginmon",
);
const discoveredMetaByCustomer = await discoverCustomerMetaFromFiles();
const customerIds =
  (readArg("--customer-ids")?.split(",").map((item) => item.trim()).filter(Boolean) ??
    [
      ...new Set([
        ...buildCustomerIdsFromSummary(existingSummary, existingPositions),
        ...discoveredMetaByCustomer.keys(),
      ]),
    ]);

let currentSummary;
if (process.argv.includes("--from-capture")) {
  currentSummary = await readCapturedSummary();
} else {
  if (!customerIds.length) {
    throw new Error("Keine Ginmon customerIds gefunden. Fuehre zuerst den Dokumentenabgleich aus.");
  }
  const { context, page } = await launchGinmonBrowser();
  try {
    await ensureGinmonLogin(page);
    const authorization = await captureAuthorization(page);
    currentSummary = await fetchCurrentSummary(authorization, customerIds);
  } finally {
    await context.close().catch(() => {});
  }
}

const dryRunSummary = {
  mode: writeEnabled ? "write" : "dry-run",
  date: currentSummary?.date,
  accounts: (currentSummary?.items ?? []).map((account) => ({
    customerId: String(account.customerId),
    balance: roundCurrency(account.balance),
    liquidity: roundCurrency(account.liquidity ?? 0),
    netInflow: roundCurrency(account.netInflow),
    performanceValue: roundCurrency(account.performance?.amount),
    performancePct: account.performance?.ratio ?? null,
    allocationCount: account.allocation?.length ?? 0,
  })),
  currentValue: roundCurrency(currentSummary?.balance),
  netInflow: roundCurrency(currentSummary?.netInflow),
  performanceValue: roundCurrency(currentSummary?.performance?.amount),
  performancePct: currentSummary?.performance?.ratio ?? null,
};

if (!writeEnabled) {
  console.log(JSON.stringify(dryRunSummary, null, 2));
  console.log("[dry-run] Keine Firestore-Daten geaendert. Fuer Schreiben --write verwenden.");
  process.exit(0);
}

const result = await applyCurrentSummary(firestore, currentSummary, discoveredMetaByCustomer);
console.log(JSON.stringify({ ...dryRunSummary, written: result }, null, 2));
console.log(`[ok] Ginmon Live-Abgleich geschrieben: ${result.positionCount} Positionen, ${result.currentValue.toFixed(2)} EUR`);
