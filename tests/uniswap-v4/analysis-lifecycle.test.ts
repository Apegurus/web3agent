import { describe, expect, it } from "vitest";

import type { UniswapV4LifecycleOperation } from "../../src/api/types.js";
import { calculateLifecycleDeltas } from "../../src/uniswap-v4/analysis.js";
import { createFixtureReader, poolKey, sourceBlock } from "./state-fixtures.js";

const ACCOUNT: `0x${string}` = "0x5555555555555555555555555555555555555555";

function baseOperation() {
  return {
    account: ACCOUNT,
    chainId: 4663,
    deadline: "2000000000",
    hookData: "0x" as const,
    poolKey,
    slippageBps: 0,
    sourceBlock,
  };
}

describe("Uniswap v4 lifecycle delta analysis", () => {
  it("Given a fee-bearing position, when collecting fees, then reports the full estimated owed amounts", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });

    const result = calculateLifecycleDeltas({
      operation: {
        ...baseOperation(),
        kind: "collect",
        recipient: ACCOUNT,
        tokenId: "42",
      } satisfies UniswapV4LifecycleOperation,
      pool,
      position,
    });

    expect(result).toMatchObject({
      token0Delta: "154",
      token0Max: "154",
      token0Min: "0",
      token1Delta: "154",
      token1Max: "154",
      token1Min: "0",
    });
  });

  it("Given missing position fee growth, when collecting fees, then rejects instead of inventing an owed amount", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });

    try {
      calculateLifecycleDeltas({
        operation: {
          ...baseOperation(),
          kind: "collect",
          recipient: ACCOUNT,
          tokenId: "42",
        } satisfies UniswapV4LifecycleOperation,
        pool,
        position: { ...position, feeGrowthInside1X128: undefined },
      });
      throw new Error("Expected fee-growth validation to fail");
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: "UNISWAP_V4_ANALYSIS_POSITION_INVALID" });
    }
  });

  it("Given every lifecycle action at one normalized block, when calculating deltas, then returns expected position pre/post liquidity and signed token ranges", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });
    const cases = [
      {
        operation: {
          ...baseOperation(),
          amount0Max: "100",
          amount1Max: "100",
          createPool: false,
          kind: "mint",
          liquidity: "10",
          tickLower: -120,
          tickUpper: 120,
        } satisfies UniswapV4LifecycleOperation,
        before: "0",
        delta: "10",
        after: "10",
      },
      {
        operation: {
          ...baseOperation(),
          amount0Max: "100",
          amount1Max: "100",
          kind: "increase",
          liquidity: "10",
          tickLower: -120,
          tickUpper: 120,
          tokenId: "42",
        } satisfies UniswapV4LifecycleOperation,
        before: "77",
        delta: "10",
        after: "87",
      },
      {
        operation: {
          ...baseOperation(),
          amount0Min: "0",
          amount1Min: "0",
          kind: "decrease",
          liquidity: "77",
          liquidityBps: 2500,
          tokenId: "42",
        } satisfies UniswapV4LifecycleOperation,
        before: "77",
        delta: "-19",
        after: "58",
      },
      {
        operation: {
          ...baseOperation(),
          kind: "collect",
          recipient: ACCOUNT,
          tokenId: "42",
        } satisfies UniswapV4LifecycleOperation,
        before: "77",
        delta: "0",
        after: "77",
      },
      {
        operation: {
          ...baseOperation(),
          amount0Min: "0",
          amount1Min: "0",
          kind: "burn",
          liquidity: "77",
          liquidityBps: 10000,
          tokenId: "42",
        } satisfies UniswapV4LifecycleOperation,
        before: "77",
        delta: "-77",
        after: "0",
      },
    ] as const;

    for (const expected of cases) {
      const result = calculateLifecycleDeltas({
        operation: expected.operation,
        pool,
        position: expected.operation.kind === "mint" ? undefined : position,
      });

      expect(result).toMatchObject({
        kind: expected.operation.kind,
        liquidityDelta: expected.delta,
        positionLiquidityAfter: expected.after,
        positionLiquidityBefore: expected.before,
        rounding: "floor",
      });
      expect(result.token0Delta).toMatch(/^-?\d+$/);
      expect(result.token1Delta).toMatch(/^-?\d+$/);
      expect(result.token0Min).toMatch(/^-?\d+$/);
      expect(result.token1Max).toMatch(/^-?\d+$/);
    }
  });
});
