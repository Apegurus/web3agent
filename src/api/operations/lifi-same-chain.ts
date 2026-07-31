import { lifiSameChainSwapResumeStateStateSchema } from "../schemas.js";
import type {
  LifiSameChainSwapOperationInput,
  OperationActionResult,
  OperationResumeState,
  PreparedOperation,
  ResumeOperationCompletedResult,
} from "../types.js";
import { parseInput } from "../validation.js";
import { prepareBridgeOperation } from "./lifi-bridge-prepare.js";
import { resumeLifiBridgeOperation } from "./lifi-bridge-resume.js";
import {
  assertResumeStateIntegrity,
  authenticatePreparedOperation,
  authenticateResumeState,
} from "./resume-state-integrity.js";

export async function prepareLifiSameChainSwapOperation(
  input: LifiSameChainSwapOperationInput,
  fallback?: { readonly reason: "no-route" | "provider-unavailable" }
): Promise<PreparedOperation> {
  const prepared = await prepareBridgeOperation(input);
  const meta = {
    ...(prepared.meta ?? {}),
    provider: "lifi",
    chainId: 4663,
    ...(fallback ? { fallback: { fromProvider: "zeroex", reason: fallback.reason } } : {}),
  };
  return authenticatePreparedOperation({
    ...prepared,
    kind: "swap",
    summary: "Prepare LI.FI same-chain swap on Robinhood chain 4663",
    resumeState: {
      ...prepared.resumeState,
      kind: "swap",
      state: { ...prepared.resumeState.state, chainId: 4663, meta, operation: input },
    },
    meta,
  });
}

export async function resumeLifiSameChainSwapOperation(
  resumeState: OperationResumeState,
  actionResults: Record<string, OperationActionResult>
): Promise<ResumeOperationCompletedResult | { completed: false; operation: PreparedOperation }> {
  assertResumeStateIntegrity(resumeState);
  const swapState = parseInput(lifiSameChainSwapResumeStateStateSchema, resumeState.state);
  const { chainId: _chainId, ...bridgeState } = swapState;
  const result = await resumeLifiBridgeOperation(
    authenticateResumeState({
      ...resumeState,
      kind: "bridge",
      state: {
        ...bridgeState,
        meta: swapState.meta,
        operation: swapState.operation,
      },
    }),
    actionResults
  );
  if (result.completed) {
    return {
      ...result,
      kind: "swap",
      result: {
        ...result.result,
        message: "Same-chain swap steps executed externally",
        provider: "lifi",
      },
    };
  }
  const meta = swapState.meta ?? { provider: "lifi", chainId: 4663 };
  return {
    completed: false,
    operation: {
      ...result.operation,
      kind: "swap",
      summary: "Resume LI.FI same-chain swap",
      resumeState: authenticateResumeState({
        ...result.operation.resumeState,
        kind: "swap",
        state: {
          ...result.operation.resumeState.state,
          chainId: 4663,
          meta,
          operation: swapState.operation,
        },
      }),
      meta,
    },
  };
}
