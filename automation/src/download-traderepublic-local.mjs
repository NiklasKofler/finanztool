import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { normalizeEventDocument } from "./event-model.mjs";
import { extractPdfText } from "./pdf-text.mjs";
import {
  TRADE_REPUBLIC_TRANSACTIONS_URL,
  ensureTradeRepublicLogin,
  launchTradeRepublicBrowser,
} from "./trade-republic-browser.mjs";

const TRADE_REPUBLIC_PORTFOLIO_URL = "https://app.traderepublic.com/portfolio?timeframe=1d";
const TRADE_REPUBLIC_ACTIVITY_URL = "https://app.traderepublic.com/profile/activities";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const source = "traderepublic";
const writeEnabled = process.argv.includes("--write");
const headless = process.argv.includes("--headless");
const snapshotOnly = process.argv.includes("--snapshot-only");
const fullPortalScan = process.argv.includes("--full-portal-scan");
const applyExistingPortalDocsOnly = process.argv.includes("--apply-existing-portal-docs");
const keepBrowserOpen = process.argv.includes("--keep-open") || process.env.TR_KEEP_BROWSER_OPEN === "1";
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

const portalDocumentOriginalDir = path.join(driveRoot, "01_Originale", "TradeRepublic", "PortalDocuments");
const portalSnapshotDir = path.join(
  driveRoot,
  "02_Archiviert",
  "TradeRepublic",
  "ManualExports",
  "PortalSnapshots",
);
const portalDocumentTextDir = path.join(driveRoot, "02_Archiviert", "TradeRepublic", "PortalDocuments", "Text");
const portalDocumentScanLimit = Number.parseInt(process.env.TR_PORTAL_DOCUMENT_SCAN_LIMIT ?? "16", 10);
const portalStopAfterKnownTransactions = fullPortalScan
  ? 0
  : Number.parseInt(process.env.TR_PORTAL_STOP_AFTER_KNOWN_TRANSACTIONS ?? "5", 10);
const portalDocumentOpenTimeoutMs = Number.parseInt(process.env.TR_PORTAL_DOCUMENT_OPEN_TIMEOUT_MS ?? "8000", 10);
const portalPdfFetchTimeoutMs = Number.parseInt(process.env.TR_PORTAL_PDF_FETCH_TIMEOUT_MS ?? "12000", 10);

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    "Nutzung: node src/download-traderepublic-local.mjs [--write] [--headless] [--keep-open] [--snapshot-only] [--full-portal-scan] [--apply-existing-portal-docs]",
  );
  console.log("Oeffnet Trade Republic, wartet bei Bedarf auf App-Bestaetigung, liest den Portal-Snapshot und prueft Portal-Dokumente.");
  console.log("--snapshot-only liest nur den aktuellen Portal-Snapshot und ueberspringt den langsamen Dokument-/Transaktionsdetailscan.");
  console.log("--full-portal-scan deaktiviert die Abbruchregel nach mehreren bereits bekannten Transaktionen.");
  console.log("--apply-existing-portal-docs wendet bereits geladene Portal-Dokumentfakten ohne Browser-Login operativ an.");
  process.exit(0);
}

let firestore = null;
let runStartedAt = new Date();

function timestampForFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    "-",
    pad(date.getMinutes()),
    "-",
    pad(date.getSeconds()),
  ].join("");
}

function sanitizeFileName(value) {
  return String(value ?? "download")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180) || "download";
}

