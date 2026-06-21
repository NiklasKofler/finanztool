import test from "node:test";
import assert from "node:assert/strict";
import { applyCostBasisOverrides } from "../src/cost-basis-overrides.mjs";

test("prorates cost basis when current holding is a residual position", () => {
  const [position] = applyCostBasisOverrides(
    [
      {
        id: "bitget_spot_TRUMP",
        quantity: 0.00977,
        currentValue: 0.02,
      },
    ],
    [
      {
        positionId: "bitget_spot_TRUMP",
        quantityBasis: 20.20977,
        costValueQuote: 990.80114,
        costCurrency: "USDT",
      },
    ],
  );

  assert.equal(position.costBasisProrated, true);
  assert.equal(position.costValueQuote, 0.48);
  assert.equal(position.costValue, null);
  assert.equal(position.performanceValue, null);
});

test("keeps full user confirmed cost when current holding is above basis quantity", () => {
  const [position] = applyCostBasisOverrides(
    [
      {
        id: "bitget_earn_BTC",
        quantity: 0.06882554,
        currentValue: 3835.51,
      },
    ],
    [
      {
        positionId: "bitget_earn_BTC",
        quantityBasis: 0.066856,
        costValueEur: 3000,
        costCurrency: "EUR",
      },
    ],
  );

  assert.equal(position.costBasisProrated, false);
  assert.equal(position.costValue, 3000);
  assert.equal(position.performanceValue, 835.51);
});
