import { Web3AgentError } from "../api/errors.js";
import { UNISWAP_V4_MAX_TICK } from "../api/schemas/uniswap-v4/primitives.js";
import {
  assertCurrentState,
  parsePool,
  parsePoolKey,
  parsePosition,
  positionAmounts,
} from "./analysis-helpers.js";
import { type LifecycleDeltas, calculateLifecycleDeltas } from "./analysis-lifecycle.js";
import {
  type ExactRational,
  exactRational,
  parseAmount,
  parseExactRational,
  powerOfTen,
} from "./analysis-rational.js";
import { getLiquidityForAmounts, getPriceTick, getTickPrice } from "./sdk-adapter-api.js";
import { estimateUncollectedFees } from "./state.js";

export type { ExactRational, LifecycleDeltas };
export { calculateLifecycleDeltas };

type TickPrice = {
  readonly orientation: {
    readonly base: "currency0";
    readonly baseDecimals: number;
    readonly quote: "currency1";
    readonly quoteDecimals: number;
  };
  readonly price: ExactRational;
  readonly tick: number;
};

function assertTick(tick: number): void {
  if (!Number.isInteger(tick) || tick < -UNISWAP_V4_MAX_TICK || tick > UNISWAP_V4_MAX_TICK) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_ANALYSIS_TICK_INVALID",
      message: "Tick must be an integer between the Uniswap v4 minimum and maximum ticks",
    });
  }
}

function alignDown(tick: number, spacing: number): number {
  const remainder = tick % spacing;
  return remainder < 0 ? tick - spacing - remainder : tick - remainder;
}

function parseTickSpacing(tickSpacing: number): number {
  if (!Number.isInteger(tickSpacing) || tickSpacing < 1 || tickSpacing > 32767) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_ANALYSIS_TICK_SPACING_INVALID",
      message: "Tick spacing must be a positive signed-int24 value",
    });
  }
  return tickSpacing;
}

export function calculateTickPrice(input: {
  readonly poolKey: unknown;
  readonly tick: number;
}): TickPrice {
  const poolKey = parsePoolKey(input.poolKey);
  assertTick(input.tick);
  const raw = getTickPrice({ poolKey, tick: input.tick });
  return {
    orientation: {
      base: "currency0",
      baseDecimals: poolKey.currency0.decimals,
      quote: "currency1",
      quoteDecimals: poolKey.currency1.decimals,
    },
    price: exactRational(
      raw.numerator * powerOfTen(poolKey.currency0.decimals),
      raw.denominator * powerOfTen(poolKey.currency1.decimals)
    ),
    tick: input.tick,
  };
}

export function calculatePriceTick(input: {
  readonly poolKey: unknown;
  readonly price: ExactRational;
}): { readonly rounding: "floor"; readonly tick: number } {
  const poolKey = parsePoolKey(input.poolKey);
  const price = parseExactRational(input.price);
  if (price.numerator <= 0n) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_ANALYSIS_PRICE_INVALID",
      message: "Price numerator must be positive",
    });
  }
  return {
    rounding: "floor",
    tick: getPriceTick({
      poolKey,
      price: {
        denominator: price.denominator * powerOfTen(poolKey.currency0.decimals),
        numerator: price.numerator * powerOfTen(poolKey.currency1.decimals),
      },
    }),
  };
}

export function snapPositionTicks(input: {
  readonly tickLower: number;
  readonly tickSpacing: number;
  readonly tickUpper: number;
}): {
  readonly rounding: { readonly tickLower: "down"; readonly tickUpper: "up" };
  readonly tickLower: number;
  readonly tickUpper: number;
} {
  const spacing = parseTickSpacing(input.tickSpacing);
  if (
    !Number.isInteger(input.tickLower) ||
    !Number.isInteger(input.tickUpper) ||
    input.tickLower >= input.tickUpper
  ) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_ANALYSIS_TICK_RANGE_INVALID",
      message: "Tick range must contain ordered integer endpoints",
    });
  }
  const tickLower = alignDown(input.tickLower, spacing);
  const tickUpper = -alignDown(-input.tickUpper, spacing);
  if (
    tickLower < -UNISWAP_V4_MAX_TICK ||
    tickUpper > UNISWAP_V4_MAX_TICK ||
    tickLower >= tickUpper
  ) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_ANALYSIS_TICK_RANGE_INVALID",
      message: "Snapped tick range must remain inside the valid Uniswap v4 tick bounds",
    });
  }
  return { rounding: { tickLower: "down", tickUpper: "up" }, tickLower, tickUpper };
}

