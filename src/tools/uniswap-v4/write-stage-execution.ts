import { type Hex, encodeFunctionData } from "viem";

import { Web3AgentError } from "../../api/errors.js";
import { assertHex } from "../../operations/validation.js";
import { type buildWriteContext, isWriteContext } from "../shared/write-context.js";
import type { UniswapV4PersistedWritePlan } from "./write-schemas.js";

const permit2Abi = [
  {
    inputs: [
      { name: "owner", type: "address" },
      {
        components: [
          {
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint160" },
              { name: "expiration", type: "uint48" },
              { name: "nonce", type: "uint48" },
            ],
            name: "details",
            type: "tuple[]",
          },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" },
        ],
        name: "permitBatch",
        type: "tuple",
      },
      { name: "signature", type: "bytes" },
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
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

export type ExecutionStage =
  | "erc20Approval"
  | "permit2Signature"
  | "poolInitialization"
  | "positionManager";
export type StageReceipt = {
  readonly stage: ExecutionStage;
  readonly status: "reverted" | "submitted" | "success";
  readonly txHash: string;
};

export class StageExecutionError extends Error {
  readonly name = "StageExecutionError";
  constructor(
    readonly stage: ExecutionStage,
    readonly receipts: readonly StageReceipt[],
    message: string
  ) {
    super(message);
  }
}

export async function executeUniswapV4Stages(
  context: ReturnType<typeof buildWriteContext> & object,
  plan: UniswapV4PersistedWritePlan,
  receipts: StageReceipt[]
): Promise<Hex> {
  let finalTransactionHash: Hex | undefined;
  for (const [index, action] of plan.actions.entries()) {
    switch (action.kind) {
      case "erc20Approval":
      case "poolInitialization":
      case "positionManager":
        finalTransactionHash = await submitTransaction(context, action, action.kind, receipts);
        break;
      case "permit2Signature":
        await signAndSubmitPermit2(context, action, receipts);
        break;
      case "nftPermitSignature":
        throw new Web3AgentError({
          code: "UNISWAP_V4_PLAN_STAGE_ORDER_INVALID",
          message: "Server-wallet plans cannot contain NFT permit signatures",
        });
    }
    if (index === plan.actions.length - 1 && action.kind !== "positionManager") {
      throw new Web3AgentError({
        code: "UNISWAP_V4_PLAN_STAGE_ORDER_INVALID",
        message: "Persisted Uniswap v4 plan must end at PositionManager",
      });
    }
  }
  if (finalTransactionHash === undefined) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_RECONCILIATION_INCOMPLETE",
      message: "Uniswap v4 write completed without a final transaction hash for reconciliation",
    });
  }
  return finalTransactionHash;
}

async function signAndSubmitPermit2(
  context: ReturnType<typeof buildWriteContext> & object,
  action: Extract<
    UniswapV4PersistedWritePlan["actions"][number],
    { readonly kind: "permit2Signature" }
  >,
  receipts: StageReceipt[]
): Promise<void> {
  if (!isWriteContext(context)) throw new Error("Write context was not available");
  const message = {
    details: action.message.details.map((detail) => ({
      amount: BigInt(detail.amount),
      expiration: Number(detail.expiration),
      nonce: Number(detail.nonce),
      token: detail.token,
    })),
    sigDeadline: BigInt(action.message.sigDeadline),
    spender: action.message.spender,
  };
  const signature = await context.walletClient.signTypedData({
    account: context.account,
    domain: action.domain,
    message,
    primaryType: action.primaryType,
    types: permit2Types,
  });
  const data = encodeFunctionData({
    abi: permit2Abi,
    args: [context.account.address, message, signature],
    functionName: "permit",
  });
  await submitTransaction(
    context,
    { data, to: action.domain.verifyingContract, value: "0" },
    "permit2Signature",
    receipts
  );
}

async function submitTransaction(
  context: ReturnType<typeof buildWriteContext> & object,
  action: { readonly data: string; readonly to: string; readonly value: string },
  stage: ExecutionStage,
  receipts: StageReceipt[]
): Promise<Hex> {
  if (!isWriteContext(context)) throw new Error("Write context was not available");
  const txHash = assertHex(
    await context.walletClient.sendTransaction({
      account: context.account,
      chain: context.chain,
      data: action.data,
      to: action.to,
      value: BigInt(action.value),
    }),
    "Uniswap v4 transaction hash"
  );
  let receipt: Awaited<ReturnType<typeof context.publicClient.waitForTransactionReceipt>>;
  try {
    receipt = await context.publicClient.waitForTransactionReceipt({ hash: txHash });
  } catch (error: unknown) {
    receipts.push({ stage, status: "submitted", txHash: String(txHash) });
    const reason = error instanceof Error ? `: ${error.message}` : "";
    throw new StageExecutionError(
      stage,
      receipts,
      `Uniswap v4 ${stage} transaction was submitted but receipt polling failed${reason}`
    );
  }
  const status = receipt.status === "success" ? "success" : "reverted";
  receipts.push({ stage, status, txHash: String(txHash) });
  if (status !== "success")
    throw new StageExecutionError(stage, receipts, `Uniswap v4 ${stage} transaction reverted`);
  return txHash;
}
