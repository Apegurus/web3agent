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

  return intent as T;
}

export async function getRequiredApprovals(
  params: GetRequiredApprovalsInput
): Promise<ApprovalStep[]> {
  return getRequiredApprovalsForOperation(params);
}

export async function prepareSwapIntent(params: PrepareSwapIntentInput): Promise<SwapIntent> {
  const result = await prepareOperation({
    integration: "orbs",
    kind: "swap",
    ...params,
  });

  if ("completed" in result) {
    throw new Web3AgentError({
      code: "ORBS_QUOTE_ERROR",
      message: "Swap preparation completed unexpectedly without returning an intent",
    });
  }

  return getCompatibilityIntent<SwapIntent>(result, "swap");
}

export async function prepareTwapIntent(params: PrepareTwapIntentInput): Promise<TwapIntent> {
  const result = await prepareOperation({
    integration: "orbs",
    kind: "twap",
    ...params,
  });

  if ("completed" in result) {
    throw new Web3AgentError({
      code: "ORBS_TWAP_ERROR",
      message: "TWAP preparation completed unexpectedly without returning an intent",
    });
  }

  return getCompatibilityIntent<TwapIntent>(result, "twap");
}

export async function prepareLimitIntent(params: PrepareLimitIntentInput): Promise<LimitIntent> {
  const result = await prepareOperation({
    integration: "orbs",
    kind: "limit",
    ...params,
  });

  if ("completed" in result) {
    throw new Web3AgentError({
      code: "ORBS_LIMIT_ERROR",
      message: "Limit preparation completed unexpectedly without returning an intent",
    });
  }

  return getCompatibilityIntent<LimitIntent>(result, "limit");
}

export async function prepareBridgeIntent(params: PrepareBridgeIntentInput): Promise<BridgeIntent> {
  return prepareCompatibilityBridgeIntent(params);
}

export async function submitSignedSwap(params: {
  chainId: number;
  quote: Record<string, unknown>;
  signature: string;
}): Promise<SwapSubmissionResult> {
  return submitSignedSwapViaOperation(params);
}

export async function submitSignedTwapOrder(params: {
  order: Record<string, unknown>;
  signature: { v: number; r: string; s: string };
}): Promise<TwapOrderResult> {
  return submitSignedTwapOrderViaOperation(params);
}
