import type { Quote } from "@orbs-network/liquidity-hub-sdk";
import type { TransactionReceipt } from "viem";
import { createPublicClientForRuntimeChain } from "../../operations/chain-access.js";
import { assertRecord } from "../../operations/validation.js";
import { Web3AgentError } from "../errors.js";
import { operationActionResultsMapSchema } from "../schemas.js";
import type {
  ApprovalStep,
  OperationActionResult,
  OperationResumeState,
  PreparedAction,
  PreparedOperation,
  PreparedSignTypedDataAction,
  PreparedTransactionAction,
  TypedDataPayload,
} from "../types.js";
import { parseInput } from "../validation.js";

function isMissingReceiptError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("receipt") && message.includes("not found");
}

export function createPreparedApprovalActions(
  chainId: number,
  approvals: ApprovalStep[]
): PreparedTransactionAction[] {
  return approvals.map((step, index) => ({
    id: `approval:${index}`,
    type: "transaction",
    label: step.label,
    tx: {
      to: step.tx.to,
      chainId,
      ...(step.tx.data ? { data: step.tx.data } : {}),
      ...(step.tx.value ? { value: step.tx.value } : {}),
    },
  }));
}

export function createTypedDataAction(
  chainId: number,
  label: string,
  eip712: TypedDataPayload
): PreparedSignTypedDataAction {
  return {
    id: "sign-typed-data:0",
    type: "signTypedData",
    label,
    chainId,
    eip712,
  };
}

export function buildPreparedOperation(
  integration: PreparedOperation["integration"],
  kind: PreparedOperation["kind"],
  summary: string,
  actions: PreparedOperation["actions"],
  state: Record<string, unknown>,
  meta?: Record<string, unknown>
): PreparedOperation {
  return {
    integration,
    kind,
    summary,
    actions,
    resumeState: {
      version: 1,
      integration,
      kind,
      state: {
        ...state,
        actionResults:
          state.actionResults && typeof state.actionResults === "object" ? state.actionResults : {},
        ...(meta ? { meta } : {}),
      },
    },
    ...(meta ? { meta } : {}),
  };
}

export function getStoredActionResults(
  state: Record<string, unknown>
): Record<string, OperationActionResult> {
  if (state.actionResults === undefined) {
    return {};
  }

  return parseInput(operationActionResultsMapSchema, state.actionResults);
}

export function mergeActionResults(
  state: Record<string, unknown>,
  actionResults?: Record<string, OperationActionResult>
): Record<string, OperationActionResult> {
  return {
    ...getStoredActionResults(state),
    ...(actionResults ?? {}),
  };
}

export function assertActionResultType<TType extends OperationActionResult["type"]>(
  actionResults: Record<string, OperationActionResult>,
  actionId: string,
  expectedType: TType
): Extract<OperationActionResult, { type: TType }> | undefined {
  const result = actionResults[actionId];
  if (!result) return undefined;
  if (result.type !== expectedType) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `Action result ${actionId} must be of type ${expectedType}`,
    });
  }
  return result as Extract<OperationActionResult, { type: TType }>;
}

export async function getConfirmedReceipt(
  action: PreparedTransactionAction,
  result: Extract<OperationActionResult, { type: "transaction" }>
): Promise<TransactionReceipt> {
  const publicClient = createPublicClientForRuntimeChain(action.tx.chainId);

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: result.txHash as `0x${string}`,
    });
    if (receipt.status !== "success") {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: `Action result ${action.id} must reference a successful confirmed transaction`,
      });
    }

    if (receipt.to && receipt.to.toLowerCase() !== action.tx.to.toLowerCase()) {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: `Action result ${action.id} transaction target does not match the prepared action`,
      });
    }

    return receipt;
  } catch (error: unknown) {
    if (error instanceof Web3AgentError) {
      throw error;
    }

    if (isMissingReceiptError(error)) {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: `Action result ${action.id} must reference a confirmed transaction receipt`,
        cause: error,
      });
    }

    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `Failed to verify transaction result for action ${action.id}`,
      cause: error,
    });
  }
}

async function isPreparedActionSatisfied(
  actionResults: Record<string, OperationActionResult>,
  action: PreparedAction
): Promise<boolean> {
  if (action.type === "transaction") {
    const result = assertActionResultType(actionResults, action.id, "transaction");
    if (!result) {
      return false;
    }

    await getConfirmedReceipt(action, result);
    return true;
  }

  if (action.type === "signTypedData") {
    return assertActionResultType(actionResults, action.id, "signature") !== undefined;
  }

  const result = actionResults[action.id];
  if (!result) return false;
  if (result.type !== "messageSignature" && result.type !== "signature") {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `Action result ${action.id} must be a message signature`,
    });
  }
  return true;
}

export async function getPendingPreparedActions(
  actions: PreparedAction[],
  actionResults: Record<string, OperationActionResult>
): Promise<PreparedAction[]> {
  const pending: PreparedAction[] = [];
  for (const action of actions) {
    if (!(await isPreparedActionSatisfied(actionResults, action))) {
      pending.push(action);
    }
  }
  return pending;
}

export async function assertConfirmedTransactionResult(
  actionResults: Record<string, OperationActionResult>,
  action: PreparedTransactionAction
): Promise<Extract<OperationActionResult, { type: "transaction" }> | undefined> {
  const result = assertActionResultType(actionResults, action.id, "transaction");
  if (!result) {
    return undefined;
  }

  await getConfirmedReceipt(action, result);
  return result;
}

export function toPendingOperation(
  resumeState: OperationResumeState,
  actions: PreparedOperation["actions"],
  fallbackSummary: string,
  actionResults: Record<string, OperationActionResult>
): PreparedOperation {
  const state = assertRecord(resumeState.state, "resumeState.state");
  const summary =
    typeof state.summary === "string" && state.summary.length > 0 ? state.summary : fallbackSummary;
  const meta = state.meta && typeof state.meta === "object" ? { ...(state.meta as object) } : {};
  const nextResumeState: OperationResumeState = {
    ...resumeState,
    state: {
      ...state,
      actionResults,
    },
  };

  return {
    integration: resumeState.integration,
    kind: resumeState.kind,
    summary,
    actions,
    resumeState: nextResumeState,
    ...(Object.keys(meta).length > 0 ? { meta: meta as Record<string, unknown> } : {}),
  };
}

export function assertSubmitSwapQuote(quote: unknown): Record<string, unknown> {
  const record = assertRecord(quote, "quote");
  const requiredFields = [
    "sessionId",
    "inToken",
    "outToken",
    "inAmount",
    "outAmount",
    "minAmountOut",
    "user",
  ] as const;

  for (const field of requiredFields) {
    if (typeof record[field] !== "string") {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: `quote.${field} must be a string`,
      });
    }
  }

  return record;
}

export function assertSignedOrder(order: unknown): Record<string, unknown> {
  return assertRecord(order, "order");
}

export function asQuote(value: Record<string, unknown>): Quote {
  // Caller must validate via assertSubmitSwapQuote before calling asQuote.
  // Cheap guard: verify the SDK's minimum required field exists.
  if (typeof value.sessionId !== "string") {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "quote.sessionId must be a string",
    });
  }
  return value as unknown as Quote;
}
