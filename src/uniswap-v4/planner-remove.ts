import { type Address, isHex } from "viem";

import { Web3AgentError } from "../api/errors.js";
import { calculateLifecycleDeltas } from "./analysis.js";
import { getUniswapV4Deployment } from "./deployments.js";
import { assertRemovePlanInput } from "./planner-remove-guards.js";
import type {
  UniswapV4NftPermitPlan,
  UniswapV4RemovePlan,
  UniswapV4RemovePlanInput,
} from "./planner-types.js";
import {
  buildPositionManagerCalldata,
  getPoolIdentity,
  getPositionAmounts,
  getPositionManagerPermitData,
} from "./sdk-adapter-api.js";

export function planUniswapV4Remove(input: UniswapV4RemovePlanInput): UniswapV4RemovePlan {
  const operation = assertRemovePlanInput(input);
  const deployment = { ...input.deployment, ...getUniswapV4Deployment(operation.chainId) };
  const permit = input.nftPermit;
  const recipient = requiredRecipient(operation.recipient);
  const minimums = removalMinimums(input, operation);
  assertRequestedMinimums(operation, minimums);
  const transaction = removeTransaction({ input, operation, permit, recipient });
  return {
    actions: [
      {
        data: calldata(transaction.calldata),
        kind: "positionManager",
        to: deployment.positionManager,
        value: transaction.value,
      },
    ],
    expectedDeltas: calculateLifecycleDeltas({
      operation,
      pool: input.pool,
      position: input.position,
    }),
    expectedNftState: operation.kind === "burn" ? "burned" : "retained",
    ...(permit === undefined
      ? {}
      : { nftPermit: permitPlan(permit, deployment.positionManager, operation.chainId) }),
    minimums,
    poolId: calldata(getPoolIdentity(operation.poolKey).poolId),
    recipient,
    sourceBlock: operation.sourceBlock,
  };
}

function removeTransaction(input: {
  readonly input: UniswapV4RemovePlanInput;
  readonly operation: ReturnType<typeof assertRemovePlanInput>;
  readonly permit: UniswapV4RemovePlanInput["nftPermit"];
  readonly recipient: Address;
}) {
  const { operation, permit } = input;
  const common = {
    deadline: BigInt(operation.deadline),
    hookData: operation.hookData,
    liquidity: BigInt(input.input.position.liquidity),
    nativeValue: 0n,
    poolKey: operation.poolKey,
    recipient: input.recipient,
    slippageBps: operation.slippageBps,
    sqrtPriceX96: BigInt(input.input.pool.sqrtPriceX96),
    tickCurrent: input.input.pool.tick,
    tickLower: input.input.position.tickLower,
    tickUpper: input.input.position.tickUpper,
    tokenId: BigInt(operation.tokenId),
  };
  switch (operation.kind) {
    case "collect":
      return buildPositionManagerCalldata({
        ...common,
        kind: "collect",
        ...(permit === undefined ? {} : { permit: permitPayload(permit) }),
      });
    case "decrease":
      return buildPositionManagerCalldata({
        ...common,
        kind: "decrease",
        liquidityBps: operation.liquidityBps,
        ...(permit === undefined ? {} : { permit: permitPayload(permit) }),
      });
    case "burn":
      return buildPositionManagerCalldata({
        ...common,
        kind: "burn",
        liquidityBps: operation.liquidityBps,
        ...(permit === undefined ? {} : { permit: permitPayload(permit) }),
      });
  }
}

function permitPayload(permit: NonNullable<UniswapV4RemovePlanInput["nftPermit"]>) {
  return {
    deadline: permit.deadline.toString(),
    nonce: permit.nonce.toString(),
    signature: permit.signature,
    spender: permit.spender,
    tokenId: permit.tokenId.toString(),
  };
}

function removalMinimums(
  input: UniswapV4RemovePlanInput,
  operation: ReturnType<typeof assertRemovePlanInput>
): { readonly amount0: bigint; readonly amount1: bigint } {
  if (operation.kind === "collect") {
    return { amount0: 0n, amount1: 0n };
  }
  const liquidity = (BigInt(input.position.liquidity) * BigInt(operation.liquidityBps)) / 10_000n;
  return getPositionAmounts({
    liquidity,
    poolKey: operation.poolKey,
    slippageBps: operation.slippageBps,
    sqrtPriceX96: BigInt(input.pool.sqrtPriceX96),
    tickCurrent: input.pool.tick,
    tickLower: input.position.tickLower,
    tickUpper: input.position.tickUpper,
  }).burnMinimum;
}

function assertRequestedMinimums(
  operation: ReturnType<typeof assertRemovePlanInput>,
  minimums: { readonly amount0: bigint; readonly amount1: bigint }
): void {
  if (operation.kind === "collect") {
    return;
  }
  if (
    BigInt(operation.amount0Min) !== minimums.amount0 ||
    BigInt(operation.amount1Min) !== minimums.amount1
  ) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_REMOVE_MINIMUM_MISMATCH",
      message: "Requested minimum receives must equal the official SDK slippage minimums",
    });
  }
}

function requiredRecipient(value: Address | undefined): Address {
  if (value === undefined) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_REMOVE_RECIPIENT_REQUIRED",
      message: "Remove plans require an explicit recipient",
    });
  }
  return value;
}

function permitPlan(
  permit: NonNullable<UniswapV4RemovePlanInput["nftPermit"]>,
  positionManager: string,
  chainId: number
): UniswapV4NftPermitPlan {
  const typedData = getPositionManagerPermitData({
    chainId,
    deadline: permit.deadline,
    nonce: permit.nonce,
    positionManager,
    spender: permit.spender,
    tokenId: permit.tokenId,
  });
  return {
    ...permit,
    message: typedData.message,
    primaryType: typedData.primaryType,
    types: typedData.types,
  };
}

function calldata(value: string): `0x${string}` {
  if (!isHex(value, { strict: true })) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_CALLDATA_INVALID",
      message: "Official SDK returned malformed calldata",
    });
  }
  return value;
}
