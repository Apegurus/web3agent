import { keccak256 } from "viem";
import { Web3AgentError } from "../errors.js";
import { lifiBridgeResumeStateStateSchema } from "../schemas.js";
import type {
  OperationActionResult,
  OperationResumeState,
  PreparedOperation,
  PreparedTransactionAction,
  ResumeOperationCompletedResult,
} from "../types.js";
import { parseInput } from "../validation.js";
import { prepareBridgeOperation } from "./lifi-bridge-prepare.js";
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
  const persistedState = parseInput(lifiBridgeResumeStateStateSchema, resumeState.state);
  if (!persistedState.operation) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: "Legacy LI.FI resume state cannot be authenticated; prepare the bridge again",
    });
  }
  const persistedFinalization =
    (persistedState.finalization as LifiBridgeFinalization | undefined) ??
    ({ kind: "none" } satisfies LifiBridgeFinalization);
  assertPersistedFinalizationBound(persistedState, persistedFinalization);
  const persistedFinalResult = actionResults[persistedState.finalAction.id];
  if (persistedFinalResult?.type === "transaction") {
    const finalTransaction =
      persistedFinalization.kind === "permit2"
        ? await assertConfirmedLifiPermit2Transaction(
            actionResults,
            persistedState.finalAction,
            persistedFinalization
          )
        : await assertConfirmedTransactionResult(actionResults, persistedState.finalAction);
    if (!finalTransaction) {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: "LI.FI final transaction result is missing",
      });
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
  const canonicalState = parseInput(
    lifiBridgeResumeStateStateSchema,
    (await prepareBridgeOperation(persistedState.operation)).resumeState.state
  );
  const canonicalFinalization =
    (canonicalState.finalization as LifiBridgeFinalization | undefined) ??
    ({ kind: "none" } satisfies LifiBridgeFinalization);
  assertCanonicalFinalization(persistedFinalization, canonicalFinalization);
  const hasBoundPermitResult =
    persistedFinalization.kind === "permit2" &&
    (actionResults[persistedFinalization.signatureActionId]?.type === "signature" ||
      actionResults[canonicalState.finalAction.id]?.type === "transaction");
  if (hasBoundPermitResult && persistedFinalization.kind === "permit2") {
    if (actionResults[persistedFinalization.signatureActionId]?.type === "signature") {
      rewriteFinalBridgeAction(persistedState.finalAction, persistedFinalization, actionResults);
    }
    assertCanonicalFinalAction(persistedState.finalAction, canonicalState.finalAction);
  }
  const bridgeState = {
    ...canonicalState,
    ...(hasBoundPermitResult ? { finalization: persistedFinalization } : {}),
  };
  const finalization =
    (bridgeState.finalization as LifiBridgeFinalization | undefined) ??
    ({ kind: "none" } satisfies LifiBridgeFinalization);
  const canonicalResumeState: OperationResumeState = {
    ...resumeState,
    state: bridgeState,
  };

  const finalResult = actionResults[bridgeState.finalAction.id];
  for (const stage of bridgeState.stages) {
    const actions = finalResult?.type === "transaction" ? [] : stage;
    const pendingStageActions = await getPendingPreparedActions(actions, actionResults);
    if (pendingStageActions.length > 0) {
      return {
        completed: false,
        operation: toPendingOperation(
          canonicalResumeState,
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
        canonicalResumeState,
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

function assertPersistedFinalizationBound(
  state: ReturnType<typeof lifiBridgeResumeStateStateSchema.parse>,
  finalization: LifiBridgeFinalization
): void {
  if (finalization.kind === "none") return;
  const operation = state.operation;
  const data = state.finalAction.tx.data;
  const signatureStageExists = state.stages.some((stage) =>
    stage.some((action) => action.id === finalization.signatureActionId)
  );
  if (
    !operation ||
    operation.account.toLowerCase() !== finalization.account.toLowerCase() ||
    operation.fromToken.toLowerCase() !== finalization.tokenAddress.toLowerCase() ||
    operation.fromAmount !== finalization.amount ||
    !signatureStageExists
  ) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "LI.FI Permit2 finalization does not match canonical replanning",
    });
  }
  if (state.finalAction.tx.to.toLowerCase() !== finalization.diamondAddress.toLowerCase()) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "resumeState.state.finalAction.tx.to does not match the signed Permit2 witness",
    });
  }
  if (!data || keccak256(data) !== finalization.diamondCalldataHash) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "resumeState.state.finalAction.tx.data does not match the signed Permit2 witness",
    });
  }
}

function withoutSignatures(
  actionResults: Record<string, OperationActionResult>
): Record<string, OperationActionResult> {
  return Object.fromEntries(
    Object.entries(actionResults).filter(([, result]) => result.type === "transaction")
  );
}

function assertCanonicalFinalAction(
  persisted: PreparedTransactionAction,
  canonical: PreparedTransactionAction
): void {
  if (persisted.tx.data !== canonical.tx.data) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "resumeState.state.finalAction.tx.data does not match the signed Permit2 witness",
    });
  }
  if (
    persisted.id !== canonical.id ||
    persisted.tx.chainId !== canonical.tx.chainId ||
    persisted.tx.from?.toLowerCase() !== canonical.tx.from?.toLowerCase() ||
    persisted.tx.to.toLowerCase() !== canonical.tx.to.toLowerCase() ||
    (persisted.tx.value ?? "0") !== (canonical.tx.value ?? "0")
  ) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "LI.FI Permit2 transaction facts do not match the canonical replanned action",
    });
  }
}

function assertCanonicalFinalization(
  persisted: LifiBridgeFinalization,
  canonical: LifiBridgeFinalization
): void {
  const matches =
    persisted.kind === canonical.kind &&
    (persisted.kind === "none" ||
      (canonical.kind === "permit2" &&
        persisted.signatureActionId === canonical.signatureActionId &&
        persisted.tokenAddress.toLowerCase() === canonical.tokenAddress.toLowerCase() &&
        persisted.amount === canonical.amount &&
        persisted.permit2Proxy.toLowerCase() === canonical.permit2Proxy.toLowerCase() &&
        persisted.permit2.toLowerCase() === canonical.permit2.toLowerCase() &&
        persisted.account.toLowerCase() === canonical.account.toLowerCase() &&
        persisted.diamondAddress.toLowerCase() === canonical.diamondAddress.toLowerCase() &&
        persisted.diamondCalldataHash === canonical.diamondCalldataHash));
  if (!matches) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "LI.FI Permit2 finalization does not match canonical replanning",
    });
  }
}
