import { describe, expect, it } from "vitest";
import {
  uniswapV4CalculationInputSchema,
  uniswapV4CalculationResultSchema,
} from "../../src/api/schemas.js";
import { createFixtureReader, poolKey, sourceBlock } from "../uniswap-v4/state-fixtures.js";

describe("Uniswap v4 public calculation schemas", () => {
  it("parses every exact calculation input and result variant", async () => {
    // Given: coherent pool and position snapshots for every implemented calculation family
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });
    const mint = {
      account: "0x3333333333333333333333333333333333333333",
      amount0Max: "100",
      amount1Max: "100",
      chainId: 4663,
      createPool: false,
      deadline: "4102444800",
      hookData: "0x",
      kind: "mint" as const,
      liquidity: "1",
      poolKey,
      slippageBps: 0,
      sourceBlock,
      tickLower: -120,
      tickUpper: 120,
    };

    // When: all six public input and output variants cross the Zod boundary
    const inputs = [
      { kind: "tickToPrice", poolKey, tick: 0 },
      {
        kind: "priceToTick",
        poolKey,
        price: { denominator: "1", numerator: "1", rounding: "exact" },
      },
      { kind: "liquidityAmounts", liquidity: "1", pool, tickLower: -120, tickUpper: 120 },
      { kind: "feeEstimate", position },
      {
        kind: "quotePriceImpact",
        quoteKind: "exactInput",
        quotedInputAmount: "100",
        quotedOutputAmount: "90",
        referenceInputAmount: "100",
        referenceOutputAmount: "100",
      },
      { kind: "expectedDeltas", operation: mint, pool },
    ];
    const results = [
      {
        kind: "tickToPrice",
        orientation: { base: "currency0", baseDecimals: 18, quote: "currency1", quoteDecimals: 18 },
        poolKey,
        price: { denominator: "1", numerator: "1", rounding: "exact" },
        tick: 0,
      },
      {
        kind: "priceToTick",
        poolKey,
        price: { denominator: "1", numerator: "1", rounding: "exact" },
        rounding: "floor",
        tick: 0,
      },
      { amount0: "1", amount1: "1", kind: "liquidityAmounts", liquidity: "1", rounding: "floor" },
      { amount0: "1", amount1: "1", kind: "feeEstimate", rounding: "floor" },
      {
        kind: "quotePriceImpact",
        priceImpactBps: { denominator: "1", numerator: "1000", rounding: "exact" },
        quoteKind: "exactInput",
      },
      {
        deltas: {
          kind: "mint",
          liquidityDelta: "1",
          nativeValueDelta: "-1",
          positionAmount0After: "1",
          positionAmount0Before: "0",
          positionAmount1After: "1",
          positionAmount1Before: "0",
          positionLiquidityAfter: "1",
          positionLiquidityBefore: "0",
          rounding: "floor",
          token0Delta: "-1",
          token0Max: "-1",
          token0Min: "-1",
          token1Delta: "-1",
          token1Max: "-1",
          token1Min: "-1",
        },
        kind: "expectedDeltas",
      },
    ];

    // Then: no declared calculation family is unreachable or lossy
    expect(inputs.map((input) => uniswapV4CalculationInputSchema.safeParse(input).success)).toEqual(
      Array(6).fill(true)
    );
    expect(
      results.map((result) => uniswapV4CalculationResultSchema.safeParse(result).success)
    ).toEqual(Array(6).fill(true));
  });
});
