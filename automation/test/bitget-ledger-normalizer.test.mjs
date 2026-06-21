import test from "node:test";
import assert from "node:assert/strict";
import {
  costEventFromBitgetFill,
  incomeEventFromEarnRecord,
  normalizeBitgetBill,
  normalizeBitgetEarnRecord,
  normalizeBitgetFill,
} from "../src/bitget-ledger-normalizer.mjs";

test("normalizes Bitget financial bills as interest ledger entries", () => {
  const entry = normalizeBitgetBill(
    {
      billId: "1452336069526065152",
      bizOrderId: "1452334015368544261",
      coin: "BTC",
      groupType: "financial",
      businessType: "BATCH_INTEREST_USER_IN",
      size: "0.000000015400",
      balance: "0.00000003",
      fees: "0.00000000",
      cTime: "1781989821844",
    },
    { importId: "api_bitget_ledger_latest", now: new Date("2026-06-20T22:00:00Z") },
  );

  assert.equal(entry.id, "bitget_bill_1452336069526065152");
  assert.equal(entry.category, "interest");
  assert.equal(entry.coin, "BTC");
  assert.equal(entry.amount, 0.0000000154);
  assert.equal(entry.currency, "BTC");
});

test("normalizes Bitget fills and creates fee cost events", () => {
  const transaction = normalizeBitgetFill(
    {
      symbol: "TRUMPUSDT",
      orderId: "1452309187933933568",
      tradeId: "1452309295385014275",
      orderType: "limit",
      side: "sell",
      priceAvg: "1.797",
      size: "20.2",
      amount: "36.2994",
      feeDetail: { feeCoin: "USDT", totalFee: "-0.0362994" },
      tradeScope: "maker",
      cTime: "1781983439298",
    },
    { importId: "api_bitget_ledger_latest", now: new Date("2026-06-20T22:00:00Z") },
  );
  const fee = costEventFromBitgetFill(transaction, { now: new Date("2026-06-20T22:00:00Z") });

  assert.equal(transaction.id, "bitget_fill_1452309295385014275");
  assert.equal(transaction.side, "SELL");
  assert.equal(transaction.baseCoin, "TRUMP");
  assert.equal(transaction.quoteCoin, "USDT");
  assert.equal(transaction.fee, -0.0362994);
  assert.equal(fee.id, "bitget_fill_1452309295385014275_fee");
  assert.equal(fee.amountAbs, 0.0362994);
  assert.equal(fee.currency, "USDT");
});

test("normalizes Bitget earn interest records and creates income events", () => {
  const record = normalizeBitgetEarnRecord(
    {
      orderId: "1452293498211549198",
      coinName: "BTC",
      settleCoinName: "BTC",
      productType: "flexible",
      productLevel: "normal",
      amount: "0.0000003624",
      ts: "1781979672959",
      orderType: "pay_interest",
    },
    { importId: "api_bitget_ledger_latest", now: new Date("2026-06-20T22:00:00Z") },
  );
  const income = incomeEventFromEarnRecord(record, { now: new Date("2026-06-20T22:00:00Z") });

  assert.equal(record.id, "bitget_earn_1452293498211549198");
  assert.equal(record.category, "interest");
  assert.equal(record.amount, 0.0000003624);
  assert.equal(income.id, "bitget_income_1452293498211549198");
  assert.equal(income.type, "interest");
  assert.equal(income.currency, "BTC");
});
