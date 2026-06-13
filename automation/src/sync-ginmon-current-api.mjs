import "dotenv/config";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { ensureGinmonLogin, launchGinmonBrowser } from "./ginmon-browser.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const writeEnabled = process.argv.includes("--write");

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

function buildCustomerIdsFromSummary(summary, positions) {
  return [
    ...new Set([
      ...(summary?.accounts ?? []).map((account) => account.customerId).filter(Boolean),
      ...positions.map((position) => position.customerId).filter(Boolean),
    ]),
  ];
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

function buildLivePositions({ currentSummary, existingPositions, accountMetaByCustomer }) {
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
      const currentValue = roundCurrency(allocation.amount);
      const costValue = typeof existing?.costValue === "number" ? existing.costValue : null;
      const performanceValue = typeof costValue === "number" ? roundCurrency(currentValue - costValue) : null;
      livePositions.push({
        ...(existing ?? {}),
        id,
        source: "ginmon",
        name: existing?.name ?? `ISIN ${isin}`,
        category: existing?.category ?? `Investmentfonds - ${portfolioLabel}`,
        isin,
        wkn: existing?.wkn ?? null,
        quantityText: existing?.quantityText ?? null,
        quoteText: existing?.quoteText ?? null,
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
        valuationMethod: "ginmon_api_summary_allocation_v1",
      });
    }

    const cashId = `ginmon_${accountNumber}_cash`;
    const existingCash = existingById.get(cashId);
    livePositions.push({
      ...(existingCash ?? {}),
      id: cashId,
      source: "ginmon",
      name: existingCash?.name ?? "Geldkonto",
      category: `Cash - ${portfolioLabel}`,
      quantityText: existingCash?.quantityText ?? "1 Konto",
      currentValue: roundCurrency(account.liquidity ?? 0),
      costValue: existingCash?.costValue ?? null,
      performanceValue: null,
      performancePct: null,
      accountNumber,
      customerId,
      portfolioLabel,
      accountValueIncluded: true,
      valuationDate: account.date ?? currentSummary.date ?? null,
      valuationMethod: "ginmon_api_summary_cash_v1",
    });
  }

  return livePositions;
}

async function applyCurrentSummary(firestore, currentSummary) {
  const now = new Date();
  const [allPositions, summaries] = await Promise.all([
    firestore.listDocuments("sourcePositions"),
    firestore.listDocuments("sourceSummaries"),
  ]);
  const existingPositions = allPositions.filter((position) => position.source === "ginmon");
  const previousSummary = summaries.find((summary) => summary.id === "ginmon") ?? {};
  const accountMetaByCustomer = new Map(
    (previousSummary.accounts ?? [])
      .filter((account) => account.customerId)
      .map((account) => [String(account.customerId), account]),
  );

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
    return {
      accountNumber: meta.accountNumber ?? `customer_${customerId}`,
      customerId,
      strategy: meta.strategy ?? null,
      valuationDate: account.date ?? currentSummary.date ?? null,
      currentValue: roundCurrency(account.balance),
      depotValue: roundCurrency(depotValue),
      cashValue: roundCurrency(account.liquidity ?? 0),
      netInflow: roundCurrency(account.netInflow),
      performanceValue: roundCurrency(account.performance?.amount),
      performancePct: account.performance?.ratio ?? null,
      positionCount: (account.allocation ?? []).length + 1,
    };
  });
  const depotValue = roundCurrency(sum(accounts.map((account) => account.depotValue)));
  const cashValue = roundCurrency(sum(accounts.map((account) => account.cashValue)));
  const currentValue = roundCurrency(currentSummary.balance ?? sum(accounts.map((account) => account.currentValue)));

  await firestore.setDocument("sourceSummaries", "ginmon", {
    ...previousSummary,
    source: "ginmon",
    displayName: "Ginmon",
    currentValue,
    depotValue,
    cashValue,
    netValue: currentValue,
    costValue: roundCurrency(currentSummary.netInflow),
    performanceValue: roundCurrency(currentSummary.performance?.amount),
    performancePct: currentSummary.performance?.ratio ?? null,
    valuationDate: currentSummary.date,
    valuationMethod: "ginmon_api_summary_v1",
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
const customerIds =
  (readArg("--customer-ids")?.split(",").map((item) => item.trim()).filter(Boolean) ??
    buildCustomerIdsFromSummary(existingSummary, existingPositions));

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

const result = await applyCurrentSummary(firestore, currentSummary);
console.log(JSON.stringify({ ...dryRunSummary, written: result }, null, 2));
console.log(`[ok] Ginmon Live-Abgleich geschrieben: ${result.positionCount} Positionen, ${result.currentValue.toFixed(2)} EUR`);
