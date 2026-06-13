import "dotenv/config";
import { getFirebaseCliAccessToken } from "./firebase-cli-access-token.mjs";
import { FirestoreRest } from "./firestore-rest.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "finanzperformance-tool";
const accessToken = await getFirebaseCliAccessToken();
const firestore = new FirestoreRest({ projectId, accessToken });
const now = new Date();

const overrides = [
  {
    id: "bitget_spot_TRUMP",
    source: "bitget",
    positionId: "bitget_spot_TRUMP",
    quantityBasis: 20.20977,
    costValueQuote: 990.80114,
    costCurrency: "USDT",
    status: "VERIFIED_QUOTE_ONLY",
    note: "Historischer Bitget-Export; EUR-Gegenwert der USDT-Finanzierung noch offen.",
  },
  {
    id: "bitget_spot_MELANIA",
    source: "bitget",
    positionId: "bitget_spot_MELANIA",
    quantityBasis: 66.20373,
    costValueQuote: 289.53119,
    costCurrency: "USDT",
    status: "VERIFIED_QUOTE_ONLY",
    note: "Historischer Bitget-Export; EUR-Gegenwert der USDT-Finanzierung noch offen.",
  },
  {
    id: "bitget_earn_BTC",
    source: "bitget",
    positionId: "bitget_earn_BTC",
    costValueEur: 3000,
    quantityBasis: 0.066856,
    costCurrency: "EUR",
    status: "USER_CONFIRMED",
    note: "Gesamter BTC-Einstand vom Nutzer mit 3.000 EUR bestaetigt.",
  },
  {
    id: "bitget_spot_BTC",
    source: "bitget",
    positionId: "bitget_spot_BTC",
    costValueEur: 0,
    quantityBasis: 0.0013922838,
    costCurrency: "EUR",
    status: "VERIFIED_ZERO_COST",
    note: "Spot-BTC stammt laut Export aus Earn-Zinsen.",
  },
];

for (const override of overrides) {
  await firestore.setDocument("sourceCostBasis", override.id, {
    ...override,
    updatedAt: now,
  });
}

console.log(`[ok] ${overrides.length} Bitget-Kostenbasis-Dokumente gespeichert.`);
