import { describe, expect, it } from "vitest";

import { createFixtureReader, poolKey, sourceBlock } from "./state-fixtures.js";

describe("Uniswap v4 position fee state", () => {
  it("Given StateView current and cached fee growth, when read, then exposes distinct facts and derived fee estimates", async () => {
    const snapshot = await createFixtureReader().readPositionSnapshot({
      poolKey,
      sourceBlock,
      tokenId: "42",
    });

    expect(snapshot).toMatchObject({
      feeGrowthInside0X128: (3n << 128n).toString(),
      feeGrowthInside1X128: (4n << 128n).toString(),
      feeGrowthInside0LastX128: (1n << 128n).toString(),
      feeGrowthInside1LastX128: (2n << 128n).toString(),
      tokensOwedAvailability: "not-exposed-by-uniswap-v4-core",
      uncollectedFees0: "154",
      uncollectedFees1: "154",
    });
  });

  it("Given PositionManager and StateView report different liquidity, when read, then uses the core position liquidity for snapshots and estimates", async () => {
    const coreLiquidity = 1n << 128n;
    const snapshot = await createFixtureReader({
      liquidity: coreLiquidity,
      positionManagerLiquidity: 1n,
    }).readPositionSnapshot({
      poolKey,
      sourceBlock,
      tokenId: "42",
    });

    expect(snapshot.liquidity).toBe(coreLiquidity.toString());
    expect(snapshot.uncollectedFees0).toBe((2n << 128n).toString());
  });

  it("Given fee growth wraps a uint256 boundary, when estimated, then uses unchecked modular subtraction and floor division", async () => {
    const snapshot = await createFixtureReader({
      cachedFeeGrowthInside0X128: (1n << 256n) - 1n,
      currentFeeGrowthInside0X128: 1n,
      liquidity: 1n << 128n,
    }).readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });

    expect(snapshot.uncollectedFees0).toBe("2");
  });
});
