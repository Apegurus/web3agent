import type { Hex } from "viem";

import { assertHex } from "../../operations/validation.js";
import { assertUniswapV4WriteTargets } from "../../tools/uniswap-v4/write-plan-integrity.js";
import { prepareExternalUniswapV4WritePlan } from "../../tools/uniswap-v4/write-planner.js";
import { uniswapV4PersistedWritePlanSchema } from "../../tools/uniswap-v4/write-schemas.js";
import { getUniswapV4Deployment } from "../../uniswap-v4/deployments.js";
import {
  uniswapV4LifecycleOperationSchema,
  uniswapV4OperationResumeStateSchema,
  uniswapV4ProgressSchema,
} from "../schemas/uniswap-v4/lifecycle.js";
import type {
  OperationActionResult,
  OperationResumeState,
  PreparedAction,
  PreparedOperation,
  PreparedTransactionAction,
  UniswapV4LifecycleOperation,
} from "../types.js";
import { parseInput } from "../validation.js";
import { invalid } from "./uniswap-v4-facts.js";
import {
  type Progress,
  actionId,
  canonicalActionIds,
  completed,
  initialState,
  nextAction,
  pending,
  stateWithProgress,
} from "./uniswap-v4-resume-state.js";
import { acceptSignature } from "./uniswap-v4-signature-validation.js";
import {
  assertPostTransactionState,
  verifyTransaction,
} from "./uniswap-v4-transaction-verification.js";

export async function prepareUniswapV4Operation(
  input: UniswapV4LifecycleOperation
): Promise<PreparedOperation> {
  const plan = await prepareExternalUniswapV4WritePlan(input);
  const state = initialState(plan);
  const action = nextAction(plan, uniswapV4ProgressSchema.parse(state.progress));
  if (!action) throw invalid("Uniswap v4 lifecycle has no executable stage");
  return pending(plan, state, action).operation;
}

export async function resumeUniswapV4Operation(
  resumeState: OperationResumeState,
  suppliedResults: Record<string, OperationActionResult>
) {
  const state = parseInput(uniswapV4OperationResumeStateSchema, resumeState).state;
  const operation = uniswapV4LifecycleOperationSchema.parse(state.operation);
  const plan = await prepareExternalUniswapV4WritePlan(operation);
  assertPersistedPlanMatchesCanonical(state.plan, plan);
  assertActionIds(state.actionIds, canonicalActionIds(plan));
  const progress = uniswapV4ProgressSchema.parse(state.progress);
  await assertProgressIntegrity(plan, progress);
  const action = nextAction(plan, progress);
  if (!action) return completed(plan, progress);
  assertOnlyCurrentResult(suppliedResults, action.id);
  const result = suppliedResults[action.id];
  if (!result) return pending(plan, stateWithProgress(state, progress), action);
  const advanced = await advanceOneStage(plan, progress, action, result);
  const next = advanced.nextAction ?? nextAction(plan, advanced.progress);
  if (!next) return completed(plan, advanced.progress);
  return pending(plan, stateWithProgress(state, advanced.progress), next);
}

async function assertProgressIntegrity(
  plan: Awaited<ReturnType<typeof prepareExternalUniswapV4WritePlan>>,
  progress: Progress
): Promise<void> {
  const ids = canonicalActionIds(plan);
  if (progress.nextActionIndex > ids.length)
    throw invalid("Uniswap v4 resume progress index is outside the canonical action sequence");
  const prefix = ids
    .slice(0, progress.nextActionIndex)
    .filter((id) => !isSignatureAction(plan, id));
  const completedIds = Object.keys(progress.completed);
  if (
    completedIds.length !== prefix.length ||
    completedIds.some((id, index) => id !== prefix[index])
  )
    throw invalid("Uniswap v4 resume completed stages must be a contiguous canonical prefix");
  for (const id of prefix) {
    const stage = progress.completed[id];
    if (!stage) throw invalid("Uniswap v4 resume progress references an impossible action stage");
    await verifyTransaction(plan, id, {
      status: "confirmed",
      txHash: stage.txHash,
      type: "transaction",
    });
    await assertPostTransactionState(plan, id);
  }
}

