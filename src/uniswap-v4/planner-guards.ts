import { maxUint256 } from "viem";

import { Web3AgentError } from "../api/errors.js";
import {
  uniswapV4IncreaseOperationSchema,
  uniswapV4MintOperationSchema,
} from "../api/schemas/uniswap-v4/lifecycle.js";
import { uniswapV4PoolStateSchema } from "../api/schemas/uniswap-v4/state.js";
import type { UniswapV4PoolKey } from "../api/types.js";
import { getUniswapV4Deployment } from "./deployments.js";
import type {
  UniswapV4AddOperation,
  UniswapV4AddPlanInput,
  UniswapV4TokenAllowance,
} from "./planner-types.js";
import { getPoolIdentity, validatePositionTicks } from "./sdk-adapter-api.js";

export function parseAddOperation(operation: UniswapV4AddOperation): UniswapV4AddOperation {
  switch (operation.kind) {
    case "mint":
      return uniswapV4MintOperationSchema.parse(operation);
    case "increase":
      return uniswapV4IncreaseOperationSchema.parse(operation);
  }
}

export function assertAddPlanInput(input: UniswapV4AddPlanInput): UniswapV4AddOperation {
  const operation = parseAddOperation(input.operation);
  if (operation.hookData !== "0x" && operation.poolKey.hooks.toLowerCase() === zeroAddress) {
    throw planError(
      "UNISWAP_V4_HOOK_DATA_INVALID",
      "Hook data requires a non-zero pool hook address"
    );
  }
  const pool = uniswapV4PoolStateSchema.parse(input.pool);
  const poolId = getPoolIdentity(operation.poolKey).poolId;
  if (operation.account.toLowerCase() !== input.account.toLowerCase()) {
    throw planError(
      "UNISWAP_V4_PLANNER_ACCOUNT_MISMATCH",
      "Plan account must match the operation account"
    );
  }
  if (input.deployment.chainId !== operation.chainId) {
    throw planError(
      "UNISWAP_V4_DEPLOYMENT_CHAIN_MISMATCH",
      "Deployment chain must match the operation"
    );
  }
  assertCanonicalDeployment(input.deployment, getUniswapV4Deployment(operation.chainId));
  if (
    pool.sourceBlock.blockNumber !== operation.sourceBlock.blockNumber ||
    pool.sourceBlock.blockHash.toLowerCase() !== operation.sourceBlock.blockHash.toLowerCase() ||
    pool.sourceBlock.chainId !== operation.sourceBlock.chainId ||
    pool.pool.poolId.toLowerCase() !== poolId.toLowerCase()
  ) {
    throw planError(
      "UNISWAP_V4_POOL_STATE_MISMATCH",
      "Pool state does not match the pinned operation source"
    );
  }
  assertPoolKeyMatches(operation.poolKey, pool.pool.poolKey);
  if (pool.dynamicFee !== ((operation.poolKey.fee & 0x800000) !== 0)) {
    throw planError(
      "UNISWAP_V4_DYNAMIC_FEE_MISMATCH",
      "Pool dynamic-fee state does not match PoolKey"
    );
  }
  validatePositionTicks(operation);
  const now = input.now ?? BigInt(Math.floor(Date.now() / 1000));
  if (BigInt(operation.deadline) <= now) {
    throw planError("UNISWAP_V4_DEADLINE_EXPIRED", "Operation deadline must be in the future");
  }
  if (operation.kind === "mint") {
    if (pool.initialized === operation.createPool) {
      throw planError(
        "UNISWAP_V4_INITIALIZATION_INVALID",
        "Pool initialization must be explicitly requested only for an uninitialized pool"
      );
    }
    if (operation.createPool && (BigInt(pool.sqrtPriceX96) !== 0n || pool.tick !== 0)) {
      throw planError(
        "UNISWAP_V4_UNINITIALIZED_POOL_STATE_INVALID",
        "Explicit initialization requires an uninitialized pool snapshot"
      );
    }
  } else if (input.position === undefined) {
    throw planError(
      "UNISWAP_V4_POSITION_REQUIRED",
      "Increase plans require the pinned position snapshot"
    );
  } else if (
    input.position.sourceBlock.blockHash.toLowerCase() !==
      operation.sourceBlock.blockHash.toLowerCase() ||
    input.position.sourceBlock.blockNumber !== operation.sourceBlock.blockNumber ||
    input.position.pool.poolId.toLowerCase() !== poolId.toLowerCase() ||
    input.position.tokenId !== operation.tokenId
  ) {
    throw planError(
      "UNISWAP_V4_POSITION_STATE_MISMATCH",
      "Position state does not match the pinned pool and source block"
    );
  }
  return operation;
}

export function allowanceFor(input: UniswapV4AddPlanInput, token: string): UniswapV4TokenAllowance {
  const allowance = input.allowances.find(
    (candidate) => candidate.token.toLowerCase() === token.toLowerCase()
  );
  if (allowance === undefined) {
    throw planError("UNISWAP_V4_ALLOWANCE_REQUIRED", `Missing pinned allowance for ${token}`);
  }
  if (
    allowance.sourceBlock.blockHash.toLowerCase() !==
      input.operation.sourceBlock.blockHash.toLowerCase() ||
    allowance.sourceBlock.blockNumber !== input.operation.sourceBlock.blockNumber ||
    allowance.sourceBlock.chainId !== input.operation.sourceBlock.chainId
  ) {
    throw planError(
      "UNISWAP_V4_ALLOWANCE_BLOCK_MISMATCH",
      "Allowance must use the operation source block"
    );
  }
  return allowance;
}

export function approvalAmount(mode: "exact" | "unlimited" | undefined, amount: bigint): bigint {
  return mode === "unlimited" ? maxUint256 : amount;
}

function assertPoolKeyMatches(expected: UniswapV4PoolKey, observed: UniswapV4PoolKey): void {
  if (
    getPoolIdentity(expected).poolId.toLowerCase() !==
    getPoolIdentity(observed).poolId.toLowerCase()
  ) {
    throw planError(
      "UNISWAP_V4_POOL_KEY_MISMATCH",
      "Pool state PoolKey does not match the operation PoolKey"
    );
  }
}

function planError(code: string, message: string): Web3AgentError {
  return new Web3AgentError({ code, message });
}

export function assertCanonicalDeployment(
  supplied: UniswapV4AddPlanInput["deployment"],
  canonical: Pick<
    UniswapV4AddPlanInput["deployment"],
    "poolManager" | "positionManager" | "stateView" | "permit2"
  >
): void {
  const contracts = ["poolManager", "positionManager", "stateView", "permit2"] as const;
  for (const contract of contracts) {
    if (supplied[contract].toLowerCase() !== canonical[contract].toLowerCase()) {
      throw planError(
        "UNISWAP_V4_DEPLOYMENT_CANONICAL_MISMATCH",
        `Planner must use canonical ${contract}`
      );
    }
  }
}

const zeroAddress = "0x0000000000000000000000000000000000000000";
