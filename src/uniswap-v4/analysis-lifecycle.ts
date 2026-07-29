import { Web3AgentError } from "../api/errors.js";
import type { UniswapV4PoolState, UniswapV4PositionState } from "../api/types.js";
import {
  assertCurrentState,
  parseLiquidity,
  parseOperation,
  parsePool,
  parsePosition,
  positionAmounts,
} from "./analysis-helpers.js";
import { estimateUncollectedFees } from "./state.js";

export type LifecycleDeltas = {
  readonly kind: "mint" | "increase" | "decrease" | "collect" | "burn";
  readonly liquidityDelta: string;
  readonly nativeValueDelta: string;
  readonly positionAmount0After: string;
  readonly positionAmount0Before: string;
  readonly positionAmount1After: string;
  readonly positionAmount1Before: string;
  readonly positionLiquidityAfter: string;
  readonly positionLiquidityBefore: string;
  readonly rounding: "floor";
  readonly token0Delta: string;
  readonly token0Max: string;
  readonly token0Min: string;
  readonly token1Delta: string;
  readonly token1Max: string;
  readonly token1Min: string;
};

type DeltaFacts = {
  readonly amount0After: bigint;
  readonly amount0Before: bigint;
  readonly amount1After: bigint;
  readonly amount1Before: bigint;
  readonly liquidityAfter: bigint;
  readonly liquidityBefore: bigint;
  readonly liquidityDelta: bigint;
  readonly token0Delta: bigint;
  readonly token0Max: bigint;
  readonly token0Min: bigint;
  readonly token1Delta: bigint;
  readonly token1Max: bigint;
  readonly token1Min: bigint;
};

type AmountLimits = {
  readonly amount0Max: bigint;
  readonly amount0Min: bigint;
  readonly amount1Max: bigint;
  readonly amount1Min: bigint;
};

function assertNever(value: never): never {
  throw new Web3AgentError({
    code: "UNISWAP_V4_ANALYSIS_OPERATION_INVALID",
    details: { value },
    message: "Unsupported Uniswap v4 lifecycle operation",
  });
}

function fees(position: UniswapV4PositionState): {
  readonly amount0: bigint;
  readonly amount1: bigint;
} {
  return {
    amount0: estimateUncollectedFees({
      cachedFeeGrowthInsideX128: BigInt(position.feeGrowthInside0LastX128),
      currentFeeGrowthInsideX128: BigInt(position.feeGrowthInside0X128),
      liquidity: BigInt(position.liquidity),
    }),
    amount1: estimateUncollectedFees({
      cachedFeeGrowthInsideX128: BigInt(position.feeGrowthInside1LastX128),
      currentFeeGrowthInsideX128: BigInt(position.feeGrowthInside1X128),
      liquidity: BigInt(position.liquidity),
    }),
  };
}

function result(
  kind: LifecycleDeltas["kind"],
  pool: UniswapV4PoolState,
  facts: DeltaFacts
): LifecycleDeltas {
  return {
    kind,
    liquidityDelta: facts.liquidityDelta.toString(),
    nativeValueDelta: (pool.pool.poolKey.currency0.kind === "native"
      ? facts.token0Delta
      : 0n
    ).toString(),
    positionAmount0After: facts.amount0After.toString(),
    positionAmount0Before: facts.amount0Before.toString(),
    positionAmount1After: facts.amount1After.toString(),
    positionAmount1Before: facts.amount1Before.toString(),
    positionLiquidityAfter: facts.liquidityAfter.toString(),
    positionLiquidityBefore: facts.liquidityBefore.toString(),
    rounding: "floor",
    token0Delta: facts.token0Delta.toString(),
    token0Max: facts.token0Max.toString(),
    token0Min: facts.token0Min.toString(),
    token1Delta: facts.token1Delta.toString(),
    token1Max: facts.token1Max.toString(),
    token1Min: facts.token1Min.toString(),
  };
}

function requirePosition(value: unknown, pool: UniswapV4PoolState): UniswapV4PositionState {
  if (value === undefined) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_ANALYSIS_POSITION_REQUIRED",
      message: "This lifecycle action requires a normalized position snapshot",
    });
  }
  const position = parsePosition(value);
  assertCurrentState(pool, position);
  return position;
}

function assertLimits(limits: AmountLimits): void {
  if (limits.amount0Min > limits.amount0Max || limits.amount1Min > limits.amount1Max) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_ANALYSIS_AMOUNT_LIMIT_INVALID",
      message: "Lifecycle amount limits exceed the normalized current-state estimate",
    });
  }
}