async function advanceOneStage(
  plan: Awaited<ReturnType<typeof prepareExternalUniswapV4WritePlan>>,
  progress: Progress,
  action: PreparedAction,
  result: OperationActionResult
): Promise<{ readonly nextAction?: PreparedTransactionAction; readonly progress: Progress }> {
  const nextActionIndex = progress.nextActionIndex + 1;
  if (action.type === "signTypedData") {
    if (result.type !== "signature")
      throw invalid(`Action result ${action.id} must be a signature`);
    const planned = plan.actions.find((_, index) => actionId(plan, index) === action.id);
    if (!planned || (planned.kind !== "permit2Signature" && planned.kind !== "nftPermitSignature"))
      throw invalid("Uniswap v4 signature stage is malformed");
    const accepted = await acceptSignature(
      plan,
      planned,
      assertHex(result.signature, "actionResults.signature")
    );
    const derivedId =
      planned.kind === "permit2Signature" ? `${action.id}:submit` : planned.finalActionId;
    return {
      nextAction: {
        id: derivedId,
        label: "Submit verified authorization",
        tx: {
          chainId: plan.operation.chainId,
          data: accepted.transaction.data,
          from: plan.account,
          to: accepted.transaction.to,
          value: accepted.transaction.value,
        },
        type: "transaction",
      },
      progress: {
        completed: progress.completed,
        nextActionIndex,
      },
    };
  }
  if (action.type !== "transaction" || result.type !== "transaction")
    throw invalid(`Action result ${action.id} must be a transaction`);
  await verifyTransaction(plan, action.id, result);
  await assertPostTransactionState(plan, action.id);
  if (action.tx.value === undefined)
    throw invalid("Uniswap v4 transaction action has no native value");
  return {
    progress: {
      completed: {
        ...progress.completed,
        [action.id]: {
          dataHash: completionHash(plan, action.id),
          kind: "transaction",
          to: action.tx.to,
          txHash: result.txHash as Hex,
          value: action.tx.value,
        },
      },
      nextActionIndex,
    },
  };
}

function isSignatureAction(
  plan: Awaited<ReturnType<typeof prepareExternalUniswapV4WritePlan>>,
  id: string
): boolean {
  return plan.actions.some(
    (action, index) =>
      actionId(plan, index) === id &&
      (action.kind === "permit2Signature" || action.kind === "nftPermitSignature")
  );
}

function completionHash(
  plan: Awaited<ReturnType<typeof prepareExternalUniswapV4WritePlan>>,
  id: string
): Hex {
  const signature = plan.actions.find(
    (action) =>
      (action.kind === "permit2Signature" &&
        `${actionId(plan, plan.actions.indexOf(action))}:submit` === id) ||
      (action.kind === "nftPermitSignature" && action.finalActionId === id)
  );
  if (signature?.kind === "permit2Signature" || signature?.kind === "nftPermitSignature")
    return assertHex(signature.typedDataHash, "canonical authorization hash");
  const action = plan.actions.find((_, index) => actionId(plan, index) === id);
  if (!action || action.kind === "permit2Signature" || action.kind === "nftPermitSignature")
    throw invalid("Uniswap v4 transaction completion has no canonical hash");
  return assertHex(action.dataHash, "canonical transaction data hash");
}

function assertPersistedPlanMatchesCanonical(
  persistedValue: Record<string, unknown>,
  canonical: Awaited<ReturnType<typeof prepareExternalUniswapV4WritePlan>>
): void {
  const persisted = uniswapV4PersistedWritePlanSchema.parse(persistedValue);
  if (persisted.planHash !== canonical.planHash)
    throw invalid(
      "Uniswap v4 persisted plan does not match the canonical replanned action sequence"
    );
  assertUniswapV4WriteTargets(canonical, getUniswapV4Deployment(canonical.operation.chainId));
}

function assertActionIds(actual: readonly string[], expected: readonly string[]): void {
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index]))
    throw invalid("Uniswap v4 resume action IDs do not match the canonical plan");
}

function assertOnlyCurrentResult(results: Record<string, OperationActionResult>, id: string): void {
  const keys = Object.keys(results);
  if (keys.length > 1 || (keys.length === 1 && keys[0] !== id))
    throw invalid("Uniswap v4 resume accepts exactly one result for the next action");
}
