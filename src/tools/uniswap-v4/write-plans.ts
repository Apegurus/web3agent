import { createHash } from "node:crypto";

import { type Hex, hashTypedData, keccak256 } from "viem";

import type { UniswapV4LifecycleOperation } from "../../api/types.js";
import type { UniswapV4Deployment } from "../../uniswap-v4/deployments.js";
import { permit2Types } from "../../uniswap-v4/permit-actions.js";
import type {
  UniswapV4AddPlan,
  UniswapV4AddPlanAction,
  UniswapV4PositionManagerAction,
  UniswapV4RemovePlan,
} from "../../uniswap-v4/planner-types.js";
import { canonicalJson } from "../../utils/canonical-json.js";
import { uniswapV4PersistedWritePlanSchema } from "./write-schemas.js";
import type { UniswapV4PersistedWritePlan } from "./write-schemas.js";

type PlannerPlan = UniswapV4AddPlan | UniswapV4RemovePlan;
type PlannerAction = UniswapV4AddPlanAction | UniswapV4PositionManagerAction;
type UnhashedPlan = Omit<UniswapV4PersistedWritePlan, "planHash">;

const EMPTY_HASH = `0x${"00".repeat(32)}` as const;

export function createPersistedUniswapV4WritePlan(input: {
  readonly deployment: UniswapV4Deployment;
  readonly operation: UniswapV4LifecycleOperation;
  readonly plan: PlannerPlan;
}): UniswapV4PersistedWritePlan {
  const deployment = canonicalDeployment(input.deployment);
  const candidate = uniswapV4PersistedWritePlanSchema.parse({
    account: input.operation.account,
    actions: input.plan.actions.map(serializeAction),
    deployment,
    deploymentHash: hashUniswapV4Deployment(deployment),
    expectedDeltas: input.plan.expectedDeltas,
    ...("expectedNftState" in input.plan ? { expectedNftState: input.plan.expectedNftState } : {}),
    operation: input.operation,
    planHash: EMPTY_HASH,
    poolId: input.plan.poolId,
    sourceBlock: input.plan.sourceBlock,
    version: 1,
  });
  return uniswapV4PersistedWritePlanSchema.parse({
    ...candidate,
    planHash: hashUniswapV4WritePlan(candidate),
  });
}

function canonicalDeployment(
  deployment: UniswapV4Deployment
): Pick<
  UniswapV4Deployment,
  "chainId" | "permit2" | "poolManager" | "positionManager" | "stateView"
> {
  return {
    chainId: deployment.chainId,
    permit2: deployment.permit2,
    poolManager: deployment.poolManager,
    positionManager: deployment.positionManager,
    stateView: deployment.stateView,
  };
}

export function hashUniswapV4WritePlan(plan: UnhashedPlan): Hex {
  const immutable = Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "planHash"));
  return hashCanonical(immutable);
}

export function hashUniswapV4Deployment(
  deployment: Pick<
    UniswapV4Deployment,
    "chainId" | "permit2" | "poolManager" | "positionManager" | "stateView"
  >
): Hex {
  return hashCanonical({
    chainId: deployment.chainId,
    permit2: deployment.permit2,
    poolManager: deployment.poolManager,
    positionManager: deployment.positionManager,
    stateView: deployment.stateView,
  });
}

function serializeAction(action: PlannerAction) {
  switch (action.kind) {
    case "erc20Approval":
      return {
        amount: action.amount.toString(),
        data: action.data,
        dataHash: keccak256(action.data),
        kind: action.kind,
        spender: action.spender,
        to: action.to,
        token: action.token,
        value: action.value.toString(),
      };
    case "permit2Signature":
      return {
        domain: action.domain,
        kind: action.kind,
        message: {
          details: action.message.details.map((detail) => ({
            amount: detail.amount.toString(),
            expiration: detail.expiration.toString(),
            nonce: detail.nonce.toString(),
            token: detail.token,
          })),
          sigDeadline: action.message.sigDeadline.toString(),
          spender: action.message.spender,
        },
        primaryType: action.primaryType,
        typedDataHash: hashTypedData({
          domain: action.domain,
          message: {
            details: action.message.details.map((detail) => ({
              amount: detail.amount,
              expiration: Number(detail.expiration),
              nonce: Number(detail.nonce),
              token: detail.token,
            })),
            sigDeadline: action.message.sigDeadline,
            spender: action.message.spender,
          },
          primaryType: action.primaryType,
          types: permit2Types,
        }),
      };
    case "poolInitialization":
    case "positionManager":
      return {
        data: action.data,
        dataHash: keccak256(action.data),
        kind: action.kind,
        to: action.to,
        value: action.value.toString(),
      };
  }
}

function hashCanonical(value: unknown): Hex {
  return `0x${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
