import "dotenv/config";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";
import { extractPdfText } from "./pdf-text.mjs";
import {
  buildVbvAccountInformationFacts,
  parseVbvAccountInformationText,
} from "./vbv-account-information-parser.mjs";
import {
  downloadVbvAccountInformation,
  ensureVbvLogin,
  launchVbvBrowser,
  parseVbvBalanceText,
  readVbvBalance,
} from "./vbv-browser.mjs";

const execFileAsync = promisify(execFile);
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

function vbvDataProviderFor(balance) {
  return balance.valuationMethod === "manual_quarterly_balance_v1" ? "manual_vbv_balance" : "vbv_portal";
}

function defaultVbvAccountInformationDir() {
  return path.join(
    os.homedir(),
    "Library",
    "CloudStorage",
    "GoogleDrive-niklas.kofler@gmail.com",
    "My Drive",
    "Depot",
    "01_Originale",
    "VBV",
    "AccountInformation",
  );
}

function sanitizeId(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

function compactAccountInformation(parsed) {
  return {
    documentType: parsed.documentType,
    parseStatus: parsed.parseStatus,
    statementDate: parsed.statementDate,
    valuationDate: parsed.valuationDate,
    customerNumber: parsed.customerNumber,
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
    contractCount: parsed.contracts.length,
    contracts: parsed.contracts.map(({ rawText, ...contract }) => contract),
  };
}

async function sha256File(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function semanticHashForAccountInformation(parsed) {
  const payload = {
    documentType: parsed.documentType,
    valuationDate: parsed.valuationDate,
    statementDate: parsed.statementDate,
    totalValue: parsed.totalValue,
    guaranteedCapital: parsed.guaranteedCapital,
    costValue: parsed.costValue,
    performanceValue: parsed.performanceValue,
    contracts: parsed.contracts.map((contract) => ({
      employer: contract.employer,
      openingDate: contract.openingDate,
      openingBalance: contract.openingBalance,
      contributionYear: contract.contributionYear,
      contributions: contract.contributions,
      administrationCosts: contract.administrationCosts,
      socialInsuranceCosts: contract.socialInsuranceCosts,
      investmentResultNet: contract.investmentResultNet,
      closingDate: contract.closingDate,
      closingBalance: contract.closingBalance,
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function ensureAccountInformationFile(filePath, fileHash, valuationDate) {
  const targetDir = process.env.VBV_ACCOUNT_INFORMATION_DIR ?? defaultVbvAccountInformationDir();
  await fs.mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, `${valuationDate}_VBV_AccountInformation_${fileHash.slice(0, 10)}.pdf`);
  if (path.resolve(filePath) !== path.resolve(targetPath)) {
    await fs.copyFile(filePath, targetPath);
  }
  return targetPath;
}

async function parseAccountInformationPdf(filePath, { importedAt }) {
  const fileHash = await sha256File(filePath);
  const text = await extractPdfText(filePath);
  const parsed = parseVbvAccountInformationText(text);
  if (!parsed.valuationDate) {
    throw new Error("VBV-Kontoinformation konnte nicht geparst werden: Stichtag fehlt.");
  }
  const semanticHash = semanticHashForAccountInformation(parsed);
  const canonicalPath = await ensureAccountInformationFile(filePath, fileHash, parsed.valuationDate);
  const documentId = `vbv_account_information_${sanitizeId(parsed.valuationDate)}`;
  const importId = `vbv_account_information_${sanitizeId(importedAt.toISOString())}`;
  return {
    documentId,
    importId,
    fileHash,
    semanticHash,
    filePath: canonicalPath,
    fileName: path.basename(canonicalPath),
    parsed,
  };
}

function shouldRefreshAccountInformation(balance, previousSummary) {
  if (process.argv.includes("--force-account-info")) return true;
  if (!balance?.valuationDate) return false;
  const previousInfo = previousSummary?.accountInformation;
  return (
    previousSummary?.documentDataUpdatedAt !== balance.valuationDate ||
    previousInfo?.valuationDate !== balance.valuationDate ||
    !previousInfo?.totalValue
  );
}

async function maybeLoadAccountInformation(balance, previousSummary, { importedAt }) {
  const manualPdfPath = readArg("--account-info-pdf");
  if (manualPdfPath) {
    return parseAccountInformationPdf(manualPdfPath, { importedAt });
  }
  if (process.argv.includes("--skip-account-info")) return null;
  if (!shouldRefreshAccountInformation(balance, previousSummary)) return null;
  if (balance.valuationMethod === "manual_quarterly_balance_v1" || process.argv.includes("--from-current-chrome")) {
    return null;
  }

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { context, page } = await launchVbvBrowser({ headless: process.env.VBV_HEADLESS === "1" });
    try {
      await ensureVbvLogin(page);
      const targetDir = process.env.VBV_ACCOUNT_INFORMATION_DIR ?? defaultVbvAccountInformationDir();
      const downloadedPath = await downloadVbvAccountInformation(page, targetDir, {
        valuationDate: balance.valuationDate,
      });
      return parseAccountInformationPdf(downloadedPath, { importedAt });
    } catch (error) {
      lastError = error;
    } finally {
      await context.close().catch(() => {});
    }
  }
  throw lastError;
}

async function writeAccountInformation(firestore, accountInformation, now) {
  if (!accountInformation) return;
  const { documentId, importId, fileHash, semanticHash, filePath, fileName, parsed } = accountInformation;
  const [existingDocs, existingFacts] = await Promise.all([
    firestore.listDocuments("sourceDocuments"),
    firestore.listDocuments("sourceDocumentFacts"),
  ]);
  const duplicateDocs = existingDocs.filter(
    (document) =>
      document.source === "vbv" &&
      document.documentType === parsed.documentType &&
      document.valuationDate === parsed.valuationDate &&
      document.id !== documentId,
  );
  const duplicateFacts = existingFacts.filter(
    (fact) =>
      fact.source === "vbv" &&
      fact.documentType === parsed.documentType &&
      fact.valuationDate === parsed.valuationDate &&
      fact.documentId !== documentId,
  );
  for (const duplicate of duplicateFacts) {
    await firestore.deleteDocument("sourceDocumentFacts", duplicate.id);
  }
  for (const duplicate of duplicateDocs) {
    await firestore.deleteDocument("sourceDocuments", duplicate.id);
  }

  await firestore.setDocument("sourceDocuments", documentId, {
    source: "vbv",
    provider: "vbv_account_information_pdf",
    documentType: parsed.documentType,
    parseStatus: parsed.parseStatus,
    statementDate: parsed.statementDate,
    valuationDate: parsed.valuationDate,
    customerNumber: parsed.customerNumber,
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
    contractCount: parsed.contracts.length,
    fileName,
    filePath,
    fileHash,
    semanticHash,
    importId,
    rawText: parsed.rawText,
    importedAt: now,
    updatedAt: now,
  });

  const facts = buildVbvAccountInformationFacts(parsed, {
    documentId,
    importId,
    fileHash,
    semanticHash,
    importedAt: now,
  });
  for (const fact of facts) {
    const { id, ...data } = fact;
    await firestore.setDocument("sourceDocumentFacts", id, {
      ...data,
      updatedAt: now,
    });
  }
}

async function readCurrentChromeText() {
  const script = `
tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "meinevbv.at" then
        return execute t javascript "document.body ? document.body.innerText : ''"
      end if
    end repeat
  end repeat
end tell
return ""
`;
  const { stdout } = await execFileAsync("osascript", ["-e", script], { maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

async function readManualValue() {
  const value = readArg("--value");
  const valuationDate = readArg("--valuation-date");
  if (!value || !valuationDate) return null;
  const currentValue = Number.parseFloat(value.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(currentValue)) throw new Error("--value konnte nicht als Zahl gelesen werden.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valuationDate)) {
    throw new Error("--valuation-date muss im Format YYYY-MM-DD uebergeben werden.");
  }
  return {
    source: "vbv",
    displayName: "VBV Vorsorgekasse",
    currentValue: roundCurrency(currentValue),
    netValue: roundCurrency(currentValue),
    valuationDate,
    valuationMethod: "manual_quarterly_balance_v1",
    positionCount: 0,
    status: "VERIFIED",
  };
}

async function loadBalance() {
  const manual = await readManualValue();
  if (manual) return manual;

  if (process.argv.includes("--from-current-chrome")) {
    return parseVbvBalanceText(await readCurrentChromeText());
  }

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { context, page } = await launchVbvBrowser({ headless: process.env.VBV_HEADLESS === "1" });
    try {
      await ensureVbvLogin(page);
      return await readVbvBalance(page);
    } catch (error) {
      lastError = error;
    } finally {
      await context.close().catch(() => {});
    }
  }
  throw lastError;
}

async function writeAgentFailure(error) {
  if (!writeEnabled) return;
  try {
    const now = new Date();
    const firestore = new FirestoreRest({
      projectId,
      accessToken: await getFirebaseCliAccessToken(),
    });
    const previous =
      (await firestore.listDocuments("agentStatus")).find((entry) => entry.id === "vbv") ?? {};
    await firestore.setDocument("agentStatus", "vbv", {
      ...previous,
      source: "vbv",
      status: "FEHLER",
      message: error?.message ?? String(error),
      lastAgentRunAt: now,
      lastErrorAt: new Date(),
      updatedAt: now,
    });
  } catch {
    // Preserve the original browser/login failure.
  }
}

async function main() {
  const balance = await loadBalance();
  const now = new Date();
  const dryRunSummary = {
    mode: writeEnabled ? "write" : "dry-run",
    source: "vbv",
    currentValue: roundCurrency(balance.currentValue),
    valuationDate: balance.valuationDate,
    valuationMethod: balance.valuationMethod,
  };

  if (!writeEnabled) {
    console.log(JSON.stringify(dryRunSummary, null, 2));
    console.log("[dry-run] Keine Firestore-Daten geaendert. Fuer Schreiben --write verwenden.");
    return;
  }

  const firestore = new FirestoreRest({
    projectId,
    accessToken: await getFirebaseCliAccessToken(),
  });
  const previousSummary =
    (await firestore.listDocuments("sourceSummaries")).find((summary) => summary.id === "vbv") ?? {};
  const accountInformation = await maybeLoadAccountInformation(balance, previousSummary, { importedAt: now });
  await writeAccountInformation(firestore, accountInformation, now);
  const parsedAccountInformation = accountInformation?.parsed ?? previousSummary.accountInformation ?? null;
  const accountInformationMatchesBalance =
    parsedAccountInformation?.valuationDate === balance.valuationDate &&
    typeof parsedAccountInformation?.totalValue === "number";
  const effectiveValue = accountInformationMatchesBalance
    ? roundCurrency(parsedAccountInformation.totalValue)
    : roundCurrency(balance.currentValue);
  const effectiveValuationDate = accountInformationMatchesBalance
    ? parsedAccountInformation.valuationDate
    : balance.valuationDate;
  const effectiveValuationMethod = accountInformationMatchesBalance
    ? "vbv_account_information_pdf_v1"
    : balance.valuationMethod;
  const effectiveAccountInformation = parsedAccountInformation
    ? compactAccountInformation(parsedAccountInformation)
    : previousSummary.accountInformation ?? null;
  const dataChanged =
    roundCurrency(previousSummary.currentValue) !== effectiveValue ||
    previousSummary.valuationDate !== effectiveValuationDate ||
    (accountInformation?.semanticHash ? previousSummary.documentSemanticHash !== accountInformation.semanticHash : false);
  const sourceDataProvider = accountInformationMatchesBalance ? "vbv_account_information_pdf" : vbvDataProviderFor(balance);
  const lastDataChangeAt = dataChanged ? now : previousSummary.lastDataChangeAt ?? previousSummary.updatedAt ?? now;

  await firestore.setDocument("sourceSummaries", "vbv", {
    ...previousSummary,
    source: "vbv",
    displayName: "VBV Vorsorgekasse",
    currentValue: effectiveValue,
    netValue: effectiveValue,
    costValue: effectiveAccountInformation?.costValue ?? previousSummary.costValue ?? null,
    performanceValue: effectiveAccountInformation?.performanceValue ?? previousSummary.performanceValue ?? null,
    performancePct: effectiveAccountInformation?.performancePct ?? previousSummary.performancePct ?? null,
    valuationDate: effectiveValuationDate,
    valuationMethod: effectiveValuationMethod,
    sourceDataUpdatedAt: effectiveValuationDate,
    sourceDataProvider,
    documentDataUpdatedAt: effectiveAccountInformation?.valuationDate ?? previousSummary.documentDataUpdatedAt ?? null,
    documentDataProvider: effectiveAccountInformation ? "vbv_account_information_pdf" : previousSummary.documentDataProvider ?? null,
    documentFileHash: accountInformation?.fileHash ?? previousSummary.documentFileHash ?? null,
    documentSemanticHash: accountInformation?.semanticHash ?? previousSummary.documentSemanticHash ?? null,
    sourceDocumentId: accountInformation?.documentId ?? previousSummary.sourceDocumentId ?? null,
    accountInformation: effectiveAccountInformation,
    lastDocumentImportAt: accountInformation ? now : previousSummary.lastDocumentImportAt ?? null,
    lastAgentRunAt: now,
    lastAgentSuccessAt: now,
    lastDataChangeAt,
    positionCount: 0,
    status: "VERIFIED",
    updatedAt: now,
  });

  await firestore.setDocument("agentStatus", "vbv", {
    source: "vbv",
    status: "OK",
    message: `VBV Vorsorgekasse ${effectiveValue.toFixed(2)} EUR per ${effectiveValuationDate}${
      accountInformation ? "; Kontoinformation importiert" : effectiveAccountInformation ? "; Kontoinformation vorhanden" : ""
    }`,
    lastAgentRunAt: now,
    lastAgentSuccessAt: now,
    lastSuccessAt: now,
    currentValue: effectiveValue,
    valuationDate: effectiveValuationDate,
    sourceDataUpdatedAt: effectiveValuationDate,
    sourceDataProvider,
    documentDataUpdatedAt: effectiveAccountInformation?.valuationDate ?? null,
    documentDataProvider: effectiveAccountInformation ? "vbv_account_information_pdf" : null,
    sourceDocumentId: accountInformation?.documentId ?? previousSummary.sourceDocumentId ?? null,
    accountInformationImported: Boolean(accountInformation),
    dataChanged,
    lastDataChangeAt,
    updatedAt: now,
  });

  console.log(
    JSON.stringify(
      {
        ...dryRunSummary,
        effectiveValue,
        effectiveValuationDate,
        accountInformationImported: Boolean(accountInformation),
        written: true,
      },
      null,
      2,
    ),
  );
  console.log(`[ok] VBV-Wert geschrieben: ${effectiveValue.toFixed(2)} EUR per ${effectiveValuationDate}`);
}

try {
  await main();
} catch (error) {
  await writeAgentFailure(error);
  throw error;
}
