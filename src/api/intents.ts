import { Web3AgentError } from "./errors.js";
import {
  getRequiredApprovals as getRequiredApprovalsForOperation,
  prepareCompatibilityBridgeIntent,
  prepareOperation,
  submitSignedSwap as submitSignedSwapViaOperation,
  submitSignedTwapOrder as submitSignedTwapOrderViaOperation,
} from "./operations.js";
import type {
  ApprovalStep,
  BridgeIntent,
  GetRequiredApprovalsInput,
  LimitIntent,
  PrepareBridgeIntentInput,
  PrepareLimitIntentInput,
  PrepareOperationInput,
  PrepareSwapIntentInput,
  PrepareTwapIntentInput,
  PreparedOperation,
  SwapIntent,
  SwapSubmissionResult,
  TwapIntent,
  TwapOrderResult,
} from "./types.js";

function getCompatibilityIntent<T>(operation: PreparedOperation, field: string): T {
  const intent = operation.meta?.intent;
  if (!intent || typeof intent !== "object") {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `${field} compatibility payload missing from prepared operation`,
    });
  }

  // Verify the intent has the expected shape for the given kind.
  const record = intent as Record<string, unknown>;
  if (field === "swap" && !record.quote) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "swap intent must contain a quote",
    });
  }
  if ((field === "twap" || field === "limit") && !record.order) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `${field} intent must contain an order`,
    });
  }

  return intent as T;
}

async function prepareCompatibilityIntent<T>(params: {
  input: PrepareSwapIntentInput | PrepareTwapIntentInput | PrepareLimitIntentInput;
  kind: "swap" | "twap" | "limit";
  errorCode: "ORBS_QUOTE_ERROR" | "ORBS_TWAP_ERROR" | "ORBS_LIMIT_ERROR";
}): Promise<T> {
  const result = await prepareOperation({
    integration: "orbs",
    kind: params.kind,
    ...params.input,
  } as PrepareOperationInput);

  if ("completed" in result) {
    throw new Web3AgentError({
      code: params.errorCode,
      message: `${params.kind.toUpperCase()} preparation completed unexpectedly without returning an intent`,
    });
  }

  return getCompatibilityIntent<T>(result, params.kind);
}

export async function getRequiredApprovals(
  params: GetRequiredApprovalsInput
): Promise<ApprovalStep[]> {
  return getRequiredApprovalsForOperation(params);
}

export async function prepareSwapIntent(params: PrepareSwapIntentInput): Promise<SwapIntent> {
  return prepareCompatibilityIntent<SwapIntent>({
    input: params,
    kind: "swap",
    errorCode: "ORBS_QUOTE_ERROR",
  });
}

export async function prepareTwapIntent(params: PrepareTwapIntentInput): Promise<TwapIntent> {
  return prepareCompatibilityIntent<TwapIntent>({
    input: params,
    kind: "twap",
    errorCode: "ORBS_TWAP_ERROR",
  });
}

export async function prepareLimitIntent(params: PrepareLimitIntentInput): Promise<LimitIntent> {
  return prepareCompatibilityIntent<LimitIntent>({
    input: params,
    kind: "limit",
    errorCode: "ORBS_LIMIT_ERROR",
  });
}

export async function prepareBridgeIntent(params: PrepareBridgeIntentInput): Promise<BridgeIntent> {
  return prepareCompatibilityBridgeIntent(params);
}

export async function submitSignedSwap(params: {
  chainId: number;
  quote: Record<string, unknown>;
  signature: `0x${string}`;
}): Promise<SwapSubmissionResult> {
  return submitSignedSwapViaOperation(params);
}

export async function submitSignedTwapOrder(params: {
  order: Record<string, unknown>;
  signature: { v: number; r: string; s: string };
}): Promise<TwapOrderResult> {
  return submitSignedTwapOrderViaOperation(params);
}
