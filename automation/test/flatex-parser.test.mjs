import assert from "node:assert/strict";
import test from "node:test";
import { buildPositionMap, parseFlatexCsv } from "../src/flatex-parser.mjs";

test("parses Flatex depot turnover including Nominal and adjacent currency", () => {
  const csv = [
    "Buchungstag;Valuta;Bezeichnung;ISIN;Nominal (Stk.);;Betrag;;Kurs;;Devisenkurs;TA.-Nr.;Buchungsinformation",
    "02.04.2026;01.04.2026;VANGUARD FTSE ALL-WLD UCITS ETF;IE00B3RBWM25;-0,172998;Stück;-22,17;EUR;128,17;EUR;1,000;4882611047;Erträgnisausschüttung IE00B3RBWM25",
  ].join("\n");

  const parsed = parseFlatexCsv(Buffer.from(csv, "latin1"));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].date, "2026-04-02");
  assert.equal(parsed.rows[0].label, "VANGUARD FTSE ALL-WLD UCITS ETF");
  assert.equal(parsed.rows[0].bookingText, "Erträgnisausschüttung IE00B3RBWM25");
  assert.equal(parsed.rows[0].transactionId, "4882611047");
  assert.equal(parsed.rows[0].quantity, -0.172998);
  assert.equal(parsed.rows[0].amount, -22.17);
  assert.equal(parsed.rows[0].currency, "EUR");
});

test("builds net Flatex positions across multiple exports", () => {
  const rows = [
    { isin: "IE00TEST", label: "Test ETF", bookingText: "Kauf", quantity: 2, currency: "EUR" },
    { isin: "IE00TEST", label: "Test ETF", bookingText: "Kauf", quantity: 1.5, currency: "EUR" },
    { isin: "IE00TEST", label: "Test ETF", bookingText: "Verkauf", quantity: -1, currency: "EUR" },
  ];

  assert.deepEqual(buildPositionMap(rows), [
    {
      key: "IE00TEST",
      isin: "IE00TEST",
      label: "Test ETF",
      quantity: 2.5,
      currency: "EUR",
    },
  ]);
});