export function calculateLiquidityAmounts(input: {
  readonly liquidity: string;
  readonly pool: unknown;
  readonly tickLower: number;
  readonly tickUpper: number;
}): { readonly amount0: string; readonly amount1: string; readonly rounding: "floor" } {
  const pool = parsePool(input.pool);
  const amounts = positionAmounts(pool, {
    liquidity: parseAmount(input.liquidity, "liquidity"),
    tickLower: input.tickLower,
    tickUpper: input.tickUpper,
  });
  return {
    amount0: amounts.amount0.toString(),
    amount1: amounts.amount1.toString(),
    rounding: "floor",
  };
}

export function calculateLiquidityFromAmounts(input: {
  readonly amount0: string;
  readonly amount1: string;
  readonly pool: unknown;
  readonly tickLower: number;
  readonly tickUpper: number;
}): {
  readonly amount0: string;
  readonly amount1: string;
  readonly liquidity: string;
  readonly rounding: "floor";
} {
  const pool = parsePool(input.pool);
  const amount0 = parseAmount(input.amount0, "amount0");
  const amount1 = parseAmount(input.amount1, "amount1");
  if (amount0 === 0n && amount1 === 0n) {
    return { amount0: "0", amount1: "0", liquidity: "0", rounding: "floor" };
  }
  const derived = getLiquidityForAmounts({
    amount0,
    amount1,
    liquidity: BigInt(pool.liquidity),
    poolKey: pool.pool.poolKey,
    sqrtPriceX96: BigInt(pool.sqrtPriceX96),
    tickCurrent: pool.tick,
    tickLower: input.tickLower,
    tickUpper: input.tickUpper,
  });
  return {
    amount0: derived.amount0.toString(),
    amount1: derived.amount1.toString(),
    liquidity: derived.liquidity.toString(),
    rounding: "floor",
  };
}

export function calculateCurrentPositionAmounts(input: {
  readonly pool: unknown;
  readonly position: unknown;
}): { readonly amount0: string; readonly amount1: string; readonly rounding: "floor" } {
  const pool = parsePool(input.pool);
  const position = parsePosition(input.position);
  assertCurrentState(pool, position);
  const amounts = positionAmounts(pool, { ...position, liquidity: BigInt(position.liquidity) });
  return {
    amount0: amounts.amount0.toString(),
    amount1: amounts.amount1.toString(),
    rounding: "floor",
  };
}

export function estimatePositionFees(input: {
  readonly position: unknown;
}): { readonly amount0: string; readonly amount1: string; readonly rounding: "floor" } {
  const position = parsePosition(input.position);
  return {
    amount0: estimateUncollectedFees({
      cachedFeeGrowthInsideX128: BigInt(position.feeGrowthInside0LastX128),
      currentFeeGrowthInsideX128: BigInt(position.feeGrowthInside0X128),
      liquidity: BigInt(position.liquidity),
    }).toString(),
    amount1: estimateUncollectedFees({
      cachedFeeGrowthInsideX128: BigInt(position.feeGrowthInside1LastX128),
      currentFeeGrowthInsideX128: BigInt(position.feeGrowthInside1X128),
      liquidity: BigInt(position.liquidity),
    }).toString(),
    rounding: "floor",
  };
}

export function calculateQuotePriceImpact(input: {
  readonly kind: "exactInput" | "exactOutput";
  readonly quotedInputAmount: string;
  readonly quotedOutputAmount: string;
  readonly referenceInputAmount: string;
  readonly referenceOutputAmount: string;
}): { readonly kind: "exactInput" | "exactOutput"; readonly priceImpactBps: ExactRational } {
  const quotedInput = parseAmount(input.quotedInputAmount, "quotedInputAmount");
  const quotedOutput = parseAmount(input.quotedOutputAmount, "quotedOutputAmount");
  const referenceInput = parseAmount(input.referenceInputAmount, "referenceInputAmount");
  const referenceOutput = parseAmount(input.referenceOutputAmount, "referenceOutputAmount");
  if (
    referenceInput === 0n ||
    referenceOutput === 0n ||
    quotedInput === 0n ||
    quotedOutput === 0n
  ) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_ANALYSIS_QUOTE_DENOMINATOR_ZERO",
      message: "Quote and reference amounts must be positive to calculate price impact",
    });
  }
  const compared = quotedInput * referenceOutput - quotedOutput * referenceInput;
  const denominator =
    input.kind === "exactInput" ? quotedInput * referenceOutput : quotedOutput * referenceInput;
  return { kind: input.kind, priceImpactBps: exactRational(compared * 10_000n, denominator) };
}
