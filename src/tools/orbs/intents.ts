import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  getRequiredApprovals as getRequiredApprovalsForIntent,
  prepareSwapIntent,
  submitSignedSwap as submitPreparedSwap,
} from "../../api/intents.js";
import { getRequiredApprovals } from "../../api/operations/orbs.js";
import { getSpotError, isSpotSupported } from "../../orbs/chains.js";
import { prepareSpotOrder } from "../../orbs/spot-prepare.js";
import { type TwapToSpotParamsResult, twapParamsToSpotParams } from "../../orbs/twap-compat.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { resolveToolChainId } from "../shared/chain-context.js";
import { createToolHandler } from "../shared/handler-factory.js";
import { limitParamsToSpotParams } from "./helpers.js";
import {
  orbsGetRequiredApprovalsSchema,
  orbsPrepareLimitIntentSchema,
  orbsPrepareOrderIntentSchema,
  orbsPrepareSwapIntentSchema,
  orbsPrepareTwapIntentSchema,
  orbsSubmitSignedSwapSchema,
} from "./schemas.js";

export const orbsPrepareSwapIntentTool = createToolHandler(
  orbsPrepareSwapIntentSchema,
  prepareSwapIntent,
  "ORBS_QUOTE_ERROR"
);

export const orbsGetRequiredApprovalsTool = createToolHandler(
  orbsGetRequiredApprovalsSchema,
  getRequiredApprovalsForIntent,
  "APPROVAL_CHECK_ERROR"
);

export const orbsSubmitSignedSwapTool = createToolHandler(
  orbsSubmitSignedSwapSchema,
  submitPreparedSwap,
  "ORBS_SWAP_ERROR"
);

export async function orbsPrepareOrderIntent(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  const v = validateInput(orbsPrepareOrderIntentSchema, params);
  if (!v.success) return v.error;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isSpotSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getSpotError(chainId));
  }

  try {
    const prepared = prepareSpotOrder({
      chainId,
      swapper: v.data.account,
      fromToken: v.data.fromToken,
      fromAmount: v.data.fromAmount,
      toToken: v.data.toToken,
      fromMaxAmount: v.data.fromMaxAmount,
      epoch: v.data.epoch,
      slippage: v.data.slippageBps,
      outputLimit: v.data.outputLimit,
      outputTriggerLower: v.data.outputTriggerLower,
      outputTriggerUpper: v.data.outputTriggerUpper,
      start: v.data.start,
      deadline: v.data.deadline,
      exactApproval: v.data.exactApproval,
    });

    const requiredApprovals = await getRequiredApprovals({
      chainId,
      fromToken: v.data.fromToken,
      fromAmount: prepared.approval.amount,
      account: v.data.account,
      mode: "order",
      exactApproval: v.data.exactApproval,
    });

    return formatToolResponse({
      typedData: prepared.typedData,
      approval: prepared.approval,
      submit: prepared.submit,
      query: prepared.query,
      meta: prepared.meta,
      warnings: prepared.warnings,
      requiredApprovals,
      chainId,
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_ORDER_ERROR", String(e));
  }
}

export async function orbsPrepareTwapIntent(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  const v = validateInput(orbsPrepareTwapIntentSchema, params);
  if (!v.success) return v.error;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isSpotSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getSpotError(chainId));
  }

  let spotParams: TwapToSpotParamsResult;
  try {
    spotParams = twapParamsToSpotParams(v.data);
  } catch (e: unknown) {
    return formatToolError("INVALID_PARAMS", e instanceof Error ? e.message : String(e));
  }

  try {
    const prepared = prepareSpotOrder({
      chainId,
      swapper: v.data.account,
      fromToken: v.data.fromToken,
      toToken: v.data.toToken,
      ...spotParams,
    });

    const requiredApprovals = await getRequiredApprovals({
      chainId,
      fromToken: v.data.fromToken,
      fromAmount: prepared.approval.amount,
      account: v.data.account,
      mode: "order",
      exactApproval: v.data.exactApproval,
    });

    return formatToolResponse({
      typedData: prepared.typedData,
      approval: prepared.approval,
      submit: prepared.submit,
      query: prepared.query,
      meta: prepared.meta,
      warnings: prepared.warnings,
      requiredApprovals,
      chainId,
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_TWAP_ERROR", e instanceof Error ? e.message : String(e));
  }
}

export async function orbsPrepareLimitIntent(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  const v = validateInput(orbsPrepareLimitIntentSchema, params);
  if (!v.success) return v.error;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isSpotSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getSpotError(chainId));
  }

  try {
    const spotParams = limitParamsToSpotParams(v.data);

    const prepared = prepareSpotOrder({
      chainId,
      swapper: v.data.account,
      fromToken: v.data.fromToken,
      toToken: v.data.toToken,
      ...spotParams,
    });

    const requiredApprovals = await getRequiredApprovals({
      chainId,
      fromToken: v.data.fromToken,
      fromAmount: prepared.approval.amount,
      account: v.data.account,
      mode: "order",
      exactApproval: v.data.exactApproval,
    });

    return formatToolResponse({
      typedData: prepared.typedData,
      approval: prepared.approval,
      submit: prepared.submit,
      query: prepared.query,
      meta: prepared.meta,
      warnings: prepared.warnings,
      requiredApprovals,
      chainId,
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_LIMIT_ERROR", String(e));
  }
}
