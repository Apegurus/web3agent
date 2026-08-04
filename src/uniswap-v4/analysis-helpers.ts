import { ZodError } from "zod";

import { Web3AgentError } from "../api/errors.js";
import {
  decimalIntegerSchema,
  uniswapV4LifecycleOperationSchema,
  uniswapV4PoolKeySchema,
  uniswapV4PoolStateSchema,
  uniswapV4PositionStateSchema,
} from "../api/schemas/uniswap-v4.js";
import type {
  UniswapV4LifecycleOperation,
  UniswapV4PoolKey,
  UniswapV4PoolState,
  UniswapV4PositionState,
} from "../api/types.js";
import { getPositionAmounts } from "./sdk-adapter-api.js";

export type AnalysisAmounts = { readonly amount0: bigint; readonly amount1: bigint };

function parseState<T>(
  value: unknown,
  parse: (candidate: unknown) => T,
  code: string,
  message: string
): T {
  try {
    return parse(value);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      throw new Web3AgentError({ code, cause: error, message });
    }
    throw error;
  }
}

export function parsePool(value: unknown): UniswapV4PoolState {
  return parseState(
    value,
    uniswapV4PoolStateSchema.parse,
    "UNISWAP_V4_ANALYSIS_POOL_INVALID",
    "Pool must be a complete normalized Uniswap v4 pool snapshot"
  );
}

export function parsePosition(value: unknown): UniswapV4PositionState {
  return parseState(
    value,
    uniswapV4PositionStateSchema.parse,
    "UNISWAP_V4_ANALYSIS_POSITION_INVALID",
    "Position must include all normalized fee-growth facts"
  );
}

export function parsePoolKey(value: unknown): UniswapV4PoolKey {
  return parseState(
    value,
    uniswapV4PoolKeySchema.parse,
    "UNISWAP_V4_ANALYSIS_INPUT_INVALID",
    "PoolKey must contain canonical currency ordering and tick spacing"
  );
}

export function parseOperation(value: unknown): UniswapV4LifecycleOperation {
  return parseState(
    value,
    uniswapV4LifecycleOperationSchema.parse,
    "UNISWAP_V4_ANALYSIS_OPERATION_INVALID",
    "Lifecycle operation must be a complete canonical operation"
  );
}

export function parseLiquidity(value: string): bigint {
  try {
    return BigInt(decimalIntegerSchema.parse(value));
  } catch (error: unknown) {
    throw new Web3AgentError({
      cause: error,
      code: "UNISWAP_V4_ANALYSIS_INPUT_INVALID",
      message: "Liquidity must be a canonical unsigned decimal integer",
    });
  }
}

export function assertCurrentState(
  pool: UniswapV4PoolState,
  position: UniswapV4PositionState
): void {
  const sameBlock =
    pool.sourceBlock.blockHash.toLowerCase() === position.sourceBlock.blockHash.toLowerCase() &&
    pool.sourceBlock.blockNumber === position.sourceBlock.blockNumber &&
    pool.sourceBlock.chainId === position.sourceBlock.chainId;
  if (!sameBlock || pool.pool.poolId.toLowerCase() !== position.pool.poolId.toLowerCase()) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_ANALYSIS_STALE_STATE",
      message: "Pool and position snapshots must share one source block and PoolId",
    });
  }
}

export function positionAmounts(
  pool: UniswapV4PoolState,
  input: { readonly liquidity: bigint; readonly tickLower: number; readonly tickUpper: number }
): AnalysisAmounts {
  if (input.liquidity === 0n) {
    return { amount0: 0n, amount1: 0n };
  }
  return getPositionAmounts({
    liquidity: input.liquidity,
    poolKey: pool.pool.poolKey,
    slippageBps: 0,
    sqrtPriceX96: BigInt(pool.sqrtPriceX96),
    tickCurrent: pool.tick,
    tickLower: input.tickLower,
    tickUpper: input.tickUpper,
  }).current;
}
