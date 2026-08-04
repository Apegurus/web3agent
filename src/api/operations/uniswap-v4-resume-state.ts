import type { Address, Hex } from "viem";

import type { UniswapV4PersistedWritePlan } from "../../tools/uniswap-v4/write-schemas.js";
import type { uniswapV4ProgressSchema } from "../schemas/uniswap-v4/lifecycle.js";
import type {
  PreparedAction,
  PreparedOperation,
  PreparedTransactionAction,
  UniswapV4LifecycleOperation,
} from "../types.js";
import { buildPreparedOperation } from "./shared.js";
import { facts, invalid } from "./uniswap-v4-facts.js";
export { completed } from "./uniswap-v4-completion.js";
import { nftPermitTypedData, permitTypedData } from "./uniswap-v4-signature-validation.js";

export type PlanAction = UniswapV4PersistedWritePlan["actions"][number];
export type Progress = ReturnType<typeof uniswapV4ProgressSchema.parse>;

export function initialState(plan: UniswapV4PersistedWritePlan): Record<string, unknown> {
  return {
    actionIds: canonicalActionIds(plan),
    actionResults: {},
    chainId: plan.operation.chainId,
    expectedDeltas: plan.expectedDeltas,
    operationId: plan.planHash,
    plan,
    operation: plan.operation,
    progress: { completed: {}, nextActionIndex: 0 },
    sourceBlock: plan.sourceBlock,
    stateVersion: 3,
    typedDataHashes: plan.actions.flatMap((action) =>
      action.kind === "permit2Signature" || action.kind === "nftPermitSignature"
        ? [action.typedDataHash]
        : []
    ),
  };
}

export function stateWithProgress(
  state: Record<string, unknown>,
  progress: Progress
): Record<string, unknown> {
  return { ...state, actionResults: {}, progress };
}

export function pending(
  plan: UniswapV4PersistedWritePlan,
  state: Record<string, unknown>,
  action: PreparedAction
): { readonly completed: false; readonly operation: PreparedOperation } {
  return { completed: false, operation: buildPendingOperation(plan.operation.kind, action, state) };
}

function buildPendingOperation(
  kind: UniswapV4LifecycleOperation["kind"],
  action: PreparedAction,
  state: Record<string, unknown>
): PreparedOperation {
  switch (kind) {
    case "mint":
      return buildPreparedOperation(
        "uniswap-v4",
        "mint",
        "Resume Uniswap v4 lifecycle",
        [action],
        state
      );
    case "increase":
      return buildPreparedOperation(
        "uniswap-v4",
        "increase",
        "Resume Uniswap v4 lifecycle",
        [action],
        state
      );
    case "decrease":
      return buildPreparedOperation(
        "uniswap-v4",
        "decrease",
        "Resume Uniswap v4 lifecycle",
        [action],
        state
      );
    case "collect":
      return buildPreparedOperation(
        "uniswap-v4",
        "collect",
        "Resume Uniswap v4 lifecycle",
        [action],
        state
      );
    case "burn":
      return buildPreparedOperation(
        "uniswap-v4",
        "burn",
        "Resume Uniswap v4 lifecycle",
        [action],
        state
      );
  }
}

export function canonicalActionIds(plan: UniswapV4PersistedWritePlan): string[] {
  return plan.actions.flatMap((action, index) => {
    const id = actionId(plan, index);
    return action.kind === "permit2Signature" ? [id, `${id}:submit`] : [id];
  });
}

export function actionId(plan: UniswapV4PersistedWritePlan, index: number): string {
  return `uniswap-v4:${plan.operation.kind}:${index}`;
}

export function nextAction(
  plan: UniswapV4PersistedWritePlan,
  progress: Progress
): PreparedAction | undefined {
  const id = canonicalActionIds(plan)[progress.nextActionIndex];
  if (!id) return undefined;
  for (const [index, action] of plan.actions.entries()) {
    const baseId = actionId(plan, index);
    if (baseId === id) return plannedAction(plan, action, baseId);
    if (action.kind === "permit2Signature" && `${baseId}:submit` === id) {
      return transactionAction(
        id,
        "Report confirmed Permit2 authorization submission",
        plan.operation.chainId,
        plan.account,
        { dataHash: "0x", to: plan.deployment.permit2, value: "0" }
      );
    }
    if (action.kind === "nftPermitSignature" && action.finalActionId === id) {
      return transactionAction(
        id,
        "Report confirmed permit-authorized PositionManager lifecycle",
        plan.operation.chainId,
        plan.account,
        facts(action.unsignedFinal)
      );
    }
  }
  throw invalid("Uniswap v4 progress references an unknown canonical action");
}

function plannedAction(
  plan: UniswapV4PersistedWritePlan,
  action: PlanAction,
  id: string
): PreparedAction {
  switch (action.kind) {
    case "erc20Approval":
      return transactionAction(
        id,
        "Approve token for Permit2",
        plan.operation.chainId,
        plan.account,
        facts(action)
      );
    case "poolInitialization":
      return transactionAction(
        id,
        "Initialize Uniswap v4 pool",
        plan.operation.chainId,
        plan.account,
        facts(action)
      );
    case "positionManager":
      return transactionAction(
        id,
        "Execute Uniswap v4 PositionManager lifecycle",
        plan.operation.chainId,
        plan.account,
        facts(action)
      );
    case "permit2Signature":
      return {
        chainId: plan.operation.chainId,
        eip712: permitTypedData(action),
        id,
        label: "Sign Permit2 authorization",
        type: "signTypedData",
      };
    case "nftPermitSignature":
      return {
        chainId: plan.operation.chainId,
        eip712: nftPermitTypedData(action),
        id,
        label: "Sign PositionManager NFT permit",
        type: "signTypedData",
      };
  }
}

export function transactionAction(
  id: string,
  label: string,
  chainId: number,
  from: Address,
  action: {
    readonly dataHash: Hex;
    readonly to: Address;
    readonly value: string;
    readonly data?: Hex;
  }
): PreparedTransactionAction {
  return {
    id,
    label,
    tx: {
      chainId,
      ...(action.data ? { data: action.data } : {}),
      from,
      to: action.to,
      value: action.value,
    },
    type: "transaction",
  };
}

export function transactionFacts(
  plan: UniswapV4PersistedWritePlan,
  id: string
): { readonly dataHash: Hex; readonly to: Address; readonly value: string } {
  const action = plan.actions.find((_, index) => actionId(plan, index) === id);
  if (!action || action.kind === "permit2Signature" || action.kind === "nftPermitSignature")
    throw invalid("Uniswap v4 transaction facts are unavailable");
  return facts(action);
}
