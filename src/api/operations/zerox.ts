import { encodeFunctionData, erc20Abi } from "viem";
import { getConfig } from "../../config/env.js";
import { assertAddress } from "../../operations/validation.js";
import { classifyZeroExError, getZeroExQuote } from "../../zerox/client.js";
import { Web3AgentError } from "../errors.js";
import { zeroExSwapResumeStateStateSchema } from "../schemas.js";
import type {
  OperationActionResult,
  OperationResumeState,
  PreparedOperation,
  PreparedTransactionAction,
  ResumeOperationCompletedResult,
  ZeroExSwapOperationInput,
} from "../types.js";
import { parseInput } from "../validation.js";
import { prepareLifiSameChainSwapOperation } from "./lifi-same-chain.js";
import {
  assertConfirmedTransactionResult,
  buildPreparedOperation,
  getPendingPreparedActions,
  toPendingOperation,
} from "./shared.js";

function getApiKey(): string {
  const apiKey = getConfig().zeroxApiKey;
  if (!apiKey) {
    throw new Web3AgentError({
      code: "ZEROEX_AUTHENTICATION",
      message: "ZEROX_API_KEY is required for Robinhood 0x swaps",
    });
  }
  return apiKey;
}

function createApprovalAction(
  input: ZeroExSwapOperationInput,
  target: `0x${string}`,
  amount: string
) {
  return {
    id: "zeroex:approval:0",
    type: "transaction" as const,
    label: "Approve 0x allowance target",
    tx: {
      to: assertAddress(input.fromToken, "fromToken"),
      chainId: input.chainId,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [target, BigInt(amount)],
      }),
      value: "0",
    },
  } satisfies PreparedTransactionAction;
}

function createSwapAction(
  quote: Awaited<ReturnType<typeof getZeroExQuote>>
): PreparedTransactionAction {
  return {
    id: "zeroex:swap:0",
    type: "transaction",
    label: "Execute 0x swap",
    tx: {
      to: quote.transaction.to,
      chainId: quote.chainId,
      data: quote.transaction.data,
      value: quote.transaction.value,
    },
  };
}

export async function prepareZeroExSwapOperation(
  input: ZeroExSwapOperationInput
): Promise<PreparedOperation> {
  let quote: Awaited<ReturnType<typeof getZeroExQuote>>;
  try {
    quote = await getZeroExQuote({
      apiKey: getApiKey(),
      chainId: input.chainId,
      fromAmount: input.fromAmount,
      fromToken: input.fromToken,
      taker: input.account,
      toToken: input.toToken,
      ...(input.slippageBps === undefined ? {} : { slippageBps: input.slippageBps }),
      ...(input.referencePrice === undefined ? {} : { referencePrice: input.referencePrice }),
    });
  } catch (error: unknown) {
    const classification = classifyZeroExError(error);
    if (classification.fallbackAllowed) {
      return prepareLifiSameChainSwapOperation(
        {
          account: input.account,
          fromAmount: input.fromAmount,
          fromChainId: 4663,
          fromToken: input.fromToken,
          integration: "lifi",
          kind: "swap",
          toChainId: 4663,
          toToken: input.toToken,
        },
        { reason: classification.kind }
      );
    }
    throw error;
  }
  const approvalActions = quote.allowance
    ? [createApprovalAction(input, quote.allowance.target, quote.allowance.amount)]
    : [];
  const finalAction = createSwapAction(quote);
  const meta = {
    adapterSource: quote.adapterSource,
    capabilityDecisionId: quote.capabilityDecisionId,
    capabilityReason: quote.capabilityReason,
    chainId: quote.chainId,
    provider: "0x",
  };

  return buildPreparedOperation(
    "zeroex",
    "swap",
    "Prepare 0x swap on Robinhood chain 4663",
    approvalActions.length > 0 ? approvalActions : [finalAction],
    {
      operation: input,
      approvalActions,
      finalAction,
      summary: "Prepare 0x swap on Robinhood chain 4663",
    },
    meta
  );
}

export async function resumeZeroExSwapOperation(
  resumeState: OperationResumeState,
  actionResults: Record<string, OperationActionResult>
): Promise<ResumeOperationCompletedResult | { completed: false; operation: PreparedOperation }> {
  const state = parseInput(zeroExSwapResumeStateStateSchema, resumeState.state);
  const canonical = await prepareZeroExSwapOperation(state.operation);
  if (canonical.integration !== "zeroex") {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "0x resume state can no longer rebuild an executable 0x route",
    });
  }
  const canonicalState = parseInput(zeroExSwapResumeStateStateSchema, canonical.resumeState.state);

  const pendingApprovals = await getPendingPreparedActions(
    canonicalState.approvalActions,
    actionResults
  );
  if (pendingApprovals.length > 0) {
    return {
      completed: false,
      operation: toPendingOperation(
        canonical.resumeState,
        pendingApprovals,
        "Resume 0x swap approval",
        actionResults
      ),
    };
  }
  const finalTransaction = await assertConfirmedTransactionResult(
    actionResults,
    canonicalState.finalAction
  );
  if (!finalTransaction) {
    return {
      completed: false,
      operation: toPendingOperation(
        canonical.resumeState,
        [canonicalState.finalAction],
        "Resume 0x swap",
        actionResults
      ),
    };
  }
  return {
    completed: true,
    integration: "zeroex",
    kind: "swap",
    result: { status: "completed", txHash: finalTransaction.txHash },
  };
}
