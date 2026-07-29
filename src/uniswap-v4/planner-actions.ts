import { type Hex, encodeFunctionData, getAddress, isHex } from "viem";

import { Web3AgentError } from "../api/errors.js";
import { allowanceFor, approvalAmount } from "./planner-guards.js";
import type {
  UniswapV4AddOperation,
  UniswapV4AddPlanInput,
  UniswapV4Erc20ApprovalAction,
  UniswapV4Permit2SignatureAction,
} from "./planner-types.js";
import {
  buildPermit2Batch,
  buildPositionManagerCalldata,
  getPositionAmounts,
} from "./sdk-adapter-api.js";

const permit2Types = {
  PermitBatch: [
    { name: "details", type: "PermitDetails[]" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
} as const;

const erc20ApprovalAbi = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

type AddAmounts = { readonly amount0: bigint; readonly amount1: bigint };

export function maximumAddAmounts(
  operation: UniswapV4AddOperation,
  input: UniswapV4AddPlanInput
): AddAmounts {
  return getPositionAmounts({
    liquidity: BigInt(operation.liquidity),
    poolKey: operation.poolKey,
    slippageBps: operation.slippageBps,
    sqrtPriceX96: initialSqrtPrice(operation, BigInt(input.pool.sqrtPriceX96)),
    tickCurrent: input.pool.tick,
    tickLower: operation.tickLower,
    tickUpper: operation.tickUpper,
  }).mintMaximum;
}

export function approvalActions(
  input: UniswapV4AddPlanInput,
  operation: UniswapV4AddOperation,
  amounts: AddAmounts
): readonly UniswapV4Erc20ApprovalAction[] {
  const currencies = [
    { amount: amounts.amount0, currency: operation.poolKey.currency0 },
    { amount: amounts.amount1, currency: operation.poolKey.currency1 },
  ] as const;
  return currencies.flatMap(({ amount, currency }) => {
    if (currency.kind === "native" || amount === 0n) {
      return [];
    }
    const allowance = allowanceFor(input, currency.address);
    if (allowance.erc20Amount >= amount) {
      return [];
    }
    const approval = approvalAmount(input.allowanceMode, amount);
    const spender = getAddress(input.deployment.permit2);
    const token = getAddress(currency.address);
    return [
      {
        amount: approval,
        data: encodeFunctionData({
          abi: erc20ApprovalAbi,
          args: [spender, approval],
          functionName: "approve",
        }),
        kind: "erc20Approval" as const,
        spender,
        to: token,
        token,
        value: 0n,
      },
    ];
  });
}

export function permit2Action(
  input: UniswapV4AddPlanInput,
  operation: UniswapV4AddOperation,
  amounts: AddAmounts
): UniswapV4Permit2SignatureAction | undefined {
  const currencies = [
    { amount: amounts.amount0, currency: operation.poolKey.currency0 },
    { amount: amounts.amount1, currency: operation.poolKey.currency1 },
  ] as const;
  const required = currencies.filter(
    (
      entry
    ): entry is {
      readonly amount: bigint;
      readonly currency: Extract<typeof entry.currency, { kind: "erc20" }>;
    } => entry.currency.kind === "erc20" && entry.amount > 0n
  );
  if (required.length === 0) {
    return undefined;
  }
  const allowances = required.map(({ currency }) => allowanceFor(input, currency.address));
  if (
    required.every((entry, index) => {
      const allowance = allowances[index];
      return (
        allowance !== undefined &&
        allowance.permit2.amount >= entry.amount &&
        allowance.permit2.expiration >= BigInt(operation.deadline)
      );
    })
  ) {
    return undefined;
  }
  const nonce = allowances[0]?.permit2.nonce;
  if (nonce === undefined || allowances.some((allowance) => allowance.permit2.nonce !== nonce)) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_PERMIT2_NONCE_MISMATCH",
      message: "All Permit2 batch details must have the same pinned nonce",
    });
  }
  const batch = buildPermit2Batch({
    liquidity: BigInt(operation.liquidity),
    poolKey: operation.poolKey,
    slippageBps: operation.slippageBps,
    sqrtPriceX96: initialSqrtPrice(operation, BigInt(input.pool.sqrtPriceX96)),
    spender: input.deployment.positionManager,
    tickCurrent: input.pool.tick,
    tickLower: operation.tickLower,
    tickUpper: operation.tickUpper,
    deadline: BigInt(operation.deadline),
    nonce,
  });
  const details = batch.details.filter((detail) =>
    required.some((entry) => entry.currency.address.toLowerCase() === detail.token.toLowerCase())
  );
  return {
    domain: {
      chainId: operation.chainId,
      name: "Permit2",
      verifyingContract: getAddress(input.deployment.permit2),
    },
    kind: "permit2Signature",
    message: {
      details: details.map((detail) => ({ ...detail, token: getAddress(detail.token) })),
      sigDeadline: batch.sigDeadline,
      spender: getAddress(input.deployment.positionManager),
    },
    primaryType: "PermitBatch",
    types: permit2Types,
  };
}

export function positionManagerAction(
  input: UniswapV4AddPlanInput,
  operation: UniswapV4AddOperation,
  amounts: AddAmounts
): { readonly data: Hex; readonly value: bigint } {
  const nativeValue = operation.poolKey.currency0.kind === "native" ? amounts.amount0 : 0n;
  const sqrtPriceX96 = initialSqrtPrice(operation, BigInt(input.pool.sqrtPriceX96));
  const common = {
    deadline: BigInt(operation.deadline),
    hookData: operation.hookData,
    liquidity: BigInt(operation.liquidity),
    nativeValue,
    poolKey: operation.poolKey,
    slippageBps: operation.slippageBps,
    sqrtPriceX96,
    tickCurrent: input.pool.tick,
    tickLower: operation.tickLower,
    tickUpper: operation.tickUpper,
  };
  const transaction =
    operation.kind === "mint"
      ? buildPositionManagerCalldata({ ...common, kind: "mint", recipient: input.account })
      : buildPositionManagerCalldata({
          ...common,
          kind: "increase",
          tokenId: BigInt(operation.tokenId),
          recipient: input.account,
        });
  return { data: toHex(transaction.calldata), value: transaction.value };
}

function initialSqrtPrice(operation: UniswapV4AddOperation, currentSqrtPriceX96: bigint): bigint {
  if (operation.kind !== "mint" || !operation.createPool) {
    return currentSqrtPriceX96;
  }
  if (operation.initializeSqrtPriceX96 === undefined) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_INITIALIZATION_PRICE_REQUIRED",
      message: "Explicit pool initialization requires an initial sqrt price",
    });
  }
  return BigInt(operation.initializeSqrtPriceX96);
}

function toHex(value: string): Hex {
  if (!isHex(value, { strict: true })) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_CALLDATA_INVALID",
      message: "Official SDK returned malformed calldata",
    });
  }
  return value;
}
