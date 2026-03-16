import { Web3AgentError } from "./errors.js";
import {
  getRequiredApprovals as getRequiredApprovalsForOperation,
  prepareCompatibilityBridgeIntent,
  prepareOperation,
  submitSignedSwap as submitSignedSwapViaOperation,
} from "./operations.js";
import type {
  ApprovalStep,
  BridgeIntent,
  GetRequiredApprovalsInput,
  PrepareBridgeIntentInput,
  PrepareOperationInput,
  PrepareSwapIntentInput,
  PreparedOperation,
  SwapIntent,
  SwapSubmissionResult,
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
  } as PrepareOperationInput);

  if ("completed" in result) {
    throw new Web3AgentError({
      code: "ORBS_QUOTE_ERROR",
      message: "SWAP preparation completed unexpectedly without returning an intent",
    });
  }

  return getCompatibilityIntent<SwapIntent>(result, "swap");
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
