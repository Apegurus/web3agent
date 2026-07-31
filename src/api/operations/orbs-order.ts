import { getConfig } from "../../config/env.js";
import { assertAddress } from "../../operations/validation.js";
import { getSpotError, isSpotSupported } from "../../orbs/chains.js";
import { submitSpotOrder } from "../../orbs/spot-client.js";
import { isTrustedSpotSubmitUrl } from "../../orbs/spot-config.js";
import { prepareSpotOrder } from "../../orbs/spot-prepare.js";
import { formatSpotSubmitError } from "../../utils/errors.js";
import { splitSignature } from "../../utils/signature.js";
import { Web3AgentError } from "../errors.js";
import { orbsSpotOrderResumeStateStateSchema } from "../schemas.js";
import type {
  OperationActionResult,
  OperationResumeState,
  PrepareOrderIntentInput,
  PreparedOperation,
  ResumeOperationCompletedResult,
  TypedDataPayload,
} from "../types.js";
import { parseInput } from "../validation.js";
import { getRequiredApprovals } from "./orbs-approvals.js";
import {
  assertResumeStateIntegrity,
  authenticatePreparedOperation,
} from "./resume-state-integrity.js";
import {
  assertActionResultType,
  buildPreparedOperation,
  createPreparedApprovalActions,
  createTypedDataAction,
  getPendingPreparedActions,
  toPendingOperation,
} from "./shared.js";

export async function prepareOrderOperation(
  input: PrepareOrderIntentInput
): Promise<PreparedOperation> {
  const chainId = input.chainId ?? getConfig().chainId;
  if (!isSpotSupported(chainId)) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: getSpotError(chainId),
    });
  }

  try {
    const prepared = prepareSpotOrder({
      chainId,
      swapper: input.account,
      fromToken: input.fromToken,
      fromAmount: input.fromAmount,
      toToken: input.toToken,
      fromMaxAmount: input.fromMaxAmount,
      epoch: input.epoch,
      slippage: input.slippageBps,
      outputLimit: input.outputLimit,
      outputTriggerLower: input.outputTriggerLower,
      outputTriggerUpper: input.outputTriggerUpper,
      start: input.start,
      deadline: input.deadline,
      exactApproval: input.exactApproval,
    });
    const eip712: TypedDataPayload = {
      domain: prepared.typedData.domain as TypedDataPayload["domain"],
      types: prepared.typedData.types as TypedDataPayload["types"],
      primaryType: prepared.typedData.primaryType,
      message: prepared.typedData.message as Record<string, unknown>,
    };
    const requiredApprovals = await getRequiredApprovals({
      chainId,
      fromToken: input.fromToken,
      fromAmount: prepared.approval.amount,
      account: input.account,
      mode: "order",
      exactApproval: input.exactApproval,
    });
    const approvalActions = createPreparedApprovalActions(
      chainId,
      assertAddress(input.account, "account"),
      requiredApprovals
    );
    const signAction = createTypedDataAction(chainId, "Sign Spot order", eip712);
    const intent = { ...prepared, requiredApprovals, chainId };

    return authenticatePreparedOperation(
      buildPreparedOperation(
        "orbs",
        "order",
        `Prepare Spot ${prepared.meta.kind} order on chain ${chainId}`,
        approvalActions.length > 0 ? approvalActions : [signAction],
        {
          summary: `Prepare Spot order on chain ${chainId}`,
          intent,
          order: prepared.submit.body.order,
          signAction,
          approvalActions,
          submitUrl: prepared.submit.url,
        },
        { intent }
      )
    );
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("ORBS_ORDER_ERROR", error);
  }
}

export async function resumeSpotOrderOperation(
  resumeState: OperationResumeState,
  actionResults: Record<string, OperationActionResult>
): Promise<ResumeOperationCompletedResult | { completed: false; operation: PreparedOperation }> {
  assertResumeStateIntegrity(resumeState);
  const state = parseInput(orbsSpotOrderResumeStateStateSchema, resumeState.state);
  const approvalActions = state.approvalActions;
  if (approvalActions && approvalActions.length > 0) {
    const pendingApprovals = await getPendingPreparedActions(approvalActions, actionResults);
    if (pendingApprovals.length > 0) {
      return {
        completed: false,
        operation: toPendingOperation(
          resumeState,
          pendingApprovals,
          "Resume Spot order approvals",
          actionResults
        ),
      };
    }
  }

  const signAction = state.signAction;
  const signatureResult = assertActionResultType(actionResults, signAction.id, "signature");
  if (!signatureResult) {
    return {
      completed: false,
      operation: toPendingOperation(
        resumeState,
        [signAction],
        "Resume Spot order signing",
        actionResults
      ),
    };
  }
  if (!isTrustedSpotSubmitUrl(state.submitUrl)) {
    throw new Web3AgentError({
      code: "ORBS_ORDER_ERROR",
      message: `Untrusted submit URL in resume state: ${state.submitUrl}`,
    });
  }

  const { r, s, v } = splitSignature(signatureResult.signature);
  const submitResult = await submitSpotOrder({
    url: state.submitUrl,
    order: state.order,
    signature: { r, s, v },
  });
  if (!submitResult.ok) {
    throw new Web3AgentError({
      code: "ORBS_ORDER_ERROR",
      message: formatSpotSubmitError(submitResult.status, submitResult.response),
    });
  }
  return {
    completed: true,
    integration: "orbs",
    kind: "order",
    result: { status: "submitted", response: submitResult.response },
  };
}
