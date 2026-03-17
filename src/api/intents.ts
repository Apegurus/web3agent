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
  PrepareLimitIntentInput,
  PrepareOperationInput,
  PrepareOrderIntentInput,
  PrepareSwapIntentInput,
  PrepareTwapIntentInput,
  PreparedOperation,
  SpotOrderIntent,
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

export async function prepareOrderIntent(
  params: PrepareOrderIntentInput
): Promise<SpotOrderIntent> {
  const result = await prepareOperation({
    integration: "orbs",
    kind: "order",
    ...params,
  } as PrepareOperationInput);

  if ("completed" in result) {
    throw new Web3AgentError({
      code: "ORBS_ORDER_ERROR",
      message: "Order preparation completed unexpectedly without returning an intent",
    });
  }

  return getCompatibilityIntent<SpotOrderIntent>(result, "order");
}

export async function prepareTwapIntent(params: PrepareTwapIntentInput): Promise<SpotOrderIntent> {
  const totalAmount = BigInt(params.fromAmount);
  const perChunkAmount = totalAmount / BigInt(params.chunks);

  return prepareOrderIntent({
    ...params,
    fromAmount: perChunkAmount.toString(),
    fromMaxAmount: params.fromAmount,
    epoch: params.fillDelay,
  });
}

export async function prepareLimitIntent(
  params: PrepareLimitIntentInput
): Promise<SpotOrderIntent> {
  const orderParams: PrepareOrderIntentInput = {
    ...params,
    outputLimit: params.toMinAmount,
  };
  if (params.expiry !== undefined) {
    orderParams.deadline = Math.floor(Date.now() / 1000) + params.expiry;
  }
  return prepareOrderIntent(orderParams);
}

export async function submitSignedOrder(params: {
  submitUrl: string;
  order: Record<string, unknown>;
  signature: `0x${string}`;
}): Promise<{ status: string; response: unknown }> {
  const { submitSpotOrder } = await import("../orbs/spot-client.js");
  const { splitSignature } = await import("../utils/signature.js");

  const { r, s, v } = splitSignature(params.signature);
  const result = await submitSpotOrder({
    url: params.submitUrl,
    order: params.order,
    signature: { r, s, v },
  });

  if (!result.ok) {
    throw new Web3AgentError({
      code: "ORBS_ORDER_ERROR",
      message: `Submit failed (${result.status}): ${JSON.stringify(result.response)}`,
    });
  }

  return { status: "submitted", response: result.response };
}