export function calculateLifecycleDeltas(input: {
  readonly operation: unknown;
  readonly pool: unknown;
  readonly position?: unknown;
}): LifecycleDeltas {
  const operation = parseOperation(input.operation);
  const pool = parsePool(input.pool);
  switch (operation.kind) {
    case "mint": {
      const addedLiquidity = parseLiquidity(operation.liquidity);
      const added = positionAmounts(pool, { ...operation, liquidity: addedLiquidity });
      const amount0Max = parseLiquidity(operation.amount0Max);
      const amount1Max = parseLiquidity(operation.amount1Max);
      assertLimits({
        amount0Max,
        amount0Min: added.amount0,
        amount1Max,
        amount1Min: added.amount1,
      });
      return result(operation.kind, pool, {
        amount0After: added.amount0,
        amount0Before: 0n,
        amount1After: added.amount1,
        amount1Before: 0n,
        liquidityAfter: addedLiquidity,
        liquidityBefore: 0n,
        liquidityDelta: addedLiquidity,
        token0Delta: -added.amount0,
        token0Max: -added.amount0,
        token0Min: -amount0Max,
        token1Delta: -added.amount1,
        token1Max: -added.amount1,
        token1Min: -amount1Max,
      });
    }
    case "increase": {
      const position = requirePosition(input.position, pool);
      const addedLiquidity = parseLiquidity(operation.liquidity);
      const added = positionAmounts(pool, { ...operation, liquidity: addedLiquidity });
      const before = positionAmounts(pool, { ...position, liquidity: BigInt(position.liquidity) });
      const amount0Max = parseLiquidity(operation.amount0Max);
      const amount1Max = parseLiquidity(operation.amount1Max);
      assertLimits({
        amount0Max,
        amount0Min: added.amount0,
        amount1Max,
        amount1Min: added.amount1,
      });
      return result(operation.kind, pool, {
        amount0After: before.amount0 + added.amount0,
        amount0Before: before.amount0,
        amount1After: before.amount1 + added.amount1,
        amount1Before: before.amount1,
        liquidityAfter: BigInt(position.liquidity) + addedLiquidity,
        liquidityBefore: BigInt(position.liquidity),
        liquidityDelta: addedLiquidity,
        token0Delta: -added.amount0,
        token0Max: -added.amount0,
        token0Min: -amount0Max,
        token1Delta: -added.amount1,
        token1Max: -added.amount1,
        token1Min: -amount1Max,
      });
    }
    case "decrease":
    case "burn": {
      const position = requirePosition(input.position, pool);
      const totalLiquidity = BigInt(position.liquidity);
      const removedLiquidity = (totalLiquidity * BigInt(operation.liquidityBps)) / 10_000n;
      const before = positionAmounts(pool, { ...position, liquidity: totalLiquidity });
      const removed = positionAmounts(pool, { ...position, liquidity: removedLiquidity });
      const after = positionAmounts(pool, {
        ...position,
        liquidity: totalLiquidity - removedLiquidity,
      });
      const feeEstimate = fees(position);
      const amount0Min = parseLiquidity(operation.amount0Min);
      const amount1Min = parseLiquidity(operation.amount1Min);
      const amount0Max = removed.amount0 + feeEstimate.amount0;
      const amount1Max = removed.amount1 + feeEstimate.amount1;
      assertLimits({ amount0Max, amount0Min, amount1Max, amount1Min });
      return result(operation.kind, pool, {
        amount0After: after.amount0,
        amount0Before: before.amount0,
        amount1After: after.amount1,
        amount1Before: before.amount1,
        liquidityAfter: totalLiquidity - removedLiquidity,
        liquidityBefore: totalLiquidity,
        liquidityDelta: -removedLiquidity,
        token0Delta: amount0Max,
        token0Max: amount0Max,
        token0Min: amount0Min,
        token1Delta: amount1Max,
        token1Max: amount1Max,
        token1Min: amount1Min,
      });
    }
    case "collect": {
      const position = requirePosition(input.position, pool);
      const before = positionAmounts(pool, { ...position, liquidity: BigInt(position.liquidity) });
      const feeEstimate = fees(position);
      return result(operation.kind, pool, {
        amount0After: before.amount0,
        amount0Before: before.amount0,
        amount1After: before.amount1,
        amount1Before: before.amount1,
        liquidityAfter: BigInt(position.liquidity),
        liquidityBefore: BigInt(position.liquidity),
        liquidityDelta: 0n,
        token0Delta: feeEstimate.amount0,
        token0Max: feeEstimate.amount0,
        token0Min: 0n,
        token1Delta: feeEstimate.amount1,
        token1Max: feeEstimate.amount1,
        token1Min: 0n,
      });
    }
    default:
      return assertNever(operation);
  }
}
