import { isHex } from "viem";

import { Web3AgentError } from "../api/errors.js";
import { calculateLifecycleDeltas } from "./analysis.js";
import { getUniswapV4Deployment } from "./deployments.js";
import {
  approvalActions,
  maximumAddAmounts,
  permit2Action,
  positionManagerAction,
} from "./planner-actions.js";
import { assertAddPlanInput } from "./planner-guards.js";
import type {
  UniswapV4AddPlan,
  UniswapV4AddPlanAction,
  UniswapV4AddPlanInput,
} from "./planner-types.js";
import { buildPositionManagerCalldata, getPoolIdentity } from "./sdk-adapter-api.js";
import { getInitializationTick } from "./sdk-adapter-initialization.js";

export type * from "./planner-types.js";

export function planUniswapV4Add(input: UniswapV4AddPlanInput): UniswapV4AddPlan {
  const operation = assertAddPlanInput(input);
  const canonicalInput = {
    ...input,
    deployment: { ...input.deployment, ...getUniswapV4Deployment(operation.chainId) },
  };
  const planningInput = withInitializedPool(canonicalInput, operation);
  const maximums = maximumAddAmounts(operation, planningInput);
  if (
    maximums.amount0 > BigInt(operation.amount0Max) ||
    maximums.amount1 > BigInt(operation.amount1Max)
  ) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_ADD_AMOUNT_MAX_INSUFFICIENT",
      message: "Operation amount limits cannot cover the official slippage-rounded maximum spend",
    });
  }
  const actions: UniswapV4AddPlanAction[] = [
    ...approvalActions(planningInput, operation, maximums),
  ];
  const permit = permit2Action(planningInput, operation, maximums);
  if (permit !== undefined) {
    actions.push(permit);
  }
  if (operation.kind === "mint" && operation.createPool) {
    const initialSqrtPriceX96 = operation.initializeSqrtPriceX96;
    if (initialSqrtPriceX96 === undefined) {
      throw new Web3AgentError({
        code: "UNISWAP_V4_INITIALIZATION_PRICE_REQUIRED",
        message: "Explicit pool initialization requires an initial sqrt price",
      });
    }
    const transaction = buildPositionManagerCalldata({
      kind: "create",
      poolKey: operation.poolKey,
      sqrtPriceX96: BigInt(initialSqrtPriceX96),
    });
    actions.push({
      data: toHex(transaction.calldata),
      kind: "poolInitialization",
      to: canonicalInput.deployment.poolManager,
      value: transaction.value,
    });
  }
  const transaction = positionManagerAction(planningInput, operation, maximums);
  actions.push({
    data: transaction.data,
    kind: "positionManager",
    to: canonicalInput.deployment.positionManager,
    value: transaction.value,
  });
  return {
    actions,
    expectedDeltas: calculateLifecycleDeltas({
      operation,
      pool: planningInput.pool,
      ...(planningInput.position === undefined ? {} : { position: planningInput.position }),
    }),
    poolId: toHex(getPoolIdentity(operation.poolKey).poolId),
    sourceBlock: operation.sourceBlock,
  };
}

function withInitializedPool(
  input: UniswapV4AddPlanInput,
  operation: UniswapV4AddPlanInput["operation"]
): UniswapV4AddPlanInput {
  if (operation.kind !== "mint" || !operation.createPool) {
    return input;
  }
  const sqrtPriceX96 = operation.initializeSqrtPriceX96;
  if (sqrtPriceX96 === undefined) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_INITIALIZATION_PRICE_REQUIRED",
      message: "Explicit pool initialization requires an initial sqrt price",
    });
  }
  return {
    ...input,
    pool: {
      ...input.pool,
      initialized: true,
      sqrtPriceX96,
      tick: getInitializationTick({
        poolKey: operation.poolKey,
        sqrtPriceX96: BigInt(sqrtPriceX96),
      }),
    },
  };
}

function toHex(value: string): `0x${string}` {
  if (!isHex(value, { strict: true })) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_CALLDATA_INVALID",
      message: "Official SDK returned malformed calldata",
    });
  }
  return value;
}
