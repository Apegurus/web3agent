import { encodeFunctionData, erc20Abi } from "viem";
import { getConfig } from "../../config/env.js";
import { assertAddress } from "../../operations/validation.js";
import { classifyZeroExError, getZeroExQuote } from "../../zerox/client.js";
import { prepareZeroExExecution } from "../../zerox/confirmed-execution.js";
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
  assertResumeStateIntegrity,
  authenticatePreparedOperation,
  authenticateResumeState,
} from "./resume-state-integrity.js";
import {
  assertConfirmedTransactionResult,
  buildPreparedOperation,
  getPendingPreparedActions,
  mergeActionResults,
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
      from: input.account,
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
  quote: Awaited<ReturnType<typeof getZeroExQuote>>,
  account: `0x${string}`
): PreparedTransactionAction {
  return {
    id: "zeroex:swap:0",
    type: "transaction",
    label: "Execute 0x swap",
    tx: {
      from: account,
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
          ...(input.slippageBps === undefined ? {} : { slippagePct: input.slippageBps / 100 }),
        },
        { reason: classification.kind }
      );
    }
    throw error;
  }
  const execution = await prepareZeroExExecution(quote, input.fromAmount, input.account);
  const executionApprovalActions = execution.allowance
    ? [createApprovalAction(input, execution.allowance.target, execution.allowance.amount)]
    : [];
  const executionFinalAction = createSwapAction(
    { ...quote, transaction: execution.transaction },
    input.account
  );
  const meta = {
    adapterSource: quote.adapterSource,
    capabilityDecisionId: quote.capabilityDecisionId,
    capabilityReason: quote.capabilityReason,
    chainId: quote.chainId,
    provider: "0x",
  };

  return authenticatePreparedOperation(
    buildPreparedOperation(
      "zeroex",
      "swap",
      "Prepare 0x swap on Robinhood chain 4663",
      executionApprovalActions.length > 0 ? executionApprovalActions : [executionFinalAction],
      {
        operation: input,
        approvalActions: executionApprovalActions,
        finalAction: executionFinalAction,
        presentedStage: executionApprovalActions.length > 0 ? "approval" : "final",
        summary: "Prepare 0x swap on Robinhood chain 4663",
      },
      meta
    )
  );
}

export async function resumeZeroExSwapOperation(
  resumeState: OperationResumeState,
  actionResults: Record<string, OperationActionResult>
): Promise<ResumeOperationCompletedResult | { completed: false; operation: PreparedOperation }> {
  assertResumeStateIntegrity(resumeState);
  const state = parseInput(zeroExSwapResumeStateStateSchema, resumeState.state);
  const mergedResults = mergeActionResults(state, actionResults);

  if (state.presentedStage === "approval") {
    const pendingApprovals = await getPendingPreparedActions(state.approvalActions, mergedResults);
    if (pendingApprovals.length > 0) {
      return {
        completed: false,
        operation: toPendingOperation(
          resumeState,
          pendingApprovals,
          "Resume 0x swap approval",
          mergedResults
        ),
      };
    }
    const canonical = await prepareZeroExSwapOperation(state.operation);
    if (canonical.integration !== "zeroex") {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: "0x resume state can no longer rebuild an executable 0x route",
      });
    }
    const canonicalState = parseInput(
      zeroExSwapResumeStateStateSchema,
      canonical.resumeState.state
    );
    await getPendingPreparedActions(canonicalState.approvalActions, mergedResults);
    const finalResumeState = authenticateResumeState({
      ...canonical.resumeState,
      state: {
        ...canonicalState,
        actionResults: mergedResults,
        presentedStage: "final",
      },
    });
    return {
      completed: false,
      operation: toPendingOperation(
        finalResumeState,
        [canonicalState.finalAction],
        "Resume 0x swap",
        mergedResults
      ),
    };
  }
  if (mergedResults[state.finalAction.id] === undefined) {
    const canonical = await prepareZeroExSwapOperation(state.operation);
    if (canonical.integration !== "zeroex") {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: "0x resume state can no longer rebuild an executable 0x route",
      });
    }
    const canonicalState = parseInput(
      zeroExSwapResumeStateStateSchema,
      canonical.resumeState.state
    );
    return {
      completed: false,
      operation: toPendingOperation(
        authenticateResumeState({
          ...canonical.resumeState,
          state: { ...canonicalState, presentedStage: "final" },
        }),
        [canonicalState.finalAction],
        "Resume 0x swap",
        mergedResults
      ),
    };
  }
  const finalTransaction = await assertConfirmedTransactionResult(mergedResults, state.finalAction);
  if (!finalTransaction) {
    return {
      completed: false,
      operation: toPendingOperation(
        resumeState,
        [state.finalAction],
        "Resume 0x swap",
        mergedResults
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
