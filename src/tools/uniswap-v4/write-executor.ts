import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { Web3AgentError } from "../../api/errors.js";
import { getUniswapV4Deployment } from "../../uniswap-v4/deployments.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { buildWriteContext, isWriteContext } from "../shared/write-context.js";
import { assertUniswapV4WriteTargets } from "./write-plan-integrity.js";
import { hashUniswapV4Deployment, hashUniswapV4WritePlan } from "./write-plans.js";
import { reconcileUniswapV4Write } from "./write-reconciliation.js";
import { uniswapV4PersistedWritePlanSchema } from "./write-schemas.js";
import type { UniswapV4PersistedWritePlan } from "./write-schemas.js";
import {
  StageExecutionError,
  type StageReceipt,
  executeUniswapV4Stages,
} from "./write-stage-execution.js";

export async function executeUniswapV4WritePlan(
  rawParams: Record<string, unknown>
): Promise<CallToolResult> {
  const parsed = uniswapV4PersistedWritePlanSchema.safeParse(rawParams);
  if (!parsed.success)
    return formatToolError(
      "UNISWAP_V4_PLAN_INVALID",
      "Persisted Uniswap v4 write plan is malformed"
    );
  const receipts: StageReceipt[] = [];
  try {
    assertPlanIntegrity(parsed.data);
    const context = buildWriteContext(parsed.data.operation.chainId);
    if (!isWriteContext(context)) return context;
    if (context.account.address.toLowerCase() !== parsed.data.account.toLowerCase()) {
      throw new Web3AgentError({
        code: "UNISWAP_V4_PLAN_WALLET_MISMATCH",
        message: "Active wallet does not match the wallet bound to the persisted Uniswap v4 plan",
      });
    }
    const transactionHash = await executeUniswapV4Stages(context, parsed.data, receipts);
    const reconciliation = await reconcileUniswapV4Write({
      context,
      plan: parsed.data,
      transactionHash,
    });
    return formatToolResponse({
      expectedDeltas: parsed.data.expectedDeltas,
      operation: parsed.data.operation.kind,
      receipts,
      reconciliation,
      status: "completed",
    });
  } catch (error: unknown) {
    if (error instanceof StageExecutionError)
      return formatToolError("UNISWAP_V4_EXECUTION_FAILED", error.message, {
        receipts: error.receipts,
        stage: error.stage,
      });
    if (error instanceof Web3AgentError)
      return formatToolError(error.code, error.message, error.details);
    return formatToolError("UNISWAP_V4_EXECUTION_FAILED", "Uniswap v4 write execution failed", {
      receipts,
      stage: "unknown",
    });
  }
}

function assertPlanIntegrity(plan: UniswapV4PersistedWritePlan): void {
  const deployment = getUniswapV4Deployment(plan.operation.chainId);
  if (
    hashUniswapV4Deployment(plan.deployment) !== plan.deploymentHash ||
    hashUniswapV4Deployment(deployment) !== plan.deploymentHash
  ) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_DEPLOYMENT_HASH_MISMATCH",
      message: "Persisted plan deployment does not match the canonical verified deployment",
    });
  }
  if (hashUniswapV4WritePlan(plan) !== plan.planHash) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_PLAN_HASH_MISMATCH",
      message: "Persisted Uniswap v4 plan hash does not match its exact action data",
    });
  }
  if (BigInt(plan.operation.deadline) <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_DEADLINE_EXPIRED",
      message: "Persisted Uniswap v4 plan deadline has expired",
    });
  }
  if (plan.operation.kind === "burn" && plan.expectedNftState !== "burned") {
    throw new Web3AgentError({
      code: "UNISWAP_V4_PLAN_NFT_STATE_INVALID",
      message: "Burn plans must persist an expected burned NFT state",
    });
  }
  assertUniswapV4WriteTargets(plan, deployment);
}
