import "dotenv/config";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";

function parseMaybeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isCashLike(position) {
  const text = `${position.name ?? ""} ${position.label ?? ""} ${position.category ?? ""}`.toLowerCase();
  return (
    position.accountValueIncluded === false ||
    text.includes("cash") ||
    text.includes("geldkonto") ||
    text.includes("kontostand") ||
    /^(eur|usdt)$/.test(String(position.name ?? position.label ?? "").trim().toLowerCase())
  );
}

function costStatus(position) {
  if (isCashLike(position)) return "CASH_OR_EXCLUDED";
  if (parseMaybeNumber(position.costValue) !== null) return "OK_EUR";
  if (parseMaybeNumber(position.costValueQuote) !== null) return "QUOTE_ONLY";
  return "MISSING";
}

const firestore = new FirestoreRest({
  projectId,
  accessToken: await getFirebaseCliAccessToken(),
});

const positions = await firestore.listDocuments("sourcePositions");
const audited = positions
  .filter((position) => ["flatex", "traderepublic", "ginmon", "bitget", "intergold"].includes(position.source))
  .map((position) => ({
    id: position.id,
    source: position.source,
    name: position.name ?? position.label ?? position.id,
    isin: position.isin ?? null,
    quantity: parseMaybeNumber(position.quantity),
    currentValue: parseMaybeNumber(position.currentValue),
    costValue: parseMaybeNumber(position.costValue),
    costValueQuote: parseMaybeNumber(position.costValueQuote),
    costCurrency: position.costCurrency ?? null,
    quoteStatus: position.quoteStatus ?? null,
    status: costStatus(position),
  }));

const summary = audited.reduce((counts, row) => {
  counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}, {});

const problems = audited.filter((row) => row.status === "MISSING");
const quoteOnly = audited.filter((row) => row.status === "QUOTE_ONLY");

console.log(
  JSON.stringify(
    {
      positionCount: audited.length,
      summary,
      missingCount: problems.length,
      quoteOnlyCount: quoteOnly.length,
      quoteOnly,
      missing: problems,
    },
    null,
    2,
  ),
);

if (problems.length) {
  process.exitCode = 1;
}
