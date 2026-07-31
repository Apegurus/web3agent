import { assertRecord } from "../operations/validation.js";
import { Web3AgentError } from "./errors.js";
import {
  prepareLifiSameChainSwapOperation,
  resumeLifiSameChainSwapOperation,
} from "./operations/lifi-same-chain.js";
import {
  clearLifiChainsCache,
  prepareBridgeOperation,
  prepareCompatibilityBridgeIntent,
  resumeLifiBridgeOperation,
} from "./operations/lifi.js";
import {
  getRequiredApprovals,
  prepareOrderOperation,
  prepareSwapOperation,
  resumeOrbsSwapOperation,
  resumeSpotOrderOperation,
  submitSignedSwapDirect,
} from "./operations/orbs.js";
import { mergeActionResults } from "./operations/shared.js";
import { prepareUniswapV4Operation, resumeUniswapV4Operation } from "./operations/uniswap-v4.js";
import { prepareZeroExSwapOperation, resumeZeroExSwapOperation } from "./operations/zerox.js";
import {
  goatResumeStateStateSchema,
  prepareOperationSchema,
  resumeOperationSchema,
  uniswapV4LifecycleOperationSchema,
} from "./schemas.js";
import type {
  GoatToolOperationInput,
  PrepareBridgeIntentInput,
  PrepareOperationInput,
  PrepareOperationResult,
  ResumeOperationInput,
  ResumeOperationResult,
  SubmitSignedSwapInput,
  SwapSubmissionResult,
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
      return prepareOrderOperation(input);
    case "lifi":
      return input.kind === "swap"
        ? prepareLifiSameChainSwapOperation(input)
        : prepareBridgeOperation(input);
    case "zeroex":
      return prepareZeroExSwapOperation(input);
    case "goat": {
      const { prepareOrResumeGoatOperation } = await import("../operations/goat.js");
      return prepareOrResumeGoatOperation({
        input: input as GoatToolOperationInput,
      });
    }
    case "uniswap-v4":
      await initializeRuntime();
      return prepareUniswapV4Operation(uniswapV4LifecycleOperationSchema.parse(input));
    default:
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: "Unsupported prepared operation integration",
      });
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

  if (resumeState.integration === "orbs" && resumeState.kind === "order") {
    return resumeSpotOrderOperation(resumeState, actionResults);
  }

  if (resumeState.integration === "lifi" && resumeState.kind === "bridge") {
    return resumeLifiBridgeOperation(resumeState, actionResults);
  }

  if (resumeState.integration === "lifi" && resumeState.kind === "swap") {
    return resumeLifiSameChainSwapOperation(resumeState, actionResults);
  }

  if (resumeState.integration === "zeroex" && resumeState.kind === "swap") {
    return resumeZeroExSwapOperation(resumeState, actionResults);
  }

  if (resumeState.integration === "uniswap-v4") {
    await initializeRuntime();
    return resumeUniswapV4Operation(resumeState, actionResults);
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

async function initializeRuntime(): Promise<void> {
  const { getRuntime } = await import("./shared.js");
  await getRuntime();
}
