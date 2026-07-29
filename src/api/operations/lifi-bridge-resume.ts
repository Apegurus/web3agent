import { lifiBridgeResumeStateStateSchema } from "../schemas.js";
import type {
  OperationActionResult,
  OperationResumeState,
  PreparedOperation,
  ResumeOperationCompletedResult,
} from "../types.js";
import { parseInput } from "../validation.js";
import type { LifiBridgeFinalization } from "./lifi-facts.js";
import { assertConfirmedLifiPermit2Transaction } from "./lifi-permit2-receipt.js";
import { rewriteFinalBridgeAction } from "./lifi-permit2.js";
import {
  assertConfirmedTransactionResult,
  getPendingPreparedActions,
  toPendingOperation,
} from "./shared.js";

export async function resumeLifiBridgeOperation(
  resumeState: OperationResumeState,
  actionResults: Record<string, OperationActionResult>
): Promise<ResumeOperationCompletedResult | { completed: false; operation: PreparedOperation }> {
  const bridgeState = parseInput(lifiBridgeResumeStateStateSchema, resumeState.state);
  const finalization =
    (bridgeState.finalization as LifiBridgeFinalization | undefined) ??
    ({ kind: "none" } satisfies LifiBridgeFinalization);

  const finalResult = actionResults[bridgeState.finalAction.id];
  for (const stage of bridgeState.stages) {
    const actions =
      finalization.kind === "permit2" && finalResult?.type === "transaction"
        ? stage.filter((action) => action.type !== "signTypedData")
        : stage;
    const pendingStageActions = await getPendingPreparedActions(actions, actionResults);
    if (pendingStageActions.length > 0) {
      return {
        completed: false,
        operation: toPendingOperation(
          resumeState,
          pendingStageActions,
          "Resume LI.FI bridge",
          actionResults
        ),
      };
    }
  }

  const rewrittenFinalAction =
    finalization.kind === "permit2" && finalResult?.type === "transaction"
      ? bridgeState.finalAction
      : rewriteFinalBridgeAction(bridgeState.finalAction, finalization, actionResults);
  const finalTransaction =
    finalization.kind === "permit2"
      ? await assertConfirmedLifiPermit2Transaction(
          actionResults,
          bridgeState.finalAction,
          finalization
        )
      : await assertConfirmedTransactionResult(actionResults, rewrittenFinalAction);
  if (!finalTransaction) {
    return {
      completed: false,
      operation: toPendingOperation(
        resumeState,
        [rewrittenFinalAction],
        "Resume LI.FI bridge",
        withoutSignatures(actionResults)
      ),
    };
  }

  return {
    completed: true,
    integration: "lifi",
    kind: "bridge",
    result: {
      status: "completed",
      message: "Bridge steps executed externally",
      txHash: finalTransaction.txHash,
    },
  };
}

function withoutSignatures(
  actionResults: Record<string, OperationActionResult>
): Record<string, OperationActionResult> {
  return Object.fromEntries(
    Object.entries(actionResults).filter(([, result]) => result.type === "transaction")
  );
}
