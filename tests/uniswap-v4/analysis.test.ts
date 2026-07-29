import { describe, expect, it } from "vitest";

import { Web3AgentError } from "../../src/api/errors.js";
import type { UniswapV4PoolKey } from "../../src/api/types.js";
import {
  calculateCurrentPositionAmounts,
  calculateLiquidityAmounts,
  calculateLiquidityFromAmounts,
  calculatePriceTick,
  calculateQuotePriceImpact,
  calculateTickPrice,
  estimatePositionFees,
  snapPositionTicks,
} from "../../src/uniswap-v4/analysis.js";
import { createFixtureReader, poolKey, sourceBlock } from "./state-fixtures.js";

const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const asymmetricPoolKey = {
  currency0: {
    address: DAI,
    chainId: 1,
    decimals: 18,
    kind: "erc20",
    name: "Dai Stablecoin",
    symbol: "DAI",
  },
  currency1: {
    address: USDC,
    chainId: 1,
    decimals: 6,
    kind: "erc20",
    name: "USD Coin",
    symbol: "USDC",
  },
  fee: 500,
  hooks: ZERO_ADDRESS,
  tickSpacing: 60,
} satisfies UniswapV4PoolKey;

function errorCode(action: () => void): string {
  try {
    action();
  } catch (error: unknown) {
    if (error instanceof Web3AgentError) {
      return error.code;
    }
    throw error;
  }
  throw new Error("Expected analysis calculation to fail");
}