function normalizeText(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
  return normalizeText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function parseGermanNumber(value) {
  const raw = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");
  if (!raw || raw === "-" || raw === ".") return null;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastDot > lastComma
        ? raw.replace(/,/g, "")
        : raw.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    normalized = raw.replace(",", ".");
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEuro(value) {
  return parseGermanNumber(String(value ?? "").replace(/€/g, ""));
}

function parsePercent(value) {
  const parsed = parseGermanNumber(String(value ?? "").replace(/%/g, ""));
  return typeof parsed === "number" ? parsed / 100 : null;
}

function roundCurrency(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}

function roundQuantity(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 1_000_000_000) / 1_000_000_000
    : value;
}

async function setEventDocument(firestoreClient, collection, id, data, now = new Date()) {
  await firestoreClient.setDocument(collection, id, normalizeEventDocument(collection, { id, ...data }, now));
}

async function getFirestore() {
  if (!writeEnabled) return null;
  if (firestore) return firestore;
  firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  return firestore;
}

function activeReviewDecisions(decisions) {
  return decisions.filter(
    (decision) =>
      decision.status !== "REVOKED" &&
      ["covered", "not_relevant", "deferred"].includes(decision.decision),
  );
}

function isGenericUnclassifiedDocumentType(documentType) {
  const normalized = String(documentType ?? "").toLowerCase();
  return (
    !normalized ||
    normalized === "unknown" ||
    normalized === "unknown_document" ||
    normalized === "unknown_portal_document" ||
    normalized === "unparsed" ||
    normalized === "unclassified"
  );
}

function reviewDecisionMatchesIssue(decision, issue) {
  if (!decision || decision.source !== issue.source) return false;
  if (decision.scope === "document_type") {
    const issueLabel = issue.portalDocumentLabel ?? issue.documentType;
    const issueType = issue.documentType ?? issue.factType;
    if (
      decision.targetLabel &&
      !isGenericUnclassifiedDocumentType(decision.targetLabel) &&
      decision.targetLabel === issueLabel
    ) {
      return true;
    }
    if (isGenericUnclassifiedDocumentType(decision.targetDocumentType)) return false;
    return Boolean(decision.targetDocumentType && decision.targetDocumentType === issueType);
  }

  return Boolean(
    decision.targetId === issue.id ||
      (decision.targetSignature &&
        decision.targetSignature === (issue.portalTransactionSignature ?? issue.fileHash ?? issue.baselineId)),
  );
}

function isIssueResolvedByDecision(issue, decisions) {
  return decisions.some((decision) => reviewDecisionMatchesIssue(decision, issue));
}

async function writeStatus(status, message, extra = {}) {
  const client = await getFirestore();
  if (!client) return;
  const now = new Date();
  await client.setDocument("agentStatus", "traderepublic_portal", {
    source,
    status,
    message,
    lastAgentRunAt: runStartedAt,
    updatedAt: now,
    ...(status === "OK" ? { lastAgentSuccessAt: now } : {}),
    ...(status === "FEHLER" ? { lastErrorAt: now } : {}),
    ...extra,
  });
}

async function ensureDirectories() {
  await Promise.all([
    fs.mkdir(portalDocumentOriginalDir, { recursive: true }),
    fs.mkdir(portalSnapshotDir, { recursive: true }),
    fs.mkdir(portalDocumentTextDir, { recursive: true }),
  ]);
}

async function readBodyText(page) {
  return page.locator("body").innerText({ timeout: 8000 }).catch(() => "");
}

async function waitForBodyText(page, predicate, { timeoutMs = 8000, pollMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    lastText = await readBodyText(page);
    if (predicate(lastText)) return lastText;
    await page.waitForTimeout(pollMs);
  }
  return lastText || (await readBodyText(page));
}

async function waitForParsedPage(page, parser, isReady, { timeoutMs = 8000, pollMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  let lastParsed = null;
  while (Date.now() < deadline) {
    lastText = await readBodyText(page);
    lastParsed = parser(lastText);
    if (isReady(lastParsed, lastText)) return { parsed: lastParsed, text: lastText, ready: true };
    await page.waitForTimeout(pollMs);
  }
  lastText = lastText || (await readBodyText(page));
  lastParsed = parser(lastText);
  return { parsed: lastParsed, text: lastText, ready: false };
}

async function waitForLocatorCount(locator, minCount = 1, { timeoutMs = 4000, pollMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;
  while (Date.now() < deadline) {
    lastCount = await locator.count().catch(() => 0);
    if (lastCount >= minCount) return lastCount;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return lastCount;
}

function isPortfolioSnapshotReady(portfolio) {
  return (
    typeof portfolio?.totalValue === "number" &&
    Array.isArray(portfolio?.positions) &&
    portfolio.positions.length > 0
  );
}

function isTransactionsSnapshotReady(transactions) {
  return typeof transactions?.cashValue === "number";
}

function parsePortfolioSnapshot(text, observedAt = new Date()) {
  const lines = String(text ?? "")
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const portfolioIndex = lines.findIndex((line) => /^Portfolio$/i.test(line));
  const investmentsIndex = lines.findIndex((line) => /^Investments$/i.test(line));
  const displayMode = /Investments\s+Since buy/i.test(lines.join("\n"))
    ? "since_buy"
    : /Investments\s+Daily trend/i.test(lines.join("\n"))
      ? "daily_trend"
      : "unknown";
  const totalValue =
    portfolioIndex >= 0
      ? parseEuro(lines.slice(portfolioIndex + 1).find((line) => /€/.test(line)) ?? "")
      : null;
  const totalLineIndex =
    portfolioIndex >= 0 ? lines.findIndex((line, index) => index > portfolioIndex && /€/.test(line)) : -1;
  const dayChangeValue =
    totalLineIndex >= 0
      ? parseEuro(lines.slice(totalLineIndex + 1).find((line) => /^[-+]?[\d.,]+\s*€$/.test(line)) ?? "")
      : null;
  const dayChangePct =
    totalLineIndex >= 0
      ? parsePercent(lines.slice(totalLineIndex + 1).find((line) => /^[-+]?[\d.,]+\s*%$/.test(line)) ?? "")
      : null;

  const positions = [];
  const stopLabels = new Set([
    "Following",
    "Favorites",
    "Discover",
    "Top movers",
    "Trending in Austria",
    "Trending topics",
  ]);
  if (investmentsIndex >= 0 && displayMode === "since_buy") {
    let index = investmentsIndex + 1;
    if (/since buy/i.test(lines[index] ?? "")) index += 1;
    while (index < lines.length) {
      const name = lines[index];
      if (!name || stopLabels.has(name)) break;
      const quantity = parseGermanNumber(lines[index + 1]);
      const currentValue = parseEuro(lines[index + 2]);
      const sinceBuyPct = parsePercent(lines[index + 3]);
      if (
        typeof quantity === "number" &&
        typeof currentValue === "number" &&
        lines[index + 2]?.includes("€")
      ) {
        positions.push({
          name,
          normalizedName: normalizeName(name),
          quantity: roundQuantity(quantity),
          currentValue: roundCurrency(currentValue),
          sinceBuyPct,
        });
        index += 4;
      } else {
        index += 1;
      }
    }
  }

  const listedValue = roundCurrency(positions.reduce((sum, position) => sum + (position.currentValue ?? 0), 0));
  const impliedPrivateMarketsValue =
    typeof totalValue === "number" && positions.length
      ? roundCurrency(Math.max(0, totalValue - listedValue))
      : null;

  return {
    observedAt,
    totalValue,
    dayChangeValue,
    dayChangePct,
    displayMode,
    listedValue,
    impliedPrivateMarketsValue,
    positions,
    rawText: normalizeText(text).slice(0, 40000),
  };
}

function parseTransactionsSnapshot(text, observedAt = new Date()) {
  const lines = String(text ?? "")
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const cashIndex = lines.findIndex((line, index) => /^Cash$/i.test(line) && /^Cash$/i.test(lines[index + 1] ?? ""));
  const cashValue = cashIndex >= 0 ? parseEuro(lines[cashIndex + 2]) : null;
  const entries = [];
  const startIndex = lines.findIndex((line) =>
    /^(This month|January|February|March|April|May|June|July|August|September|October|November|December|\d{4})$/i.test(line),
  );
  for (let index = startIndex >= 0 ? startIndex + 1 : 0; index < lines.length - 2; index += 1) {
    const title = lines[index];
    const detail = lines[index + 1];
    const amountLine = lines[index + 2];
    if (!/[+-]?€/.test(amountLine) && !/[+-]?[\d.,]+\s*€/.test(amountLine)) continue;
    if (/^(Close|Language|Deutsch|English|Español|Français|Italiano|Português|Nederlands|Suomi)$/i.test(title)) break;
    const amount = parseEuro(amountLine);
    if (typeof amount !== "number") continue;
    entries.push({
      title,
      detail,
      amount,
      amountText: amountLine,
    });
    index += 2;
  }
  return {
    observedAt,
    cashValue,
    entries,
    rawText: normalizeText(text).slice(0, 40000),
  };
}

function isCashPosition(position) {
  return /cash/i.test(String(position.category ?? "")) || /cashkonto/i.test(String(position.name ?? ""));
}

function isPrivateMarketPosition(position) {
  return /private/i.test(String(position.accountType ?? position.category ?? position.name ?? ""));
}

function positionIdForIsin(isin) {
  return `traderepublic_${String(isin).toUpperCase()}`;
}

function getAverageCost(position) {
  return typeof position?.quantity === "number" && position.quantity > 0 && typeof position?.costValue === "number"
    ? position.costValue / position.quantity
    : 0;
}

function portalApplicationId(fact) {
  return `traderepublic_portal_application_${sanitizeId(fact.documentId ?? fact.fileHash ?? fact.id)}`;
}

function portalOperationalId(prefix, fact) {
  return `traderepublic_portal_${prefix}_${sanitizeId(fact.documentId ?? fact.fileHash ?? fact.id)}`;
}

function portalTradeNaturalKey(fact) {
  return sanitizeId(
    [
      "trade",
      fact.documentDate ?? fact.transactionPortalDate ?? "",
      fact.isin ?? "",
      typeof fact.quantity === "number" ? fact.quantity.toFixed(9) : "",
      typeof fact.amount === "number" ? Math.abs(fact.amount).toFixed(2) : "",
    ].join("|"),
  );
}

function portalCashNaturalKey(fact) {
  return sanitizeId(
    [
      "cash",
      fact.valueDate ?? fact.documentDate ?? fact.transactionPortalDate ?? "",
      typeof fact.bookingAmount === "number"
        ? fact.bookingAmount.toFixed(2)
        : typeof fact.amount === "number"
          ? fact.amount.toFixed(2)
          : "",
      fact.bookingAccount ?? "",
    ].join("|"),
  );
}

function portalTaxReportNaturalKey(fact) {
  return sanitizeId(
    [
      "tax_report",
      fact.taxYear ?? "",
      fact.referenceNumber ?? "",
      fact.depotNumber ?? "",
      fact.accountNumber ?? "",
    ].join("|"),
  );
}

function matchesManualTradeFact(manualFact, portalFact) {
  if (manualFact.source !== source || !String(manualFact.id ?? "").startsWith("traderepublic_tx_")) return false;
  const portalDate = portalFact.transactionPortalDate ?? portalFact.documentDate;
  const manualDate = manualFact.bookingDate ?? String(manualFact.date ?? "").slice(0, 10);
  const amountDiff = Math.abs(Math.abs(manualFact.amount ?? 0) - Math.abs(portalFact.amount ?? 0));

  if (
    manualFact.factType === "private_market_cash" &&
    /private/i.test(`${manualFact.name ?? ""} ${portalFact.name ?? ""} ${portalFact.transactionTitle ?? ""}`) &&
    manualDate === portalDate &&
    amountDiff < 0.01
  ) {
    return true;
  }

  if (manualFact.factType !== "trade") return false;
  if (String(manualFact.isin ?? "").toUpperCase() !== String(portalFact.isin ?? "").toUpperCase()) return false;
  if (manualDate !== portalDate) return false;
  const quantityDiff = Math.abs((manualFact.quantity ?? 0) - (portalFact.quantity ?? 0));
  return quantityDiff < 0.00000001 && amountDiff < 0.01;
}

function matchesManualCashFact(manualFact, portalFact) {
  if (manualFact.source !== source || !String(manualFact.id ?? "").startsWith("traderepublic_tx_")) return false;
  if (!["cash", "cash_deposit"].includes(manualFact.factType)) return false;
  const manualDate = manualFact.bookingDate ?? String(manualFact.date ?? "").slice(0, 10);
  const portalDate = portalFact.valueDate ?? portalFact.documentDate ?? portalFact.transactionPortalDate;
  if (manualDate !== portalDate) return false;
  const portalAmount =
    typeof portalFact.bookingAmount === "number"
      ? portalFact.bookingAmount
      : typeof portalFact.amount === "number"
        ? portalFact.amount
        : null;
  if (typeof portalAmount !== "number" || typeof manualFact.amount !== "number") return false;
  return Math.abs(manualFact.amount - portalAmount) < 0.01;
}

function matchesManualIncomeFact(manualFact, portalFact) {
  if (manualFact.source !== source || !String(manualFact.id ?? "").startsWith("traderepublic_tx_")) return false;
  if (!["interest", "dividend", "bonus"].includes(manualFact.factType)) return false;
  const manualDate = manualFact.bookingDate ?? String(manualFact.date ?? "").slice(0, 10);
  const portalDate = portalFact.valueDate ?? portalFact.documentDate ?? portalFact.transactionPortalDate;
  if (manualDate !== portalDate) return false;
  const portalAmount =
    typeof portalFact.amount === "number"
      ? portalFact.amount
      : typeof portalFact.grossAmount === "number"
        ? portalFact.grossAmount
        : null;
  if (typeof portalAmount !== "number" || typeof manualFact.amount !== "number") return false;
  return Math.abs(Math.abs(manualFact.amount) - Math.abs(portalAmount)) < 0.02;
}

function matchesManualTaxReportFact(manualFact, portalFact) {
  if (manualFact.source !== source) return false;
  if (manualFact.factType !== "tax_report") return false;
  if (!portalFact.taxYear || String(manualFact.taxYear ?? "") !== String(portalFact.taxYear)) return false;
  if (manualFact.referenceNumber && portalFact.referenceNumber) {
    return String(manualFact.referenceNumber) === String(portalFact.referenceNumber);
  }
  return true;
}

function hasManualDuplicateForPortalFact(manualFacts, portalFact) {
  if (portalFact.factType === "security_execution") {
    return manualFacts.some((manualFact) => matchesManualTradeFact(manualFact, portalFact));
  }
  if (["cash_deposit", "cash_transfer"].includes(portalFact.factType)) {
    return manualFacts.some((manualFact) => matchesManualCashFact(manualFact, portalFact));
  }
  if (portalFact.factType === "interest") {
    return manualFacts.some((manualFact) => matchesManualIncomeFact(manualFact, portalFact));
  }
  if (portalFact.factType === "tax_report") {
    return manualFacts.some((manualFact) => matchesManualTaxReportFact(manualFact, portalFact));
  }
  return false;
}

async function ensurePortfolioSinceBuyMode(page) {
  const initialText = await readBodyText(page);
  if (/Investments\s+Since buy/i.test(initialText)) return;
  if (!/Investments\s+Daily trend/i.test(initialText)) return;

  const trigger = page.getByText(/Daily trend|Tagestrend/i).first();
  if (!(await trigger.isVisible({ timeout: 1500 }).catch(() => false))) return;
  await trigger.click({ timeout: 3000, force: true }).catch(() => null);
  const option = page.getByText(/Since buy|Seit Kauf|Seit dem Kauf/i).first();
  if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
    await option.click({ timeout: 3000, force: true });
    await waitForBodyText(page, (text) => /Investments\s+Since buy/i.test(text), { timeoutMs: 2500 });
  }
}

async function collectPortalSnapshot(page) {
  await page.goto(TRADE_REPUBLIC_PORTFOLIO_URL, { waitUntil: "domcontentloaded" });
  await waitForBodyText(page, (text) => /Portfolio|Investments/i.test(text), { timeoutMs: 8000 });
  await ensurePortfolioSinceBuyMode(page);
  const { parsed: portfolio } = await waitForParsedPage(
    page,
    (text) => parsePortfolioSnapshot(text),
    isPortfolioSnapshotReady,
    { timeoutMs: 8000 },
  );

  await page.goto(TRADE_REPUBLIC_TRANSACTIONS_URL, { waitUntil: "domcontentloaded" });
  const { parsed: transactions } = await waitForParsedPage(
    page,
    (text) => parseTransactionsSnapshot(text),
    isTransactionsSnapshotReady,
    { timeoutMs: 8000 },
  );

  await page.goto(TRADE_REPUBLIC_ACTIVITY_URL, { waitUntil: "domcontentloaded" });
  const activityText = await waitForBodyText(
    page,
    (text) => normalizeText(text).length > 300 || /Annual Tax Report|Activity|Profile|Documents?|Reports?/i.test(text),
    { timeoutMs: 5000 },
  );
  const activityRawText = normalizeText(activityText).slice(0, 40000);

  return {
    observedAt: new Date(),
    portfolio,
    transactions,
    activityRawText,
  };
}

function assertUsablePortalSnapshot(snapshot) {
  const issues = [];
  if (typeof snapshot?.portfolio?.totalValue !== "number") issues.push("Portfolio-Gesamtwert fehlt");
  if (!Array.isArray(snapshot?.portfolio?.positions) || snapshot.portfolio.positions.length === 0) {
    issues.push("keine sichtbaren Portfolio-Positionen erkannt");
  } else {
    const listedValue = snapshot.portfolio.positions.reduce(
      (sum, position) => sum + (typeof position.currentValue === "number" ? position.currentValue : 0),
      0,
    );
    const zeroValuedQuantityPositions = snapshot.portfolio.positions.filter(
      (position) =>
        typeof position.quantity === "number" &&
        position.quantity > 0 &&
        (!Number.isFinite(position.currentValue) || position.currentValue <= 0),
    );
    if (listedValue <= 0) issues.push("gelistete Portal-Positionen haben keinen positiven Wert");
    if (zeroValuedQuantityPositions.length >= 2) {
      issues.push(`${zeroValuedQuantityPositions.length} Portal-Positionen mit Stueckzahl, aber Wert 0`);
    }
  }
  if (typeof snapshot?.transactions?.cashValue !== "number") issues.push("Cashwert fehlt");
  if (issues.length) {
    throw new Error(`Trade-Republic-Portal-Snapshot unvollstaendig: ${issues.join(", ")}.`);
  }
}

async function savePortalSnapshot(snapshot) {
  const target = path.join(portalSnapshotDir, `${timestampForFilename(snapshot.observedAt)}_portal_snapshot.json`);
  await fs.writeFile(target, JSON.stringify(snapshot, null, 2));
  return target;
}

async function scrollLoadedTransactions(page) {
  let stableRounds = 0;
  let previousHeight = 0;
  let previousTextLength = 0;
  for (let attempt = 0; attempt < 45 && stableRounds < 5; attempt += 1) {
    const metrics = await page.evaluate(() => ({
      height: document.scrollingElement?.scrollHeight ?? document.body.scrollHeight,
      textLength: document.body.innerText.length,
    }));
    if (metrics.height === previousHeight && metrics.textLength === previousTextLength) stableRounds += 1;
    else stableRounds = 0;
    previousHeight = metrics.height;
    previousTextLength = metrics.textLength;
    await page.mouse.wheel(0, 2400).catch(() => {});
    await page.waitForFunction(
      ({ height, textLength }) => {
        const currentHeight = document.scrollingElement?.scrollHeight ?? document.body.scrollHeight;
        const currentTextLength = document.body.innerText.length;
        return currentHeight !== height || currentTextLength !== textLength;
      },
      { height: previousHeight, textLength: previousTextLength },
      { timeout: 900 },
    ).catch(() => null);
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
}

function transactionButtonLocator(page) {
  return page.locator('li > div[role="button"], li [role="button"]').filter({
    hasText: /\b(\d{1,2}\/\d{1,2}|Saving executed|Savings plan|Cash In|Interest|Completed|Dividend|Private Equity)\b/i,
    hasNotText: /Documents?|Billing Execution|Inbound Invoice|Statement|Transaction confirmation|Dividend equivalent/i,
  });
}

async function waitForRecentTransactions(page) {
  const minimumCount = Math.min(Math.max(portalStopAfterKnownTransactions, 5), portalDocumentScanLimit);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const count = await transactionButtonLocator(page).count().catch(() => 0);
    if (count >= minimumCount) break;
    await page.mouse.wheel(0, 900).catch(() => {});
    await waitForLocatorCount(transactionButtonLocator(page), Math.min(count + 1, minimumCount), { timeoutMs: 900 });
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await waitForBodyText(page, (text) => /This month|January|February|March|April|May|June|July|August|September|October|November|December|\d{4}/i.test(text), {
    timeoutMs: 2500,
  });
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function sanitizeId(value) {
  return sanitizeFileName(value).slice(0, 180) || "document";
}

function escapeRegex(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitTextLines(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseAustrianDate(value) {
  const raw = String(value ?? "").trim();
  const isoMatch = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const austrianMatch = raw.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  if (!austrianMatch) return null;
  return `${austrianMatch[3]}-${austrianMatch[2].padStart(2, "0")}-${austrianMatch[1].padStart(2, "0")}`;
}

function parsePortalShortDate(value, referenceDate = new Date()) {
  const match = String(value ?? "").match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (!match) return null;
  return `${referenceDate.getFullYear()}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function firstMatch(text, regex, group = 1) {
  const match = String(text ?? "").match(regex);
  return match?.[group] ? normalizeText(match[group]) : null;
}

function documentTypeFromLabel(label) {
  const normalized = normalizeName(label);
  if (/billing execution|ausfuehrung|ausführung/.test(normalized)) return "billing_execution";
  if (/inbound invoice|einzahlung/.test(normalized)) return "inbound_invoice";
  if (/tax report|steuer/.test(normalized)) return "tax_report";
  if (/statement|zins|interest/.test(normalized)) return "interest_statement";
  if (/transaction confirmation|transfer|ueberweisung|überweisung/.test(normalized)) return "transaction_confirmation";
  if (/dividend equivalent|dividend/.test(normalized)) return "dividend_equivalent";
  return "unknown_portal_document";
}

function isPortalDataChannel(row) {
  return row.source === source && ["traderepublic_portal_web", "traderepublic_portal_dom"].includes(row.sourceChannel);
}

function parseKnownDocumentLabels(text) {
  const knownLabels = [
    "Billing Execution",
    "Inbound Invoice",
    "Tax Report 2025",
    "Statement",
    "Transaction confirmation",
    "Dividend equivalent",
  ];
  const found = [];
  const normalizedText = normalizeText(text);
  for (const label of knownLabels) {
    if (new RegExp(`\\b${escapeRegex(label)}\\b`, "i").test(normalizedText)) found.push(label);
  }
  return [...new Set(found)];
}

function parseTransactionCardText(text) {
  const lines = splitTextLines(text);
  const amountLine = lines.find((line) => /^[-+]?€\s*[\d.,]+$/.test(line) || /^[-+]?[\d.,]+\s*€$/.test(line));
  const dateLine = lines.find((line) => /\b\d{1,2}\/\d{1,2}\b/.test(line));
  const title = lines.find((line) => !/\b\d{1,2}\/\d{1,2}\b/.test(line) && !/€/.test(line)) ?? null;
  return {
    title,
    portalDate: parsePortalShortDate(dateLine),
    portalDateText: dateLine ?? null,
    amount: amountLine ? parseEuro(amountLine) : null,
    amountText: amountLine ?? null,
    listText: normalizeText(text).slice(0, 3000),
  };
}

function portalDocumentSignature(label, transactionDetail = {}) {
  return sanitizeId(
    [
      "traderepublic",
      "portal",
      label,
      transactionDetail.portalDate ?? transactionDetail.documentDate ?? "",
      transactionDetail.title ?? "",
      typeof transactionDetail.amount === "number" ? Math.abs(transactionDetail.amount).toFixed(2) : transactionDetail.amountText ?? "",
    ].join("|"),
  );
}

async function getKnownPortalDocumentSignatures(firestoreClient) {
  if (!firestoreClient) return new Set();
  const [documents, facts] = await Promise.all([
    firestoreClient.listDocuments("sourceDocuments"),
    firestoreClient.listDocuments("sourceDocumentFacts"),
  ]);
  const signatures = new Set();
  for (const row of [...documents, ...facts]) {
    if (!isPortalDataChannel(row)) continue;
    if (row.factType === "portal_document_failure") continue;
    if (row.portalTransactionSignature) signatures.add(row.portalTransactionSignature);
    const label = row.portalDocumentLabel;
    const title = row.transactionTitle ?? row.name;
    const portalDate = row.transactionPortalDate ?? row.documentDate;
    const amount = row.amount ?? row.bookingAmount;
    if (label && title && portalDate && typeof amount === "number") {
      signatures.add(portalDocumentSignature(label, { title, portalDate, amount }));
    }
  }
  return signatures;
}

async function collectVisibleDocumentLabels(page) {
  const knownLabels = [
    "Billing Execution",
    "Inbound Invoice",
    "Tax Report 2025",
    "Statement",
    "Transaction confirmation",
    "Dividend equivalent",
  ];
  const labels = [];
  const root = await detailRoot(page);
  if (!root) return labels;
  for (const label of knownLabels) {
    const locator = root.locator('.detailDocuments button, .detailDocuments [role="button"], .detailDocuments a').filter({
      hasText: new RegExp(escapeRegex(label), "i"),
    });
    if ((await locator.count().catch(() => 0)) > 0) labels.push(label);
  }
  return [...new Set(labels)];
}

function parseTransactionDetail(text) {
  const lines = splitTextLines(text);
  const documentStartIndex = lines.findIndex((line) => /^Documents?$/i.test(line));
  const relevantLines = (documentStartIndex >= 0 ? lines.slice(0, documentStartIndex) : lines).filter(
    (line) => !/^(Close|Skip to content|Search|Wealth|Orders|Profile|Transactions|Activity|Cash|Deposit|Withdraw|N)$/i.test(line),
  );
  const amountLine = relevantLines.find((line) => /^[-+]?€\s*[\d.,]+$/.test(line) || /^[-+]?[\d.,]+\s*€$/.test(line));
  const dateLine = relevantLines.find((line) => /\b\d{1,2}\/\d{1,2}\b/.test(line));
  const statusLine = relevantLines.find((line) => /^(Executed|Created|Completed|Cancelled|Failed|Pending)$/i.test(line));
  return {
    title: relevantLines[0] ?? null,
    status: statusLine ?? null,
    portalDate: parsePortalShortDate(dateLine),
    portalDateText: dateLine ?? null,
    amount: amountLine ? parseEuro(amountLine) : null,
    amountText: amountLine ?? null,
    rawText: normalizeText(text).slice(0, 12000),
    documentLabels: parseKnownDocumentLabels(text),
  };
}

function textAfterLabel(lines, label) {
  const index = lines.findIndex((line) => new RegExp(`^${escapeRegex(label)}$`, "i").test(line));
  return index >= 0 ? lines[index + 1] ?? null : null;
}

function parsePortalDomFallback(label, transactionDetail = {}) {
  const documentType = documentTypeFromLabel(label);
  const rawText = transactionDetail.rawText ?? "";
  const normalized = normalizeText(rawText);
  const lines = splitTextLines(rawText);
  const documentDate = transactionDetail.portalDate ?? null;
  const amount = transactionDetail.amount ?? parseEuro(transactionDetail.amountText) ?? null;

  if (/Interest|Zins|You received|Accrued/i.test(normalized)) {
    const accrued =
      parseEuro(textAfterLabel(lines, "Accrued")) ??
      parseEuro(firstMatch(normalized, /Accrued\s+(-?€?\s*[\d.,]+|[-\d.,]+\s*€)/i)) ??
      null;
    const tax =
      parseEuro(textAfterLabel(lines, "Taxes")) ??
      parseEuro(firstMatch(normalized, /Taxes\s+(-?€?\s*[\d.,]+|[-\d.,]+\s*€)/i)) ??
      null;
    const total =
      parseEuro(textAfterLabel(lines, "Total")) ??
      parseEuro(firstMatch(normalized, /Total\s+(-?€?\s*[\d.,]+|[-\d.,]+\s*€)/i)) ??
      amount;
    return {
      source,
      sourceLabel: "Trade Republic",
      sourceChannel: "traderepublic_portal_dom",
      documentType: "interest_statement",
      factType: "interest",
      portalDocumentLabel: label,
      parseStatus: typeof total === "number" || typeof accrued === "number" ? "PARSED" : "PARTIAL",
      documentDate,
      valueDate: documentDate,
      amount: roundCurrency(total),
      grossAmount: roundCurrency(accrued),
      tax: roundCurrency(tax),
      currency: "EUR",
      transactionTitle: transactionDetail.title ?? "Interest",
      transactionStatus: transactionDetail.status ?? null,
      transactionPortalDate: documentDate,
      rawTransactionText: rawText,
    };
  }

  if (documentType === "transaction_confirmation" || /Transaction confirmation|Recipient|Sender|IBAN|Reference/i.test(normalized)) {
    const total =
      parseEuro(textAfterLabel(lines, "Total")) ??
      parseEuro(firstMatch(normalized, /Total\s+(-?€?\s*[\d.,]+|[-\d.,]+\s*€)/i)) ??
      amount;
    const direction = typeof total === "number" && total < 0 ? "cash_withdrawal" : "cash_deposit";
    return {
      source,
      sourceLabel: "Trade Republic",
      sourceChannel: "traderepublic_portal_dom",
      documentType: "transaction_confirmation",
      factType: "cash_transfer",
      portalDocumentLabel: label,
      parseStatus: typeof total === "number" && documentDate ? "PARSED" : "PARTIAL",
      documentDate,
      valueDate: documentDate,
      amount: roundCurrency(total),
      bookingAmount: roundCurrency(total),
      direction,
      currency: "EUR",
      counterpartyName: textAfterLabel(lines, "Recipient") ?? textAfterLabel(lines, "Sender"),
      counterpartyIban:
        firstMatch(normalized, /\b([A-Z]{2}\d{2}[A-Z0-9]{8,})\b/i) ??
        null,
      paymentReference: textAfterLabel(lines, "Reference") ?? null,
      transactionTitle: transactionDetail.title ?? "Transaction confirmation",
      transactionStatus: transactionDetail.status ?? null,
      transactionPortalDate: documentDate,
      rawTransactionText: rawText,
    };
  }

  return null;
}

async function readDetailText(page) {
  const root = await detailRoot(page);
  if (root) return root.innerText({ timeout: 5000 }).catch(() => "");

  const dialog = page.locator('[role="dialog"], [aria-modal="true"]').last();
  if (await dialog.isVisible({ timeout: 1200 }).catch(() => false)) {
    return dialog.innerText({ timeout: 5000 }).catch(() => "");
  }
  return readBodyText(page);
}

async function detailRoot(page) {
  const roots = [
    page.locator(".sideModal").filter({ hasText: /Overview|Documents?/i }).last(),
    page.locator(".timelineDetail").filter({ hasText: /Overview|Documents?/i }).last(),
    page.locator('[role="dialog"], [aria-modal="true"]').last(),
  ];
  for (const root of roots) {
    if (await root.isVisible({ timeout: 500 }).catch(() => false)) return root;
  }
  return null;
}

async function closeDetailView(page) {
  const root = await detailRoot(page);
  if (root) {
    const closeText = root.getByText(/^Close$/i).first();
    if (await closeText.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeText.click({ timeout: 1500, force: true }).catch(() => null);
      await waitForDetailClosed(page);
      return;
    }
  }
  const okButton = page.getByRole("button", { name: /ok|close|schließen|schliessen|done/i }).first();
  if (await okButton.isVisible({ timeout: 600 }).catch(() => false)) {
    await okButton.click({ timeout: 1500, force: true }).catch(() => null);
    await waitForDetailClosed(page);
    return;
  }
  await page.keyboard.press("Escape").catch(() => {});
  await waitForDetailClosed(page);
}

async function waitForDetailView(page, { timeoutMs = 4500, pollMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastRoot = null;
  while (Date.now() < deadline) {
    const root = await detailRoot(page);
    if (root) {
      const text = await root.innerText({ timeout: 1000 }).catch(() => "");
      if (normalizeText(text).length > 20) return root;
      lastRoot = root;
    }
    await page.waitForTimeout(pollMs);
  }
  return lastRoot;
}

async function waitForDetailClosed(page, { timeoutMs = 1500, pollMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await detailRoot(page))) return true;
    await page.waitForTimeout(pollMs);
  }
  return false;
}

function parseBillingExecutionText(text, fallbackLabel, transactionDetail = {}) {
  const normalized = normalizeText(text);
  const positionMatch = normalized.match(
    /POSITION\s+ANZAHL\s+DURCHSCHNITTSKURS\s+BETRAG\s+(.+?)\s+([\d.,]+)\s+Stk\.\s+([\d.,]+)\s+EUR\s+(-?[\d.,]+)\s+EUR\s+ISIN:\s*([A-Z]{2}[A-Z0-9]{10})/i,
  );
  const bookingMatch = normalized.match(
    /(AT\d{2}[A-Z0-9]{11,})\s+(20\d{2}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.20\d{2})\s+(-?[\d.,]+)\s+EUR/i,
  );
  const amount = positionMatch ? parseGermanNumber(positionMatch[4]) : transactionDetail.amount ?? null;
  const quantity = positionMatch ? parseGermanNumber(positionMatch[2]) : null;
  const averagePrice = positionMatch ? parseGermanNumber(positionMatch[3]) : null;
  return {
    documentType: "billing_execution",
    factType: "security_execution",
    label: fallbackLabel,
    parseStatus: positionMatch ? "PARSED" : "PARTIAL",
    documentDate: parseAustrianDate(firstMatch(normalized, /\bDATUM\s+(\d{1,2}\.\d{1,2}\.20\d{2})/i)),
    executionId: firstMatch(normalized, /\bAUSF[ÜU]HRUNG\s+([A-Za-z0-9-]+)/i),
    savingsPlanId: firstMatch(normalized, /\bSPARPLAN\s+([A-Za-z0-9-]+)/i),
    depotNumber: firstMatch(normalized, /\bDEPOT\s+(\d+)/i),
    exchange: firstMatch(normalized, /Sparplanausf[üu]hrung am .*? an der (.+?)\./i),
    counterparty: firstMatch(normalized, /Kontrahent der Transaktion ist (.+?)\./i),
    name: positionMatch ? normalizeText(positionMatch[1]) : transactionDetail.title ?? null,
    isin: positionMatch?.[5] ?? null,
    quantity: roundQuantity(quantity),
    averagePrice: roundCurrency(averagePrice),
    amount: roundCurrency(amount),
    currency: "EUR",
    bookingAccount: bookingMatch?.[1] ?? null,
    valueDate: parseAustrianDate(bookingMatch?.[2]),
    bookingAmount: bookingMatch ? roundCurrency(parseGermanNumber(bookingMatch[3])) : null,
    transactionTitle: transactionDetail.title ?? null,
    transactionStatus: transactionDetail.status ?? null,
  };
}

function parseInboundInvoiceText(text, fallbackLabel, transactionDetail = {}) {
  const normalized = normalizeText(text);
  const bookingMatch = normalized.match(
    /(AT\d{2}[A-Z0-9]{11,})\s+(\d{1,2}\.\d{1,2}\.20\d{2}|20\d{2}-\d{2}-\d{2})\s+€?\s*(-?[\d.,]+)/i,
  );
  const total =
    parseGermanNumber(firstMatch(normalized, /Gesamtbetrag\s+€\s*([\d.,]+)/i)) ??
    parseGermanNumber(firstMatch(normalized, /GESAMT\s+€\s*([\d.,]+)/i)) ??
    transactionDetail.amount ??
    null;
  const fee = parseGermanNumber(firstMatch(normalized, /Geb[üu]hr f[üu]r Einzahlung via Lastschrift\s+€\s*([\d.,]+)/i));
  return {
    documentType: "inbound_invoice",
    factType: "cash_deposit",
    label: fallbackLabel,
    parseStatus: typeof total === "number" ? "PARSED" : "PARTIAL",
    documentDate: parseAustrianDate(firstMatch(normalized, /\bDATUM\s+(\d{1,2}\.\d{1,2}\.20\d{2})/i)),
    depotNumber: firstMatch(normalized, /\bDEPOT\s+(\d+)/i),
    amount: roundCurrency(total),
    fee: roundCurrency(fee ?? 0),
    currency: "EUR",
    bookingAccount: bookingMatch?.[1] ?? null,
    valueDate: parseAustrianDate(bookingMatch?.[2]),
    bookingAmount: bookingMatch ? roundCurrency(parseGermanNumber(bookingMatch[3])) : roundCurrency(total),
    transactionTitle: transactionDetail.title ?? null,
    transactionStatus: transactionDetail.status ?? null,
  };
}

function parseTaxReportText(text, fallbackLabel, transactionDetail = {}) {
  const normalized = normalizeText(text);
  const additionalMatch = normalized.match(
    /Weitere Angaben\s+([-\d.,]+)\s+Noch nicht .*?Eink[üu]nfte.*?([-\d.,]+)\s+-\s+darauf entfallende Kapitalertragsteuer/i,
  );
  const taxYear =
    normalized.match(/Steuerbescheinigung\s+f[üu]r\s+das\s+Jahr\s+(20\d{2})/i)?.[1] ??
    normalized.match(/Tax Report\s+(20\d{2})/i)?.[1] ??
    firstMatch(transactionDetail.title, /(20\d{2})/i) ??
    firstMatch(fallbackLabel, /(20\d{2})/i);
  return {
    documentType: "tax_report",
    factType: "tax_report",
    label: fallbackLabel,
    parseStatus: taxYear ? "PARSED" : "PARTIAL",
    documentDate: transactionDetail.portalDate ?? null,
    taxYear,
    depotNumber: firstMatch(normalized, /Depot-Nr\.:\s*([A-Z0-9-]+)/i),
    accountNumber: firstMatch(normalized, /Konto-Nr\.:\s*([A-Z0-9-]+)/i),
    referenceNumber: firstMatch(normalized, /Vorgangs-Nr\.:\s*([A-Z0-9-]+)/i),
    excessIncomeNotOffset: parseGermanNumber(additionalMatch?.[1]),
    capitalGainsTaxOnExcessIncome: parseGermanNumber(additionalMatch?.[2]),
    amount: null,
    currency: "EUR",
    transactionTitle: transactionDetail.title ?? null,
    transactionStatus: transactionDetail.status ?? null,
  };
}

function parseGenericPortalDocumentText(text, fallbackLabel, transactionDetail = {}) {
  const normalized = normalizeText(text);
  const documentType = documentTypeFromLabel(fallbackLabel);
  const date = parseAustrianDate(firstMatch(normalized, /\bDATUM\s+(\d{1,2}\.\d{1,2}\.20\d{2})/i)) ?? transactionDetail.portalDate ?? null;
  const amount =
    parseGermanNumber(firstMatch(normalized, /(?:TOTAL|GESAMT|GESAMTBETRAG)\s+€?\s*(-?[\d.,]+)/i)) ??
    transactionDetail.amount ??
    null;
  return {
    documentType,
    factType: documentType,
    label: fallbackLabel,
    parseStatus: documentType === "unknown_portal_document" ? "UNKNOWN" : "PARTIAL",
    documentDate: date,
    amount: roundCurrency(amount),
    currency: typeof amount === "number" ? "EUR" : null,
    transactionTitle: transactionDetail.title ?? null,
    transactionStatus: transactionDetail.status ?? null,
  };
}

function classifyPortalDocumentText(text, fallbackLabel, transactionDetail = {}) {
  const normalized = normalizeText(text);
  if (/WERTPAPIERABRECHNUNG|SPARPLAN|DURCHSCHNITTSKURS|ISIN:/i.test(normalized)) {
    return parseBillingExecutionText(text, fallbackLabel, transactionDetail);
  }
  if (/ABRECHNUNG EINZAHLUNG|Einzahlung via Lastschrift|Gesamtbetrag/i.test(normalized)) {
    return parseInboundInvoiceText(text, fallbackLabel, transactionDetail);
  }
  if (/Steuerbescheinigung|Tax Report|Jahressteuer|Kapitalertragsteuer/i.test(normalized) || documentTypeFromLabel(fallbackLabel) === "tax_report") {
    return parseTaxReportText(text, fallbackLabel, transactionDetail);
  }
  return parseGenericPortalDocumentText(text, fallbackLabel, transactionDetail);
}

async function clickDocumentAndReadBytes(context, page, label) {
  const labelPattern = new RegExp(escapeRegex(label), "i");
  const root = await detailRoot(page);
  if (!root) throw new Error(`Portal-Detailansicht fuer Dokument "${label}" nicht gefunden.`);

  const locators = [
    root.locator('.detailDocuments button, .detailDocuments [role="button"], .detailDocuments a').filter({
      hasText: labelPattern,
    }),
    root.locator('button, [role="button"], a').filter({ hasText: labelPattern }),
  ];

  let target = null;
  for (const locator of locators) {
    const count = Math.min(await locator.count().catch(() => 0), 6);
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      await item.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => null);
      if (!(await item.isVisible({ timeout: 800 }).catch(() => false))) continue;
      target = item;
      break;
    }
    if (target) break;
  }

  if (!target) throw new Error(`Portal-Dokumentbutton nicht gefunden: ${label}`);

  const downloadPromise = page.waitForEvent("download", { timeout: portalDocumentOpenTimeoutMs }).catch(() => null);
  const popupPromise = page.waitForEvent("popup", { timeout: portalDocumentOpenTimeoutMs }).catch(() => null);
  await target.click({ timeout: 4000, force: true }).catch(() => null);

  const event = await Promise.race([
    downloadPromise.then((download) => (download ? { type: "download", download } : null)),
    popupPromise.then((popup) => (popup ? { type: "popup", popup } : null)),
    page.waitForTimeout(portalDocumentOpenTimeoutMs).then(() => null),
  ]);

  if (event?.type === "download") {
    const tempPath = await event.download.path();
    return Buffer.from(await fs.readFile(tempPath));
  }

  if (event?.type === "popup") {
    const popup = event.popup;
    await popup.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => null);
    const popupUrl = popup.url();
    if (/^https?:\/\//i.test(popupUrl)) {
      const response = await context.request.get(popupUrl, { timeout: portalPdfFetchTimeoutMs }).catch(() => null);
      if (response?.ok()) {
        const body = Buffer.from(await response.body());
        await popup.close().catch(() => null);
        if (body.slice(0, 4).toString("utf8") === "%PDF") return body;
        if (body.length > 1000) return body;
      }
    }
    await popup.close().catch(() => null);
  }

  const body = await readBodyText(page);
  if (/Something went wrong|Etwas ist schief/i.test(body)) {
    await closeDetailView(page);
    throw new Error(`Portal-Dokument "${label}" konnte nicht geoeffnet werden: Something went wrong`);
  }
  throw new Error(`Portal-Dokument "${label}" hat kein PDF geliefert.`);
}

async function savePortalDocumentPdf(buffer, label, transactionDetail = {}) {
  const fileHash = sha256(buffer);
  const incomingDir = path.join(portalDocumentOriginalDir, "_incoming");
  await fs.mkdir(incomingDir, { recursive: true });
  const incomingPath = path.join(incomingDir, `${fileHash}.pdf`);
  await fs.writeFile(incomingPath, buffer);

  const rawText = await extractPdfText(incomingPath).catch((error) => {
    console.warn(`[warn] PDF-Text konnte nicht extrahiert werden (${label}): ${error.message}`);
    return "";
  });
  const parsed = classifyPortalDocumentText(rawText, label, transactionDetail);
  const documentType = parsed.documentType ?? documentTypeFromLabel(label);
  const datePrefix = parsed.documentDate ?? transactionDetail.portalDate ?? timestampForFilename().slice(0, 8);
  const safeLabel = sanitizeFileName(label);
  const baseName = `${datePrefix}_${fileHash.slice(0, 16)}_${safeLabel}`;
  const originalDir = path.join(portalDocumentOriginalDir, documentType);
  const textDir = path.join(portalDocumentTextDir, documentType);
  await Promise.all([
    fs.mkdir(originalDir, { recursive: true }),
    fs.mkdir(textDir, { recursive: true }),
  ]);

  const filePath = path.join(originalDir, `${baseName}.pdf`);
  const textPath = path.join(textDir, `${baseName}.txt`);
  await fs.copyFile(incomingPath, filePath).catch(async (error) => {
    if (error.code !== "EEXIST") throw error;
  });
  await fs.writeFile(textPath, rawText);
  await fs.rm(incomingPath, { force: true });

  return {
    source,
    documentId: `traderepublic_portal_document_${fileHash.slice(0, 32)}`,
    factId: `traderepublic_portal_fact_${fileHash.slice(0, 32)}`,
    documentType,
    label,
    parseStatus: parsed.parseStatus ?? "PARTIAL",
    fileType: "pdf",
    fileName: path.basename(filePath),
    filePath,
    textPath,
    fileHash,
    rawText: normalizeText(rawText).slice(0, 40000),
    parsed,
    transactionDetail,
    portalTransactionSignature: portalDocumentSignature(label, transactionDetail),
  };
}

async function writePortalDocumentFact(firestoreClient, document, now) {
  await firestoreClient.setDocument("sourceDocuments", document.documentId, {
    source,
    sourceLabel: "Trade Republic",
    sourceChannel: "traderepublic_portal_web",
    documentType: document.documentType,
    portalDocumentLabel: document.label,
    parseStatus: document.parseStatus,
    fileType: document.fileType,
    fileName: document.fileName,
    filePath: document.filePath,
    textPath: document.textPath,
    fileHash: document.fileHash,
    documentDate: document.parsed.documentDate ?? null,
    executionId: document.parsed.executionId ?? null,
    transactionTitle: document.transactionDetail.title ?? null,
    transactionStatus: document.transactionDetail.status ?? null,
    transactionPortalDate: document.transactionDetail.portalDate ?? null,
    portalTransactionSignature: document.portalTransactionSignature ?? null,
    rawText: document.rawText,
    updatedAt: now,
  });

  await firestoreClient.setDocument("sourceDocumentFacts", document.factId, {
    source,
    sourceLabel: "Trade Republic",
    sourceChannel: "traderepublic_portal_web",
    documentId: document.documentId,
    factType: document.parsed.factType ?? document.documentType,
    documentType: document.documentType,
    portalDocumentLabel: document.label,
    parseStatus: document.parseStatus,
    documentDate: document.parsed.documentDate ?? null,
    executionId: document.parsed.executionId ?? null,
    savingsPlanId: document.parsed.savingsPlanId ?? null,
    depotNumber: document.parsed.depotNumber ?? null,
    exchange: document.parsed.exchange ?? null,
    counterparty: document.parsed.counterparty ?? null,
    name: document.parsed.name ?? null,
    isin: document.parsed.isin ?? null,
    quantity: document.parsed.quantity ?? null,
    averagePrice: document.parsed.averagePrice ?? null,
    amount: document.parsed.amount ?? null,
    fee: document.parsed.fee ?? null,
    currency: document.parsed.currency ?? null,
    bookingAccount: document.parsed.bookingAccount ?? null,
    valueDate: document.parsed.valueDate ?? null,
    bookingAmount: document.parsed.bookingAmount ?? null,
    taxYear: document.parsed.taxYear ?? null,
    depotNumber: document.parsed.depotNumber ?? null,
    accountNumber: document.parsed.accountNumber ?? null,
    referenceNumber: document.parsed.referenceNumber ?? null,
    excessIncomeNotOffset: document.parsed.excessIncomeNotOffset ?? null,
    capitalGainsTaxOnExcessIncome: document.parsed.capitalGainsTaxOnExcessIncome ?? null,
    transactionTitle: document.transactionDetail.title ?? null,
    transactionStatus: document.transactionDetail.status ?? null,
    transactionPortalDate: document.transactionDetail.portalDate ?? null,
    portalTransactionSignature: document.portalTransactionSignature ?? null,
    fileHash: document.fileHash,
    filePath: document.filePath,
    textPath: document.textPath,
    rawTransactionText: document.transactionDetail.rawText ?? null,
    updatedAt: now,
  });
}

async function writePortalDomFallbackFact(firestoreClient, fallback, transactionDetail, signature, now) {
  const id = `traderepublic_portal_dom_fact_${sanitizeId(
    `${fallback.factType}_${fallback.documentDate ?? transactionDetail.portalDate ?? ""}_${transactionDetail.title ?? ""}_${typeof fallback.amount === "number" ? fallback.amount.toFixed(2) : ""}`,
  )}`;
  await firestoreClient.setDocument("sourceDocumentFacts", id, {
    ...fallback,
    id,
    documentId: null,
    sourceDocumentId: null,
    portalTransactionSignature: signature,
    fallbackReason: "Portal-Dokumentbutton lieferte kein PDF; sichtbare Detaildaten wurden aus dem DOM gelesen.",
    updatedAt: now,
  });
  return id;
}

async function writePortalDocumentFailure(firestoreClient, failure, now) {
  const id = `traderepublic_portal_document_failure_${sanitizeId(
    `${failure.label}_${failure.transactionDetail?.title ?? "unknown"}_${failure.transactionDetail?.portalDate ?? now.toISOString()}`,
  )}`;
  await firestoreClient.setDocument("sourceDocumentFacts", id, {
    source,
    sourceLabel: "Trade Republic",
    sourceChannel: "traderepublic_portal_web",
    factType: "portal_document_failure",
    status: "WARNUNG",
    portalDocumentLabel: failure.label,
    message: failure.message,
    transactionTitle: failure.transactionDetail?.title ?? null,
    transactionStatus: failure.transactionDetail?.status ?? null,
    transactionPortalDate: failure.transactionDetail?.portalDate ?? null,
    portalTransactionSignature: failure.portalTransactionSignature ?? null,
    rawTransactionText: failure.transactionDetail?.rawText ?? null,
    updatedAt: now,
  });
}

async function getPortalDocumentTotals(firestoreClient) {
  if (!firestoreClient) return {};
  const [documents, facts, decisions] = await Promise.all([
    firestoreClient.listDocuments("sourceDocuments"),
    firestoreClient.listDocuments("sourceDocumentFacts"),
    firestoreClient.listDocuments("documentReviewDecisions"),
  ]);
  const activeDecisions = activeReviewDecisions(decisions);
  const portalDocuments = documents.filter(
    (document) => document.source === source && document.sourceChannel === "traderepublic_portal_web",
  );
  const portalFacts = facts.filter(
    (fact) => isPortalDataChannel(fact),
  );
  const successfulSignatures = new Set(
    portalFacts
      .filter((fact) => !["portal_document_failure", "portal_document_application"].includes(fact.factType))
      .map((fact) => fact.portalTransactionSignature)
      .filter(Boolean),
  );
  const unresolvedFailures = portalFacts.filter(
    (fact) =>
      fact.factType === "portal_document_failure" &&
      !successfulSignatures.has(fact.portalTransactionSignature) &&
      !isIssueResolvedByDecision(fact, activeDecisions),
  );
  const reviewedFailures = portalFacts.filter(
    (fact) =>
      fact.factType === "portal_document_failure" &&
      !successfulSignatures.has(fact.portalTransactionSignature) &&
      isIssueResolvedByDecision(fact, activeDecisions),
  );
  return {
    portalDocumentTotalCount: portalDocuments.length,
    portalDocumentFactTotalCount: portalFacts.filter(
      (fact) => !["portal_document_failure", "portal_document_application"].includes(fact.factType),
    ).length,
    portalDocumentApplicationTotalCount: portalFacts.filter((fact) => fact.factType === "portal_document_application").length,
    portalDocumentFailureTotalCount: portalFacts.filter((fact) => fact.factType === "portal_document_failure").length,
    portalDocumentUnresolvedFailureCount: unresolvedFailures.length,
    portalDocumentReviewedFailureCount: reviewedFailures.length,
    portalDocumentUnresolvedFailures: unresolvedFailures.slice(0, 8).map((failure) => ({
      label: failure.portalDocumentLabel ?? null,
      transactionTitle: failure.transactionTitle ?? null,
      transactionPortalDate: failure.transactionPortalDate ?? null,
      message: failure.message ?? null,
    })),
  };
}

function portalHasWarnings(...statObjects) {
  return statObjects.some((stats) => {
    if (!stats) return false;
    return (
      (stats.portalDocumentUnresolvedFailureCount ?? 0) > 0 ||
      (stats.portalDocumentFailedCount ?? 0) > 0 ||
      (stats.portalActivityDocumentFailedCount ?? 0) > 0 ||
      (stats.portalDocumentUnknownLabels?.length ?? 0) > 0 ||
      (stats.portalActivityDocumentFailures?.length ?? 0) > 0
    );
  });
}

function portalStatusMessage(baseMessage, ...statObjects) {
  const warningParts = [];
  for (const stats of statObjects) {
    if (!stats) continue;
    const unresolved = stats.portalDocumentUnresolvedFailureCount ?? 0;
    const failed = stats.portalDocumentFailedCount ?? 0;
    const activityFailed = stats.portalActivityDocumentFailedCount ?? 0;
    const unknown = stats.portalDocumentUnknownLabels?.length ?? 0;
    if (unresolved > 0) warningParts.push(`${unresolved} ungelöste Portal-Dokumentfehler`);
    if (failed > 0) warningParts.push(`${failed} Dokumentbutton ohne Fallback`);
    if (activityFailed > 0) warningParts.push(`${activityFailed} Activity-Dokumentfehler`);
    if (unknown > 0) warningParts.push(`${unknown} unbekannte Dokumentlabels`);
  }
  return warningParts.length ? `${baseMessage}; Warnung: ${[...new Set(warningParts)].join(", ")}` : baseMessage;
}

async function recalculateTradeRepublicSummary(firestoreClient, now) {
  const [positions, summaries] = await Promise.all([
    firestoreClient.listDocuments("sourcePositions"),
    firestoreClient.listDocuments("sourceSummaries"),
  ]);
  const activePositions = positions.filter((position) => position.source === source && position.accountValueIncluded !== false);
  const cashValue = roundCurrency(
    activePositions.filter(isCashPosition).reduce((sum, position) => sum + (position.currentValue ?? 0), 0),
  );
  const netValue = roundCurrency(activePositions.reduce((sum, position) => sum + (position.currentValue ?? 0), 0));
  const depotValue = roundCurrency(netValue - cashValue);
  const costValue = roundCurrency(
    activePositions
      .filter((position) => !isCashPosition(position))
      .reduce((sum, position) => sum + (typeof position.costValue === "number" ? position.costValue : 0), 0),
  );
  const performanceValue = costValue > 0 ? roundCurrency(depotValue - costValue) : null;
  const existingSummary = summaries.find((entry) => entry.id === source) ?? {};

  await firestoreClient.setDocument("sourceSummaries", source, {
    ...existingSummary,
    source,
    displayName: "Trade Republic",
    currentValue: netValue,
    depotValue,
    cashValue,
    netValue,
    costValue,
    performanceValue,
    performancePct: costValue && typeof performanceValue === "number" ? performanceValue / costValue : null,
    positionCount: activePositions.length,
    securityPositionCount: activePositions.filter((position) => !isCashPosition(position)).length,
    updatedAt: now,
  });

  return { cashValue, netValue, depotValue, costValue, performanceValue };
}

function getManualPrivateMarketCostBasis(manualFacts) {
  const tradeFacts = manualFacts.filter(
    (fact) =>
      fact.factType === "trade" &&
      (String(fact.isin ?? "").toUpperCase() === "LU3176111881" || /private/i.test(String(fact.name ?? fact.description ?? ""))),
  );
  const executedCost = roundCurrency(
    tradeFacts.reduce((sum, fact) => {
      if (typeof fact.quantity !== "number" || typeof fact.price !== "number") return sum;
      return sum + fact.quantity * fact.price;
    }, 0),
  );
  const executedQuantity = roundQuantity(
    tradeFacts.reduce((sum, fact) => sum + (typeof fact.quantity === "number" ? fact.quantity : 0), 0),
  );
  if (typeof executedCost === "number" && executedCost > 0) {
    return {
      costValue: executedCost,
      quantity: executedQuantity,
      source: "traderepublic_manual_private_market_trades",
    };
  }

  const cashCost = roundCurrency(
    manualFacts
      .filter((fact) => fact.factType === "private_market_cash")
      .filter((fact) => /private/i.test(String(fact.name ?? fact.description ?? "")))
      .reduce((sum, fact) => sum + Math.abs(fact.amount ?? 0), 0),
  );
  if (typeof cashCost === "number" && cashCost > 0) {
    return {
      costValue: cashCost,
      quantity: null,
      source: "traderepublic_manual_private_market_cash_fallback",
    };
  }
  return null;
}

async function reconcilePrivateMarketCostBasis(firestoreClient, manualFacts, now) {
  const costBasis = getManualPrivateMarketCostBasis(manualFacts);
  if (!costBasis) return { updated: false };

  const positions = (await firestoreClient.listDocuments("sourcePositions")).filter((position) => position.source === source);
  const privatePosition = positions.find((position) => isPrivateMarketPosition(position));
  if (!privatePosition?.id) return { updated: false };

  const currentCost = typeof privatePosition.costValue === "number" ? privatePosition.costValue : null;
  const costChanged = currentCost === null || Math.abs(currentCost - costBasis.costValue) >= 0.005;
  const quantity =
    typeof privatePosition.quantity === "number" && privatePosition.quantity > 0
      ? privatePosition.quantity
      : typeof costBasis.quantity === "number" && costBasis.quantity > 0
        ? costBasis.quantity
        : privatePosition.quantity ?? null;
  const performanceValue =
    typeof privatePosition.currentValue === "number"
      ? roundCurrency(privatePosition.currentValue - costBasis.costValue)
      : privatePosition.performanceValue ?? null;

  if (!costChanged && privatePosition.costSource === costBasis.source) {
    return { updated: false, source: costBasis.source, costValue: costBasis.costValue };
  }

  const { id, ...positionData } = privatePosition;
  await firestoreClient.setDocument("sourcePositions", id, {
    ...positionData,
    quantity,
    costValue: costBasis.costValue,
    avgCostPerShare:
      typeof quantity === "number" && quantity > 0 ? costBasis.costValue / quantity : privatePosition.avgCostPerShare ?? null,
    performanceValue,
    performancePct:
      costBasis.costValue && typeof performanceValue === "number"
        ? performanceValue / costBasis.costValue
        : privatePosition.performancePct ?? null,
    costSource: costBasis.source,
    updatedAt: now,
  });
  return { updated: true, source: costBasis.source, costValue: costBasis.costValue, performanceValue };
}

async function cleanupPortalApplicationsSupersededByManual(firestoreClient, facts, manualFacts, now) {
  const portalFacts = facts.filter(isPortalDataChannel);
  const portalFactsById = new Map(portalFacts.map((fact) => [fact.id, fact]));
  const appliedApplications = portalFacts.filter(
    (fact) => fact.factType === "portal_document_application" && fact.status === "APPLIED",
  );
  const stats = {
    portalOperationalSupersededByManualCount: 0,
    portalOperationalDeletedTransactionCount: 0,
    portalOperationalDeletedLedgerCount: 0,
    portalPrivateMarketCostRestoredFromManual: false,
    portalPrivateMarketCostBasisSource: null,
  };

  for (const application of appliedApplications) {
    const fact = portalFactsById.get(application.sourceDocumentFactId);
    if (!fact || !hasManualDuplicateForPortalFact(manualFacts, fact)) continue;

    if (fact.factType === "tax_report") {
      const { id, ...applicationData } = application;
      await firestoreClient.setDocument("sourceDocumentFacts", id, {
        ...applicationData,
        status: "SKIPPED_DUPLICATE_MANUAL",
        supersededAt: now,
        message: "Portal-Steuerreport ist inzwischen im manuellen Trade-Republic-Export enthalten.",
        updatedAt: now,
      });
      stats.portalOperationalSupersededByManualCount += 1;
      continue;
    }

    const transactionId = application.transactionId ?? portalOperationalId("tx", fact);
    const ledgerEntryId = application.ledgerEntryId ?? portalOperationalId("ledger", fact);
    if (fact.factType === "security_execution") {
      await firestoreClient.deleteDocument("transactions", transactionId);
      stats.portalOperationalDeletedTransactionCount += 1;
    }
    await firestoreClient.deleteDocument("ledgerEntries", ledgerEntryId);
    await firestoreClient.deleteDocument("costEvents", `${ledgerEntryId}_fee`);
    stats.portalOperationalDeletedLedgerCount += 1;

    const { id, ...applicationData } = application;
    await firestoreClient.setDocument("sourceDocumentFacts", id, {
      ...applicationData,
      status: "SKIPPED_DUPLICATE_MANUAL",
      supersededAt: now,
      message: "Portal-Vorgang ist inzwischen im manuellen Trade-Republic-Export enthalten.",
      updatedAt: now,
    });
    stats.portalOperationalSupersededByManualCount += 1;
  }

  const privateMarketCostBasis = await reconcilePrivateMarketCostBasis(firestoreClient, manualFacts, now);
  stats.portalPrivateMarketCostRestoredFromManual = Boolean(privateMarketCostBasis.updated);
  stats.portalPrivateMarketCostBasisSource = privateMarketCostBasis.source ?? null;

  return stats;
}

async function applyPortalDocumentFactsToOperationalCollections(firestoreClient, now) {
  if (!firestoreClient) return {};
  const [facts, positions] = await Promise.all([
    firestoreClient.listDocuments("sourceDocumentFacts"),
    firestoreClient.listDocuments("sourcePositions"),
  ]);
  const manualFacts = facts.filter((fact) => fact.source === source && !isPortalDataChannel(fact));
  const cleanupStats = await cleanupPortalApplicationsSupersededByManual(firestoreClient, facts, manualFacts, now);
  const applications = new Set(
    facts
      .filter(isPortalDataChannel)
      .filter((fact) => fact.factType === "portal_document_application")
      .map((fact) => fact.sourceDocumentFactId)
      .filter(Boolean),
  );
  const portalFacts = facts
    .filter(isPortalDataChannel)
    .filter((fact) => ["security_execution", "cash_deposit", "interest", "cash_transfer", "tax_report"].includes(fact.factType))
    .filter((fact) => fact.parseStatus === "PARSED");
  const positionsById = new Map(positions.filter((position) => position.source === source).map((position) => [position.id, position]));
  const stats = {
    portalOperationalCandidateCount: portalFacts.length,
    portalOperationalAppliedCount: 0,
    portalOperationalSkippedCount: 0,
    portalOperationalDuplicateManualCount: 0,
    portalOperationalPositionUpdateCount: 0,
  };

  for (const fact of portalFacts) {
    if (applications.has(fact.id)) {
      stats.portalOperationalSkippedCount += 1;
      continue;
    }

    const applicationId = portalApplicationId(fact);
    const baseApplication = {
      source,
      sourceLabel: "Trade Republic",
      sourceChannel: fact.sourceChannel ?? "traderepublic_portal_web",
      factType: "portal_document_application",
      sourceDocumentFactId: fact.id,
      sourceDocumentId: fact.documentId ?? null,
      portalDocumentLabel: fact.portalDocumentLabel ?? fact.label ?? null,
      documentType: fact.documentType ?? null,
      documentDate: fact.documentDate ?? fact.transactionPortalDate ?? null,
      transactionTitle: fact.transactionTitle ?? fact.name ?? null,
      transactionPortalDate: fact.transactionPortalDate ?? null,
      portalTransactionSignature: fact.portalTransactionSignature ?? null,
      updatedAt: now,
    };

    if (fact.factType === "tax_report") {
      const naturalKey = portalTaxReportNaturalKey(fact);
      const duplicateManual = hasManualDuplicateForPortalFact(manualFacts, fact);
      await firestoreClient.setDocument("sourceDocumentFacts", applicationId, {
        ...baseApplication,
        status: duplicateManual ? "SKIPPED_DUPLICATE_MANUAL" : "APPLIED",
        naturalKey,
        taxYear: fact.taxYear ?? null,
        depotNumber: fact.depotNumber ?? null,
        accountNumber: fact.accountNumber ?? null,
        referenceNumber: fact.referenceNumber ?? null,
        excessIncomeNotOffset: fact.excessIncomeNotOffset ?? null,
        capitalGainsTaxOnExcessIncome: fact.capitalGainsTaxOnExcessIncome ?? null,
        appliedTo: duplicateManual ? [] : ["sourceDocumentFacts"],
        message: duplicateManual
          ? "Portal-Steuerreport ist bereits als manueller Trade-Republic-Tax-Report vorhanden."
          : "Portal-Steuerreport als Jahresinformation gespeichert; keine Cash-Buchung erzeugt.",
        appliedAt: duplicateManual ? null : now,
      });
      applications.add(fact.id);
      stats.portalOperationalSkippedCount += duplicateManual ? 1 : 0;
      stats.portalOperationalDuplicateManualCount += duplicateManual ? 1 : 0;
      stats.portalOperationalAppliedCount += duplicateManual ? 0 : 1;
      continue;
    }

    if (fact.factType === "security_execution") {
      const naturalKey = portalTradeNaturalKey(fact);
      if (hasManualDuplicateForPortalFact(manualFacts, fact)) {
        await firestoreClient.setDocument("sourceDocumentFacts", applicationId, {
          ...baseApplication,
          status: "SKIPPED_DUPLICATE_MANUAL",
          naturalKey,
          message: "Portal-Ausfuehrung ist bereits im manuellen Trade-Republic-Export enthalten.",
        });
        applications.add(fact.id);
        stats.portalOperationalSkippedCount += 1;
        stats.portalOperationalDuplicateManualCount += 1;
        continue;
      }

      const date = fact.valueDate ?? fact.documentDate ?? fact.transactionPortalDate ?? now.toISOString().slice(0, 10);
      const bookingAmount =
        typeof fact.bookingAmount === "number"
          ? roundCurrency(fact.bookingAmount)
          : typeof fact.amount === "number"
            ? roundCurrency(-Math.abs(fact.amount))
            : null;
      const grossAmount =
        typeof fact.amount === "number"
          ? roundCurrency(Math.abs(fact.amount))
          : typeof bookingAmount === "number"
            ? roundCurrency(Math.abs(bookingAmount))
            : null;
      const side = typeof bookingAmount === "number" && bookingAmount > 0 ? "SELL" : "BUY";
      const operationId = portalOperationalId("tx", fact);
      const ledgerId = portalOperationalId("ledger", fact);

      await setEventDocument(firestoreClient, "ledgerEntries", ledgerId, {
        source,
        sourceLabel: "Trade Republic",
        sourceChannel: "traderepublic_portal_web",
        importId: fact.documentId ?? fact.id,
        date,
        bookingText: fact.name ?? fact.transactionTitle ?? "Trade Republic Portal-Ausfuehrung",
        category: "trade",
        isin: fact.isin ?? null,
        quantity: fact.quantity ?? null,
        amount: bookingAmount,
        fee: fact.fee ?? null,
        tax: null,
        currency: fact.currency ?? "EUR",
        transactionId: fact.executionId ?? fact.documentId ?? fact.id,
        sourceDocumentId: fact.documentId ?? null,
        sourceDocumentFactId: fact.id,
        naturalKey,
        provisional: true,
        updatedAt: now,
      });

      await setEventDocument(firestoreClient, "transactions", operationId, {
        source,
        sourceLabel: "Trade Republic",
        sourceChannel: "traderepublic_portal_web",
        importId: fact.documentId ?? fact.id,
        date,
        bookingText: fact.name ?? fact.transactionTitle ?? "Trade Republic Portal-Ausfuehrung",
        isin: fact.isin ?? null,
        name: fact.name ?? fact.transactionTitle ?? null,
        quantity: fact.quantity ?? null,
        price: fact.averagePrice ?? null,
        amount: bookingAmount,
        fee: fact.fee ?? null,
        tax: null,
        category: "trade",
        side,
        currency: fact.currency ?? "EUR",
        transactionId: fact.executionId ?? fact.documentId ?? fact.id,
        sourceDocumentId: fact.documentId ?? null,
        sourceDocumentFactId: fact.id,
        naturalKey,
        provisional: true,
        updatedAt: now,
      });

      if (fact.isin) {
        const positionId = positionIdForIsin(fact.isin);
        const existing = positionsById.get(positionId) ?? {};
        const existingQuantity = typeof existing.quantity === "number" ? existing.quantity : null;
        const quantity =
          existingQuantity && existingQuantity > 0
            ? existingQuantity
            : typeof fact.quantity === "number"
              ? fact.quantity
              : existing.quantity ?? null;
        const previousCost = typeof existing.costValue === "number" ? existing.costValue : 0;
        const tradeCost = typeof grossAmount === "number" ? grossAmount + Math.max(fact.fee ?? 0, 0) : 0;
        const nextCost =
          side === "SELL" && typeof fact.quantity === "number"
            ? Math.max(0, previousCost - getAverageCost(existing) * fact.quantity)
            : previousCost + tradeCost;
        const currentValue =
          typeof existing.currentValue === "number"
            ? existing.currentValue
            : typeof quantity === "number" && typeof fact.averagePrice === "number"
              ? roundCurrency(quantity * fact.averagePrice)
              : null;
        const performanceValue =
          typeof currentValue === "number" && typeof nextCost === "number" ? roundCurrency(currentValue - nextCost) : null;
        const updatedPosition = {
          ...existing,
          source,
          sourceLabel: "Trade Republic",
          accountType: existing.accountType ?? "Broker",
          accountId: existing.accountId ?? "Broker",
          name: existing.name ?? fact.name ?? fact.transactionTitle ?? null,
          isin: fact.isin,
          category: existing.category ?? "Wertpapier",
          quantity,
          costValue: roundCurrency(nextCost),
          avgCostPerShare:
            typeof quantity === "number" && quantity > 0 && typeof nextCost === "number"
              ? roundCurrency(nextCost / quantity)
              : existing.avgCostPerShare ?? null,
          currentValue,
          quotePrice: existing.quotePrice ?? fact.averagePrice ?? null,
          quoteCurrency: existing.quoteCurrency ?? "EUR",
          quotePriceEur: existing.quotePriceEur ?? fact.averagePrice ?? null,
          quoteStatus: existing.quoteStatus ?? "PORTAL_EXECUTION_PRICE",
          valuationDate: existing.valuationDate ?? date,
          valuationMethod: existing.valuationMethod ?? "traderepublic_portal_document_execution_v1",
          performanceValue,
          performancePct:
            typeof nextCost === "number" && nextCost > 0 && typeof performanceValue === "number"
              ? performanceValue / nextCost
              : existing.performancePct ?? null,
          sourceDocumentId: fact.documentId ?? null,
          sourceDocumentFactId: fact.id,
          accountValueIncluded: true,
          updatedAt: now,
        };
        await firestoreClient.setDocument("sourcePositions", positionId, updatedPosition);
        positionsById.set(positionId, { id: positionId, ...updatedPosition });
        stats.portalOperationalPositionUpdateCount += 1;
      }

      await firestoreClient.setDocument("sourceDocumentFacts", applicationId, {
        ...baseApplication,
        status: "APPLIED",
        naturalKey,
        appliedTo: ["transactions", "ledgerEntries", "sourcePositions"],
        transactionId: operationId,
        ledgerEntryId: ledgerId,
        appliedAt: now,
      });
      applications.add(fact.id);
      stats.portalOperationalAppliedCount += 1;
      continue;
    }

    if (fact.factType === "interest") {
      const naturalKey = portalCashNaturalKey(fact);
      if (hasManualDuplicateForPortalFact(manualFacts, fact)) {
        await firestoreClient.setDocument("sourceDocumentFacts", applicationId, {
          ...baseApplication,
          status: "SKIPPED_DUPLICATE_MANUAL",
          naturalKey,
          message: "Portal-Zinsbuchung ist bereits im manuellen Trade-Republic-Export enthalten.",
        });
        applications.add(fact.id);
        stats.portalOperationalSkippedCount += 1;
        stats.portalOperationalDuplicateManualCount += 1;
        continue;
      }

      const date = fact.valueDate ?? fact.documentDate ?? fact.transactionPortalDate ?? now.toISOString().slice(0, 10);
      const netAmount = typeof fact.amount === "number" ? roundCurrency(fact.amount) : null;
      const grossAmount =
        typeof fact.grossAmount === "number"
          ? roundCurrency(fact.grossAmount)
          : typeof netAmount === "number" && typeof fact.tax === "number"
            ? roundCurrency(netAmount + Math.abs(fact.tax))
            : netAmount;
      const tax = typeof fact.tax === "number" ? Math.abs(roundCurrency(fact.tax)) : null;
      const ledgerId = portalOperationalId("ledger", fact);
      await setEventDocument(firestoreClient, "ledgerEntries", ledgerId, {
        source,
        sourceLabel: "Trade Republic",
        sourceChannel: fact.sourceChannel ?? "traderepublic_portal_dom",
        importId: fact.documentId ?? fact.id,
        date,
        bookingText: fact.transactionTitle ?? "Trade Republic Portal-Zinsen",
        category: "interest",
        amount: netAmount,
        tax,
        currency: fact.currency ?? "EUR",
        transactionId: fact.documentId ?? fact.id,
        sourceDocumentId: fact.documentId ?? null,
        sourceDocumentFactId: fact.id,
        naturalKey,
        provisional: true,
        updatedAt: now,
      });
      await setEventDocument(firestoreClient, "incomeEvents", portalOperationalId("income", fact), {
        source,
        sourceLabel: "Trade Republic",
        sourceChannel: fact.sourceChannel ?? "traderepublic_portal_dom",
        importId: fact.documentId ?? fact.id,
        date,
        type: "interest",
        amount: grossAmount,
        netAmount,
        tax,
        currency: fact.currency ?? "EUR",
        transactionId: fact.documentId ?? fact.id,
        sourceDocumentId: fact.documentId ?? null,
        sourceDocumentFactId: fact.id,
        naturalKey,
        provisional: true,
        updatedAt: now,
      });
      if (typeof tax === "number" && tax > 0) {
        await setEventDocument(firestoreClient, "costEvents", `${ledgerId}_tax`, {
          source,
          sourceLabel: "Trade Republic",
          sourceChannel: fact.sourceChannel ?? "traderepublic_portal_dom",
          importId: fact.documentId ?? fact.id,
          date,
          type: "tax",
          amount: tax,
          currency: fact.currency ?? "EUR",
          transactionId: fact.documentId ?? fact.id,
          sourceDocumentId: fact.documentId ?? null,
          sourceDocumentFactId: fact.id,
          naturalKey,
          provisional: true,
          updatedAt: now,
        });
      }
      await firestoreClient.setDocument("sourceDocumentFacts", applicationId, {
        ...baseApplication,
        status: "APPLIED",
        naturalKey,
        appliedTo: typeof tax === "number" && tax > 0 ? ["ledgerEntries", "incomeEvents", "costEvents"] : ["ledgerEntries", "incomeEvents"],
        ledgerEntryId: ledgerId,
        appliedAt: now,
      });
      applications.add(fact.id);
      stats.portalOperationalAppliedCount += 1;
      continue;
    }

    if (fact.factType === "cash_transfer") {
      const naturalKey = portalCashNaturalKey(fact);
      if (hasManualDuplicateForPortalFact(manualFacts, fact)) {
        await firestoreClient.setDocument("sourceDocumentFacts", applicationId, {
          ...baseApplication,
          status: "SKIPPED_DUPLICATE_MANUAL",
          naturalKey,
          message: "Portal-Cashbuchung ist bereits im manuellen Trade-Republic-Export enthalten.",
        });
        applications.add(fact.id);
        stats.portalOperationalSkippedCount += 1;
        stats.portalOperationalDuplicateManualCount += 1;
        continue;
      }

      const date = fact.valueDate ?? fact.documentDate ?? fact.transactionPortalDate ?? now.toISOString().slice(0, 10);
      const amount =
        typeof fact.bookingAmount === "number"
          ? roundCurrency(fact.bookingAmount)
          : typeof fact.amount === "number"
            ? roundCurrency(fact.amount)
            : null;
      const ledgerId = portalOperationalId("ledger", fact);
      await setEventDocument(firestoreClient, "ledgerEntries", ledgerId, {
        source,
        sourceLabel: "Trade Republic",
        sourceChannel: fact.sourceChannel ?? "traderepublic_portal_dom",
        importId: fact.documentId ?? fact.id,
        date,
        bookingText: fact.transactionTitle ?? "Trade Republic Portal-Cashbuchung",
        category: fact.direction ?? "cash_transfer",
        amount,
        currency: fact.currency ?? "EUR",
        counterpartyName: fact.counterpartyName ?? null,
        counterpartyIban: fact.counterpartyIban ?? null,
        paymentReference: fact.paymentReference ?? null,
        transactionId: fact.documentId ?? fact.id,
        sourceDocumentId: fact.documentId ?? null,
        sourceDocumentFactId: fact.id,
        naturalKey,
        provisional: true,
        updatedAt: now,
      });
      await firestoreClient.setDocument("sourceDocumentFacts", applicationId, {
        ...baseApplication,
        status: "APPLIED",
        naturalKey,
        appliedTo: ["ledgerEntries"],
        ledgerEntryId: ledgerId,
        appliedAt: now,
      });
      applications.add(fact.id);
      stats.portalOperationalAppliedCount += 1;
      continue;
    }

    if (fact.factType === "cash_deposit") {
      const naturalKey = portalCashNaturalKey(fact);
      if (hasManualDuplicateForPortalFact(manualFacts, fact)) {
        await firestoreClient.setDocument("sourceDocumentFacts", applicationId, {
          ...baseApplication,
          status: "SKIPPED_DUPLICATE_MANUAL",
          naturalKey,
          message: "Portal-Einzahlung ist bereits im manuellen Trade-Republic-Export enthalten.",
        });
        applications.add(fact.id);
        stats.portalOperationalSkippedCount += 1;
        stats.portalOperationalDuplicateManualCount += 1;
        continue;
      }

      const date = fact.valueDate ?? fact.documentDate ?? fact.transactionPortalDate ?? now.toISOString().slice(0, 10);
      const amount =
        typeof fact.bookingAmount === "number"
          ? roundCurrency(fact.bookingAmount)
          : typeof fact.amount === "number"
            ? roundCurrency(fact.amount)
            : null;
      const ledgerId = portalOperationalId("ledger", fact);
      await setEventDocument(firestoreClient, "ledgerEntries", ledgerId, {
        source,
        sourceLabel: "Trade Republic",
        sourceChannel: "traderepublic_portal_web",
        importId: fact.documentId ?? fact.id,
        date,
        bookingText: fact.transactionTitle ?? "Trade Republic Portal-Einzahlung",
        category: "cash_deposit",
        amount,
        fee: fact.fee ?? null,
        currency: fact.currency ?? "EUR",
        transactionId: fact.documentId ?? fact.id,
        sourceDocumentId: fact.documentId ?? null,
        sourceDocumentFactId: fact.id,
        naturalKey,
        provisional: true,
        updatedAt: now,
      });
      if (typeof fact.fee === "number" && fact.fee > 0) {
        await setEventDocument(firestoreClient, "costEvents", `${ledgerId}_fee`, {
          source,
          sourceLabel: "Trade Republic",
          sourceChannel: "traderepublic_portal_web",
          importId: fact.documentId ?? fact.id,
          date,
          type: "fee",
          amount: fact.fee,
          currency: fact.currency ?? "EUR",
          transactionId: fact.documentId ?? fact.id,
          sourceDocumentId: fact.documentId ?? null,
          sourceDocumentFactId: fact.id,
          naturalKey,
          provisional: true,
          updatedAt: now,
        });
      }
      await firestoreClient.setDocument("sourceDocumentFacts", applicationId, {
        ...baseApplication,
        status: "APPLIED",
        naturalKey,
        appliedTo: typeof fact.fee === "number" && fact.fee > 0 ? ["ledgerEntries", "costEvents"] : ["ledgerEntries"],
        ledgerEntryId: ledgerId,
        appliedAt: now,
      });
      applications.add(fact.id);
      stats.portalOperationalAppliedCount += 1;
    }
  }

  if (
    stats.portalOperationalAppliedCount > 0 ||
    stats.portalOperationalPositionUpdateCount > 0 ||
    cleanupStats.portalOperationalSupersededByManualCount > 0 ||
    cleanupStats.portalPrivateMarketCostRestoredFromManual
  ) {
    const summary = await recalculateTradeRepublicSummary(firestoreClient, now);
    return { ...stats, ...cleanupStats, ...summary };
  }
  return { ...stats, ...cleanupStats };
}

async function crawlPortalDocuments(context, page, firestoreClient, now) {
  const knownSignatures = await getKnownPortalDocumentSignatures(firestoreClient);
  const stats = {
    portalDocumentScanLimit,
    portalStopAfterKnownTransactions,
    portalTransactionScanCandidateCount: 0,
    portalTransactionScannedCount: 0,
    portalTransactionKnownStopCount: 0,
    portalDocumentFoundCount: 0,
    portalDocumentSkippedKnownCount: 0,
    portalDocumentDownloadedCount: 0,
    portalDocumentDomFallbackCount: 0,
    portalDocumentParsedCount: 0,
    portalDocumentFailedCount: 0,
    portalTransactionNoDocumentCount: 0,
    portalDocumentUnknownLabels: [],
    portalDocumentFailures: [],
  };

  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => null);
  const transactionButtons = transactionButtonLocator(page);
  await waitForLocatorCount(transactionButtons, 1, { timeoutMs: 3000 });
  const count = Math.min(await transactionButtons.count().catch(() => 0), portalDocumentScanLimit);
  stats.portalTransactionScanCandidateCount = count;
  let consecutiveKnownTransactions = 0;

  for (let index = 0; index < count; index += 1) {
    const button = transactionButtons.nth(index);
    if (!(await button.isVisible({ timeout: 1200 }).catch(() => false))) continue;
    stats.portalTransactionScannedCount += 1;
    const cardDetail = parseTransactionCardText(await button.innerText().catch(() => ""));
    await button.scrollIntoViewIfNeeded().catch(() => null);
    await button.click({ timeout: 5000, force: true }).catch(() => null);
    await waitForDetailView(page);

    const detailText = await readDetailText(page);
    const modalDetail = parseTransactionDetail(detailText);
    const transactionDetail = {
      ...modalDetail,
      title: cardDetail.title ?? modalDetail.title ?? null,
      portalDate: cardDetail.portalDate ?? modalDetail.portalDate ?? null,
      portalDateText: cardDetail.portalDateText ?? modalDetail.portalDateText ?? null,
      amount: cardDetail.amount ?? modalDetail.amount ?? null,
      amountText: cardDetail.amountText ?? modalDetail.amountText ?? null,
      listText: cardDetail.listText ?? null,
    };
    const visibleLabels = await collectVisibleDocumentLabels(page);
    const labels =
      visibleLabels.length > 0 || /^Skip to content/i.test(transactionDetail.rawText ?? "")
        ? visibleLabels
        : transactionDetail.documentLabels;
    stats.portalDocumentFoundCount += labels.length;
    let transactionHadNewWork = false;
    let transactionAllDocumentsKnown = true;
    if (labels.length === 0) {
      stats.portalTransactionNoDocumentCount += 1;
    }

    for (const label of labels) {
      if (documentTypeFromLabel(label) === "unknown_portal_document") {
        stats.portalDocumentUnknownLabels.push(label);
      }
      const signature = portalDocumentSignature(label, transactionDetail);
      if (knownSignatures.has(signature)) {
        stats.portalDocumentSkippedKnownCount += 1;
        continue;
      }
      transactionAllDocumentsKnown = false;
      transactionHadNewWork = true;
      try {
        const bytes = await clickDocumentAndReadBytes(context, page, label);
        const document = await savePortalDocumentPdf(bytes, label, transactionDetail);
        stats.portalDocumentDownloadedCount += 1;
        if (document.parseStatus === "PARSED") stats.portalDocumentParsedCount += 1;
        if (firestoreClient) await writePortalDocumentFact(firestoreClient, document, now);
        knownSignatures.add(document.portalTransactionSignature);
      } catch (error) {
        const fallback = parsePortalDomFallback(label, transactionDetail);
        if (fallback && fallback.parseStatus === "PARSED") {
          stats.portalDocumentDomFallbackCount += 1;
          stats.portalDocumentParsedCount += 1;
          if (firestoreClient) await writePortalDomFallbackFact(firestoreClient, fallback, transactionDetail, signature, now);
          knownSignatures.add(signature);
        } else {
          const failure = {
            label,
            message: error instanceof Error ? error.message : String(error),
            transactionDetail,
            portalTransactionSignature: signature,
          };
          stats.portalDocumentFailedCount += 1;
          stats.portalDocumentFailures.push(failure);
          if (firestoreClient) await writePortalDocumentFailure(firestoreClient, failure, now);
        }
      } finally {
        await closeDetailView(page);
        if (labels.indexOf(label) < labels.length - 1) {
          await button.click({ timeout: 5000, force: true }).catch(() => null);
          await waitForDetailView(page);
        }
      }
    }

    await closeDetailView(page);
    if (transactionAllDocumentsKnown && !transactionHadNewWork) {
      consecutiveKnownTransactions += 1;
      stats.portalTransactionKnownStopCount = consecutiveKnownTransactions;
      if (
        portalStopAfterKnownTransactions > 0 &&
        consecutiveKnownTransactions >= portalStopAfterKnownTransactions
      ) {
        break;
      }
    } else {
      consecutiveKnownTransactions = 0;
    }
  }

  stats.portalDocumentUnknownLabels = [...new Set(stats.portalDocumentUnknownLabels)];
  stats.portalDocumentFailures = stats.portalDocumentFailures.slice(0, 12).map((failure) => ({
    label: failure.label,
    message: failure.message,
    transactionTitle: failure.transactionDetail?.title ?? null,
    transactionPortalDate: failure.transactionDetail?.portalDate ?? null,
  }));
  return stats;
}

async function crawlPortalActivityDocuments(context, page, firestoreClient, now) {
  const knownSignatures = await getKnownPortalDocumentSignatures(firestoreClient);
  const stats = {
    portalActivityDocumentScanLimit: 12,
    portalActivityScannedCount: 0,
    portalActivityDocumentFoundCount: 0,
    portalActivityDocumentSkippedKnownCount: 0,
    portalActivityDocumentDownloadedCount: 0,
    portalActivityDocumentParsedCount: 0,
    portalActivityDocumentFailedCount: 0,
    portalActivityDocumentFailures: [],
  };

  await page.goto(TRADE_REPUBLIC_ACTIVITY_URL, { waitUntil: "domcontentloaded" });
  await waitForBodyText(
    page,
    (text) => normalizeText(text).length > 300 || /Annual Tax Report|Activity|Documents?|Reports?/i.test(text),
    { timeoutMs: 5000 },
  );
  const activityButtons = page.locator('div[role="button"], li [role="button"], button').filter({
    hasText: /Annual Tax Report/i,
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if ((await activityButtons.count().catch(() => 0)) > 0) break;
    await page.mouse.wheel(0, 900).catch(() => {});
    await waitForLocatorCount(activityButtons, 1, { timeoutMs: 800 });
  }

  const count = Math.min(await activityButtons.count().catch(() => 0), stats.portalActivityDocumentScanLimit);
  stats.portalActivityScannedCount = count;

  for (let index = 0; index < count; index += 1) {
    const button = activityButtons.nth(index);
    if (!(await button.isVisible({ timeout: 1000 }).catch(() => false))) continue;
    const cardDetail = parseTransactionCardText(await button.innerText().catch(() => ""));
    await button.scrollIntoViewIfNeeded().catch(() => null);
    await button.click({ timeout: 5000, force: true }).catch(() => null);
    await waitForDetailView(page);

    const detailText = await readDetailText(page);
    const modalDetail = parseTransactionDetail(detailText);
    const transactionDetail = {
      ...modalDetail,
      title: cardDetail.title ?? modalDetail.title ?? "Annual Tax Report",
      portalDate: cardDetail.portalDate ?? modalDetail.portalDate ?? null,
      portalDateText: cardDetail.portalDateText ?? modalDetail.portalDateText ?? null,
      amount: null,
      amountText: null,
      listText: cardDetail.listText ?? null,
    };
    const labels = parseKnownDocumentLabels(detailText).filter((label) => documentTypeFromLabel(label) === "tax_report");
    stats.portalActivityDocumentFoundCount += labels.length;

    for (const label of labels) {
      const signature = portalDocumentSignature(label, transactionDetail);
      if (knownSignatures.has(signature)) {
        stats.portalActivityDocumentSkippedKnownCount += 1;
        continue;
      }
      try {
        const bytes = await clickDocumentAndReadBytes(context, page, label);
        const document = await savePortalDocumentPdf(bytes, label, transactionDetail);
        stats.portalActivityDocumentDownloadedCount += 1;
        if (document.parseStatus === "PARSED") stats.portalActivityDocumentParsedCount += 1;
        if (firestoreClient) await writePortalDocumentFact(firestoreClient, document, now);
        knownSignatures.add(document.portalTransactionSignature);
      } catch (error) {
        const failure = {
          label,
          message: error instanceof Error ? error.message : String(error),
          transactionDetail,
          portalTransactionSignature: signature,
        };
        stats.portalActivityDocumentFailedCount += 1;
        stats.portalActivityDocumentFailures.push(failure);
        if (firestoreClient) await writePortalDocumentFailure(firestoreClient, failure, now);
      }
    }

    await closeDetailView(page);
  }

  stats.portalActivityDocumentFailures = stats.portalActivityDocumentFailures.slice(0, 12).map((failure) => ({
    label: failure.label,
    message: failure.message,
    transactionTitle: failure.transactionDetail?.title ?? null,
    transactionPortalDate: failure.transactionDetail?.portalDate ?? null,
  }));
  return stats;
}

async function saveDiagnosticSnapshot(page) {
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const url = page.url();
  const target = path.join(portalSnapshotDir, `${timestampForFilename()}_transactions_page.txt`);
  await fs.writeFile(target, `URL: ${url}\n\n${bodyText.slice(0, 250000)}`);
  return target;
}

async function applyPortalSnapshot(firestoreClient, snapshot, snapshotPath, now) {
  const existingPositions = (await firestoreClient.listDocuments("sourcePositions")).filter(
    (position) => position.source === source,
  );
  const byName = new Map(existingPositions.map((position) => [normalizeName(position.name), position]));
  const updatedPositionIds = [];

  for (const portalPosition of snapshot.portfolio.positions) {
    const existing = byName.get(portalPosition.normalizedName);
    if (!existing?.id) continue;
    const performanceValue =
      typeof existing.costValue === "number"
        ? roundCurrency(portalPosition.currentValue - existing.costValue)
        : existing.performanceValue ?? null;
    await firestoreClient.setDocument("sourcePositions", existing.id, {
      ...existing,
      quantity: portalPosition.quantity ?? existing.quantity ?? null,
      currentValue: portalPosition.currentValue,
      brokerCurrentValue: portalPosition.currentValue,
      brokerQuoteProvider: "traderepublic_portal_web",
      quoteProvider: "traderepublic_portal_web",
      quoteStatus: "OK",
      quoteAsOf: now,
      quoteUpdatedAt: now,
      quoteFetchedAt: now,
      priceSource: "Trade Republic Web-Portal",
      valuationDate: now.toISOString().slice(0, 10),
      valuationMethod: "traderepublic_portal_web_v1",
      performanceValue,
      performancePct:
        typeof existing.costValue === "number" && existing.costValue && typeof performanceValue === "number"
          ? performanceValue / existing.costValue
          : existing.performancePct ?? null,
      portalSinceBuyPct: portalPosition.sinceBuyPct ?? null,
      portalSnapshotPath: snapshotPath,
      updatedAt: now,
    });
    updatedPositionIds.push(existing.id);
  }

  const privatePositions = existingPositions.filter(isPrivateMarketPosition);
  if (
    privatePositions.length === 1 &&
    typeof snapshot.portfolio.impliedPrivateMarketsValue === "number" &&
    snapshot.portfolio.impliedPrivateMarketsValue > 0
  ) {
    const existing = privatePositions[0];
    const performanceValue =
      typeof existing.costValue === "number"
        ? roundCurrency(snapshot.portfolio.impliedPrivateMarketsValue - existing.costValue)
        : existing.performanceValue ?? null;
    await firestoreClient.setDocument("sourcePositions", existing.id, {
      ...existing,
      currentValue: snapshot.portfolio.impliedPrivateMarketsValue,
      brokerCurrentValue: snapshot.portfolio.impliedPrivateMarketsValue,
      brokerQuoteProvider: "traderepublic_portal_total_implied",
      quoteProvider: "traderepublic_portal_total_implied",
      quoteStatus: "OK",
      quoteAsOf: now,
      quoteUpdatedAt: now,
      quoteFetchedAt: now,
      priceSource: "Trade Republic Web-Portfolio Gesamtwert minus gelistete Positionen",
      valuationDate: now.toISOString().slice(0, 10),
      valuationMethod: "traderepublic_portal_total_implied_private_markets_v1",
      performanceValue,
      performancePct:
        typeof existing.costValue === "number" && existing.costValue && typeof performanceValue === "number"
          ? performanceValue / existing.costValue
          : existing.performancePct ?? null,
      portalSnapshotPath: snapshotPath,
      updatedAt: now,
    });
    updatedPositionIds.push(existing.id);
  }

  if (typeof snapshot.transactions.cashValue === "number") {
    const existingCash = existingPositions.find(isCashPosition) ?? {};
    await firestoreClient.setDocument("sourcePositions", existingCash.id ?? "traderepublic_cash", {
      ...existingCash,
      source,
      sourceLabel: "Trade Republic",
      accountType: "Broker",
      accountId: "Broker",
      name: "Cashkonto",
      category: "Cash",
      quantity: 1,
      quantityText: "1 Konto",
      currentValue: snapshot.transactions.cashValue,
      costValue: snapshot.transactions.cashValue,
      currency: "EUR",
      valuationDate: now.toISOString().slice(0, 10),
      valuationMethod: "traderepublic_portal_cash_v1",
      priceSource: "Trade Republic Web-Portal",
      accountValueIncluded: true,
      portalSnapshotPath: snapshotPath,
      updatedAt: now,
    });
    updatedPositionIds.push(existingCash.id ?? "traderepublic_cash");
  }

  await firestoreClient.setDocument("sourceDocumentFacts", "traderepublic_portal_snapshot_latest", {
    source,
    factType: "portal_snapshot",
    observedAt: snapshot.observedAt,
    totalValue: snapshot.portfolio.totalValue,
    listedValue: snapshot.portfolio.listedValue,
    impliedPrivateMarketsValue: snapshot.portfolio.impliedPrivateMarketsValue,
    dayChangeValue: snapshot.portfolio.dayChangeValue,
    dayChangePct: snapshot.portfolio.dayChangePct,
    displayMode: snapshot.portfolio.displayMode,
    cashValue: snapshot.transactions.cashValue,
    visiblePositionCount: snapshot.portfolio.positions.length,
    visibleTransactionCount: snapshot.transactions.entries.length,
    positions: snapshot.portfolio.positions,
    transactions: snapshot.transactions.entries.slice(0, 50),
    activityRawText: snapshot.activityRawText,
    snapshotPath,
    updatedAt: now,
  });

  const refreshedPositions = (await firestoreClient.listDocuments("sourcePositions")).filter(
    (position) => position.source === source && position.accountValueIncluded !== false,
  );
  const cashValue = roundCurrency(
    refreshedPositions.filter(isCashPosition).reduce((sum, position) => sum + (position.currentValue ?? 0), 0),
  );
  const netValue = roundCurrency(refreshedPositions.reduce((sum, position) => sum + (position.currentValue ?? 0), 0));
  const depotValue = roundCurrency(netValue - cashValue);
  const costValue = roundCurrency(
    refreshedPositions
      .filter((position) => !isCashPosition(position))
      .reduce((sum, position) => sum + (typeof position.costValue === "number" ? position.costValue : 0), 0),
  );
  const performanceValue = costValue > 0 ? roundCurrency(depotValue - costValue) : null;
  const existingSummary =
    (await firestoreClient.listDocuments("sourceSummaries")).find((entry) => entry.id === source) ?? {};

  await firestoreClient.setDocument("sourceSummaries", source, {
    ...existingSummary,
    source,
    displayName: "Trade Republic",
    currentValue: netValue,
    depotValue,
    cashValue,
    netValue,
    costValue,
    performanceValue,
    performancePct: costValue && typeof performanceValue === "number" ? performanceValue / costValue : null,
    positionCount: refreshedPositions.length,
    securityPositionCount: refreshedPositions.filter((position) => !isCashPosition(position)).length,
    sourceDataUpdatedAt: now,
    sourceDataProvider: "traderepublic_portal_web",
    quoteDataUpdatedAt: now,
    quoteDataProvider: "traderepublic_portal_web",
    brokerSnapshotDate: now.toISOString().slice(0, 10),
    brokerSnapshotValue: snapshot.portfolio.totalValue,
    brokerageValue: snapshot.portfolio.listedValue,
    privateMarketsValue: snapshot.portfolio.impliedPrivateMarketsValue,
    brokerCashValue: cashValue,
    valuationMethod: "traderepublic_portal_web_plus_manual_exports_v1",
    updatedAt: now,
  });

  return {
    updatedPositionCount: updatedPositionIds.length,
    visiblePositionCount: snapshot.portfolio.positions.length,
    visibleTransactionCount: snapshot.transactions.entries.length,
    cashValue,
    netValue,
    depotValue,
  };
}

async function main() {
  runStartedAt = new Date();
  await ensureDirectories();

  if (applyExistingPortalDocsOnly) {
    await writeStatus("RUNNING", "Bereits geladene Trade-Republic-Portal-Dokumente werden operativ angewendet");
    const client = await getFirestore();
    if (!client) {
      console.log("[dry-run] --apply-existing-portal-docs benoetigt --write fuer Firestore-Anwendung.");
      return;
    }
    const now = new Date();
    const portalOperationalStats = await applyPortalDocumentFactsToOperationalCollections(client, now);
    const portalDocumentTotals = await getPortalDocumentTotals(client);
    const status = portalHasWarnings(portalDocumentTotals) ? "WARNUNG" : "OK";
    await writeStatus(status, portalStatusMessage("Bereits geladene Trade-Republic-Portal-Dokumente geprueft und angewendet", portalDocumentTotals), {
      ...portalOperationalStats,
      ...portalDocumentTotals,
      lastAppliedPortalDocumentsAt: now,
    });
    console.log(
      `[ok] Portal-Dokumente angewendet: ${portalOperationalStats.portalOperationalAppliedCount ?? 0} neu, ${portalOperationalStats.portalOperationalSkippedCount ?? 0} uebersprungen.`,
    );
    return;
  }

  await writeStatus("RUNNING", "Trade-Republic-Portal-Refresh gestartet");

  const { context, page } = await launchTradeRepublicBrowser({ headless });
  try {
    await ensureTradeRepublicLogin(page, {
      onStatus: async (message) => writeStatus("RUNNING", message),
    });

    await writeStatus("RUNNING", "Portal-Snapshot wird gelesen");
    const snapshot = await collectPortalSnapshot(page);
    assertUsablePortalSnapshot(snapshot);
    const snapshotPath = await savePortalSnapshot(snapshot);
    const client = await getFirestore();
    let portalStats = null;
    if (client) {
      portalStats = await applyPortalSnapshot(client, snapshot, snapshotPath, new Date());
    }

    if (snapshotOnly) {
      await writeStatus("OK", "Portal-Snapshot aktualisiert; Dokument- und Transaktionsdetailscan uebersprungen", {
        portalSnapshotPath: snapshotPath,
        lastPortalObservedAt: snapshot.observedAt,
        portalScanMode: "snapshot_only",
        ...(portalStats ?? {}),
      });
      console.log(`[ok] Trade-Republic-Portal-Snapshot aktualisiert (schneller Lauf): ${snapshotPath}`);
      return;
    }

    await writeStatus("RUNNING", "Transaction-History-Seite wird geoeffnet");
    await page.goto(TRADE_REPUBLIC_TRANSACTIONS_URL, { waitUntil: "domcontentloaded" });
    await waitForBodyText(
      page,
      (text) => /This month|January|February|March|April|May|June|July|August|September|October|November|December|\d{4}/i.test(text),
      {
        timeoutMs: 8000,
      },
    );
    if (fullPortalScan) {
      await scrollLoadedTransactions(page);
    } else {
      await waitForRecentTransactions(page);
    }

    await writeStatus("RUNNING", "Portal-PDFs werden gesucht und geprueft");
    const portalDocumentStats = await crawlPortalDocuments(context, page, client, new Date());
    await writeStatus("RUNNING", "Activity-Dokumente werden gesucht und geprueft");
    const portalActivityDocumentStats = await crawlPortalActivityDocuments(context, page, client, new Date());
    const portalOperationalStats = client
      ? await applyPortalDocumentFactsToOperationalCollections(client, new Date())
      : {};
    const portalDocumentTotals = await getPortalDocumentTotals(client);
    const downloadedDocumentCount =
      portalDocumentStats.portalDocumentDownloadedCount +
      portalActivityDocumentStats.portalActivityDocumentDownloadedCount;

    if (downloadedDocumentCount > 0) {
      const diagnosticPath = await saveDiagnosticSnapshot(page);
      const documentMessage = `${downloadedDocumentCount} Portal-PDFs in diesem Lauf; ${portalDocumentTotals.portalDocumentTotalCount ?? downloadedDocumentCount} gesamt`;
      const status = portalHasWarnings(portalDocumentStats, portalActivityDocumentStats, portalDocumentTotals) ? "WARNUNG" : "OK";
      await writeStatus(status, portalStatusMessage(`Portal-Snapshot aktualisiert; ${documentMessage}`, portalDocumentStats, portalActivityDocumentStats, portalDocumentTotals), {
        portalSnapshotPath: snapshotPath,
        diagnosticPath,
        lastPortalObservedAt: snapshot.observedAt,
        ...(portalStats ?? {}),
        ...portalDocumentStats,
        ...portalActivityDocumentStats,
        ...portalOperationalStats,
        ...portalDocumentTotals,
      });
      console.log(`[ok] Trade-Republic-Portal-Snapshot aktualisiert. ${documentMessage}: ${diagnosticPath}`);
      return;
    }

    const diagnosticPath = await saveDiagnosticSnapshot(page);
    const status = portalHasWarnings(portalDocumentStats, portalActivityDocumentStats, portalDocumentTotals) ? "WARNUNG" : "OK";
    await writeStatus(status, portalStatusMessage("Portal-Snapshot aktualisiert; keine neuen Portal-PDFs gespeichert", portalDocumentStats, portalActivityDocumentStats, portalDocumentTotals), {
      portalSnapshotPath: snapshotPath,
      diagnosticPath,
      lastPortalObservedAt: snapshot.observedAt,
      ...(portalStats ?? {}),
      ...portalDocumentStats,
      ...portalActivityDocumentStats,
      ...portalOperationalStats,
      ...portalDocumentTotals,
    });
    console.log(`[ok] Trade-Republic-Portal-Snapshot aktualisiert. Keine neuen Portal-PDFs gespeichert: ${diagnosticPath}`);
  } catch (error) {
    await writeStatus("FEHLER", error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    if (!keepBrowserOpen) await context.close().catch(() => {});
  }
}

await main();
