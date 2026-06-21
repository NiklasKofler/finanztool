import test from "node:test";
import assert from "node:assert/strict";
import { fetchBitgetPortfolioSnapshot } from "../src/bitget-client.mjs";

test("keeps raw Bitget holdings but excludes clean-cut meme and dust positions from current portfolio", async () => {
  const snapshot = await fetchBitgetPortfolioSnapshot({
    getAccountInfo: async () => ({ userId: "test" }),
    getSpotAssets: async () => [
      { coin: "BTC", available: "0.0000000381", frozen: "0", locked: "0" },
      { coin: "EUR", available: "0.369", frozen: "0", locked: "0" },
      { coin: "TRUMP", available: "0.00977", frozen: "0", locked: "0" },
      { coin: "MELANIA", available: "66.20373", frozen: "0", locked: "0" },
    ],
    getSpotTickers: async () => [
      { symbol: "BTCEUR", lastPr: "55768.25" },
      { symbol: "TRUMPUSDT", lastPr: "1.789" },
      { symbol: "USDTEUR", lastPr: "0.8714" },
    ],
    getAllAccountBalance: async () => [{ accountType: "spot", usdtBalance: "4401.8629606912" }],
    getEarnAssets: async () => [{ coin: "BTC", amount: "0.06882554" }],
  });

  assert.deepEqual(
    snapshot.positions.map((position) => position.id),
    ["bitget_spot_EUR", "bitget_earn_BTC"],
  );
  assert.deepEqual(
    snapshot.excludedPositions.map((position) => position.id),
    ["bitget_spot_BTC", "bitget_spot_TRUMP", "bitget_spot_MELANIA"],
  );
  assert.equal(snapshot.rawPositions.length, 5);
  assert.equal(snapshot.unpricedPositionCount, 0);
});
