import { assertRecord } from "../operations/validation.js";
import { Web3AgentError } from "./errors.js";
import {
  clearLifiChainsCache,
  prepareBridgeOperation,
  prepareCompatibilityBridgeIntent,
  resumeLifiBridgeOperation,
} from "./operations/lifi.js";
import {
  getRequiredApprovals,
  prepareLimitOperation,
  prepareSwapOperation,
  prepareTwapOperation,
  resumeOrbsOrderOperation,
  resumeOrbsSwapOperation,
  submitSignedSwapDirect,
  submitSignedTwapOrderDirect,
} from "./operations/orbs.js";
import { mergeActionResults } from "./operations/shared.js";
import {
  goatResumeStateStateSchema,
  prepareOperationSchema,
  resumeOperationSchema,
} from "./schemas.js";
import type {
  GoatToolOperationInput,
  PrepareBridgeIntentInput,
  PrepareOperationInput,
  PrepareOperationResult,
  ResumeOperationInput,
  ResumeOperationResult,
  SubmitSignedSwapInput,
  SubmitSignedTwapOrderInput,
  SwapSubmissionResult,
  TwapOrderResult,
} from "./types.js";
import { parseInput } from "./validation.js";

export { clearLifiChainsCache, prepareCompatibilityBridgeIntent };
export { getRequiredApprovals };

export async function prepareOperation(
  params: PrepareOperationInput
): Promise<PrepareOperationResult> {
  const input = parseInput(prepareOperationSchema, params);

  switch (input.integration) {
    case "orbs":
      if (input.kind === "swap") {
        return prepareSwapOperation(input);
      }
      if (input.kind === "twap") {
        return prepareTwapOperation(input);
      }
      return prepareLimitOperation(input);
    case "lifi":
      return prepareBridgeOperation(input);
    case "goat": {
      const { prepareOrResumeGoatOperation } = await import("../operations/goat.js");
      return prepareOrResumeGoatOperation({
        input: input as GoatToolOperationInput,
      });
    }
  }
}

export async function resumeOperation(
  params: ResumeOperationInput
): Promise<ResumeOperationResult> {
  const input = parseInput(resumeOperationSchema, params);
  const resumeState = input.resumeState;
  const state = assertRecord(resumeState.state, "resumeState.state");
  const actionResults = mergeActionResults(state, input.actionResults);

  if (resumeState.integration === "goat") {
    const { prepareOrResumeGoatOperation } = await import("../operations/goat.js");
    const goatState = parseInput(goatResumeStateStateSchema, state);
    const goatInput = parseInput(prepareOperationSchema, {
      integration: "goat",
      kind: "tool",
      toolName: goatState.toolName,
      params: goatState.params,
      chainId: goatState.chainId,
      account: goatState.account,
    }) as GoatToolOperationInput;
    const result = await prepareOrResumeGoatOperation({
      input: goatInput,
      actionResults,
    });

    if ("completed" in result) {
      return result;
    }

    return {
      completed: false,
      operation: result,
    };
  }

  if (resumeState.integration === "orbs" && resumeState.kind === "swap") {
    return resumeOrbsSwapOperation(resumeState, actionResults);
  }

  if (
    resumeState.integration === "orbs" &&
    (resumeState.kind === "twap" || resumeState.kind === "limit")
  ) {
    return resumeOrbsOrderOperation(resumeState, actionResults);
  }

  if (resumeState.integration === "lifi" && resumeState.kind === "bridge") {
    return resumeLifiBridgeOperation(resumeState, actionResults);
  }

  throw new Web3AgentError({
    code: "INVALID_PARAMS",
    message: "Unsupported resume state",
  });
}

export async function prepareBridgeIntent(
  params: PrepareBridgeIntentInput
): Promise<Awaited<ReturnType<typeof prepareCompatibilityBridgeIntent>>> {
  return prepareCompatibilityBridgeIntent(params);
}

export async function submitSignedSwap(
  params: SubmitSignedSwapInput
): Promise<SwapSubmissionResult> {
  return submitSignedSwapDirect(params);
}

export async function submitSignedTwapOrder(
  params: SubmitSignedTwapOrderInput
): Promise<TwapOrderResult> {
  return submitSignedTwapOrderDirect(params);
}