describe("Uniswap v4 deterministic analysis", () => {
  it("Given asymmetric currency decimals, when converting ticks and prices, then preserves currency0-to-currency1 orientation exactly", () => {
    const price = calculateTickPrice({ poolKey: asymmetricPoolKey, tick: 0 });

    expect(price).toEqual({
      orientation: {
        base: "currency0",
        baseDecimals: 18,
        quote: "currency1",
        quoteDecimals: 6,
      },
      price: { denominator: "1", numerator: "1000000000000", rounding: "exact" },
      tick: 0,
    });
    expect(calculatePriceTick({ poolKey: asymmetricPoolKey, price: price.price })).toEqual({
      rounding: "floor",
      tick: 0,
    });
  });

  it("Given minimum, maximum, and negative ticks, when converted, then returns only exact rational facts", () => {
    for (const tick of [-887272, -120, 0, 120, 887272]) {
      const price = calculateTickPrice({ poolKey: asymmetricPoolKey, tick });

      expect(BigInt(price.price.numerator)).toBeGreaterThan(0n);
      expect(BigInt(price.price.denominator)).toBeGreaterThan(0n);
      expect(price.price.rounding).toBe("exact");
    }
  });

  it("Given an unsnapped negative tick range, when normalized, then rounds lower down and upper up without changing direction", () => {
    expect(snapPositionTicks({ tickLower: -119, tickSpacing: 60, tickUpper: 119 })).toEqual({
      rounding: { tickLower: "down", tickUpper: "up" },
      tickLower: -120,
      tickUpper: 120,
    });
  });

  it("Given normalized in-range, out-of-range, and zero-liquidity positions, when calculating amounts, then stays bigint-string exact", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const inRange = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });
    const outOfRange = await createFixtureReader({
      tickLower: 120,
      tickUpper: 240,
    }).readPositionSnapshot({
      poolKey,
      sourceBlock,
      tokenId: "42",
    });
    const empty = await createFixtureReader({ liquidity: 0n }).readPositionSnapshot({
      poolKey,
      sourceBlock,
      tokenId: "42",
    });

    expect(calculateCurrentPositionAmounts({ pool, position: inRange })).toMatchObject({
      amount0: inRange.amount0,
      amount1: inRange.amount1,
      rounding: "floor",
    });
    expect(calculateCurrentPositionAmounts({ pool, position: outOfRange })).toMatchObject({
      amount0: outOfRange.amount0,
      amount1: outOfRange.amount1,
    });
    expect(calculateCurrentPositionAmounts({ pool, position: empty })).toMatchObject({
      amount0: "0",
      amount1: "0",
    });
  });

  it("Given exact position amounts, when deriving liquidity and amounts, then delegates floor rounding to the pinned SDK", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });
    const amounts = calculateLiquidityAmounts({
      liquidity: position.liquidity,
      pool,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
    });
    const derived = calculateLiquidityFromAmounts({
      amount0: amounts.amount0,
      amount1: amounts.amount1,
      pool,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
    });

    expect(amounts).toMatchObject({ amount0: position.amount0, amount1: position.amount1 });
    expect(BigInt(derived.liquidity)).toBeLessThanOrEqual(BigInt(position.liquidity));
    expect(derived.rounding).toBe("floor");
  });

  it("Given current and wrapped fee growth, when estimating fees, then reuses canonical modular subtraction", async () => {
    const position = await createFixtureReader().readPositionSnapshot({
      poolKey,
      sourceBlock,
      tokenId: "42",
    });
    const wrapped = await createFixtureReader({
      cachedFeeGrowthInside0X128: (1n << 256n) - 1n,
      currentFeeGrowthInside0X128: 1n,
      liquidity: 1n << 128n,
    }).readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });

    expect(estimatePositionFees({ position })).toEqual({
      amount0: "154",
      amount1: "154",
      rounding: "floor",
    });
    expect(estimatePositionFees({ position: wrapped }).amount0).toBe("2");
  });

  it("Given exact-input and exact-output quotes, when calculating impact, then returns reduced exact bps fractions", () => {
    expect(
      calculateQuotePriceImpact({
        kind: "exactInput",
        quotedInputAmount: "100",
        quotedOutputAmount: "90",
        referenceInputAmount: "100",
        referenceOutputAmount: "100",
      })
    ).toEqual({
      kind: "exactInput",
      priceImpactBps: { denominator: "1", numerator: "1000", rounding: "exact" },
    });
    expect(
      calculateQuotePriceImpact({
        kind: "exactOutput",
        quotedInputAmount: "110",
        quotedOutputAmount: "100",
        referenceInputAmount: "100",
        referenceOutputAmount: "100",
      })
    ).toEqual({
      kind: "exactOutput",
      priceImpactBps: { denominator: "1", numerator: "1000", rounding: "exact" },
    });
  });

  it("Given malformed, stale, and zero-denominator analysis facts, when calculated, then returns typed errors instead of floats", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });
    const reversed = {
      ...asymmetricPoolKey,
      currency0: asymmetricPoolKey.currency1,
      currency1: asymmetricPoolKey.currency0,
    } satisfies UniswapV4PoolKey;

    expect(errorCode(() => calculateTickPrice({ poolKey: reversed, tick: 0 }))).toBe(
      "UNISWAP_V4_ANALYSIS_INPUT_INVALID"
    );
    expect(
      errorCode(() => snapPositionTicks({ tickLower: -1, tickSpacing: 0, tickUpper: 1 }))
    ).toBe("UNISWAP_V4_ANALYSIS_TICK_SPACING_INVALID");
    expect(
      errorCode(() =>
        calculateQuotePriceImpact({
          kind: "exactInput",
          quotedInputAmount: "1",
          quotedOutputAmount: "1",
          referenceInputAmount: "0",
          referenceOutputAmount: "1",
        })
      )
    ).toBe("UNISWAP_V4_ANALYSIS_QUOTE_DENOMINATOR_ZERO");
    expect(
      errorCode(() =>
        calculateCurrentPositionAmounts({
          pool: { ...pool, sourceBlock: { ...pool.sourceBlock, blockNumber: "1" } },
          position,
        })
      )
    ).toBe("UNISWAP_V4_ANALYSIS_STALE_STATE");
    expect(
      errorCode(() =>
        estimatePositionFees({ position: { ...position, feeGrowthInside0X128: undefined } })
      )
    ).toBe("UNISWAP_V4_ANALYSIS_POSITION_INVALID");
  });
});
