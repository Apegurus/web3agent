import type { Quote } from "@orbs-network/liquidity-hub-sdk";
import { type Hex, encodeFunctionData, maxUint256 } from "viem";
import { getConfig } from "../../config/env.js";
import { createPublicClientForRuntimeChain } from "../../operations/chain-access.js";
import { assertAddress } from "../../operations/validation.js";
import {
  getLiquidityHubError,
  getSpotError,
  isLiquidityHubSupported,
  isSpotSupported,
} from "../../orbs/chains.js";
import {
  PERMIT2_ADDRESS,
  SWAP_PREPARATION_ABI,
  getIntentQuote,
  getWrappedNativeToken,
  isNativeTokenAddress,
  normalizeEip712ForSigning,
  resolveSwapQuoteFromToken,
  submitSwap,
} from "../../orbs/liquidity-hub.js";
import { submitSpotOrder } from "../../orbs/spot-client.js";
import { getSpotContracts } from "../../orbs/spot-config.js";
import { prepareSpotOrder } from "../../orbs/spot-prepare.js";
import { formatSpotSubmitError } from "../../utils/errors.js";
import { splitSignature } from "../../utils/signature.js";
import { Web3AgentError } from "../errors.js";
import {
  orbsGetRequiredApprovalsSchema,
  orbsSpotOrderResumeStateStateSchema,
  orbsSwapResumeStateStateSchema,
} from "../schemas.js";
import type {
  ApprovalStep,
  GetRequiredApprovalsInput,
  OperationActionResult,
  OperationResumeState,
  PrepareOrderIntentInput,
  PrepareSwapIntentInput,
  PreparedOperation,
  PreparedSignTypedDataAction,
  ResumeOperationCompletedResult,
  SubmitSignedSwapInput,
  SwapIntent,
  SwapSubmissionResult,
  TypedDataPayload,
} from "../types.js";
import { parseInput } from "../validation.js";
import {
  asQuote,
  assertActionResultType,
  assertSubmitSwapQuote,
  buildPreparedOperation,
  createPreparedApprovalActions,
  createTypedDataAction,
  getPendingPreparedActions,
  toPendingOperation,
} from "./shared.js";

interface RawOrbsQuote extends Quote {
  sessionId: string;
  inToken: string;
  outToken: string;
  inAmount: string;
  outAmount: string;
  minAmountOut: string;
  user: string;
  permitData?: Record<string, unknown>;
  eip712?: {
    domain?: Record<string, unknown>;
    types?: Record<string, Array<{ name: string; type: string }>>;
    primaryType?: string;
    message?: Record<string, unknown>;
  };
}

function toSwapIntentQuote(quote: RawOrbsQuote): SwapIntent["quote"] {
  return {
    ...quote,
    sessionId: quote.sessionId,
    inToken: quote.inToken,
    outToken: quote.outToken,
    inAmount: quote.inAmount,
    outAmount: quote.outAmount,
    minAmountOut: quote.minAmountOut,
    user: quote.user,
  };
}

export async function getRequiredApprovals(
  params: GetRequiredApprovalsInput
): Promise<ApprovalStep[]> {
  const input = parseInput(orbsGetRequiredApprovalsSchema, params);
  const chainId = input.chainId ?? getConfig().chainId;
  const publicClient = createPublicClientForRuntimeChain(chainId);

  try {
    const steps: ApprovalStep[] = [];
    let effectiveFromToken = assertAddress(input.fromToken, "fromToken");
    const mode = input.mode ?? "swap";
    const spender: Hex = mode === "order" ? (getSpotContracts().repermit as Hex) : PERMIT2_ADDRESS;

    if (isNativeTokenAddress(input.fromToken)) {
      const wrapped = getWrappedNativeToken(chainId);
      if (!wrapped) {
        throw new Web3AgentError({
          code: "CHAIN_NOT_SUPPORTED",
          message: `No wrapped native token configured for chain ${chainId}`,
        });
      }

      steps.push({
        type: "wrap",
        label: "Wrap native token",
        tx: {
          to: wrapped,
          data: encodeFunctionData({
            abi: SWAP_PREPARATION_ABI,
            functionName: "deposit",
          }),
          value: input.fromAmount,
        },
      });
      effectiveFromToken = wrapped;
    }

    const allowance = await publicClient.readContract({
      address: effectiveFromToken,
      abi: SWAP_PREPARATION_ABI,
      functionName: "allowance",
      args: [assertAddress(input.account, "account"), spender],
    });

    if ((allowance as bigint) < BigInt(input.fromAmount)) {
      steps.push({
        type: "approve",
        label: input.exactApproval
          ? `Approve ${mode === "order" ? "RePermit" : "Permit2"} (exact amount)`
          : `Approve ${mode === "order" ? "RePermit" : "Permit2"} (unlimited allowance)`,
        tx: {
          to: effectiveFromToken,
          data: encodeFunctionData({
            abi: SWAP_PREPARATION_ABI,
            functionName: "approve",
            args: [spender, input.exactApproval ? BigInt(input.fromAmount) : maxUint256],
          }),
        },
      });
    }

    return steps;
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("APPROVAL_CHECK_ERROR", error);
  }
}

export async function prepareSwapOperation(
  input: PrepareSwapIntentInput
): Promise<PreparedOperation> {
  const chainId = input.chainId ?? getConfig().chainId;

  if (!isLiquidityHubSupported(chainId)) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: getLiquidityHubError(chainId),
    });
  }

  try {
    const quote = (await getIntentQuote(chainId, {
      fromToken: resolveSwapQuoteFromToken(chainId, input.fromToken),
      toToken: input.toToken,
      inAmount: input.fromAmount,
      slippage: input.slippage,
      account: input.account,
    })) as RawOrbsQuote;

    const rawPrimaryType = quote.eip712?.primaryType ?? "PermitWitnessTransferFrom";
    const rawMessage = quote.eip712?.message ?? quote.permitData;
    if (!quote.eip712?.domain || !quote.eip712.types || !rawMessage) {
      throw new Web3AgentError({
        code: "ORBS_QUOTE_ERROR",
        message: "Quote did not include EIP-712 signing payload",
      });
    }

    const eip712 = normalizeEip712ForSigning(
      quote.eip712.domain,
      quote.eip712.types,
      rawPrimaryType,
      rawMessage
    );
    const requiredApprovals = await getRequiredApprovals({
      chainId,
      fromToken: input.fromToken,
      fromAmount: input.fromAmount,
      account: input.account,
    });
    const approvalActions = createPreparedApprovalActions(chainId, requiredApprovals);
    const signAction = createTypedDataAction(chainId, "Sign swap intent", eip712);
    const intent: SwapIntent = {
      eip712,
      quote: toSwapIntentQuote({
        ...quote,
        user: typeof quote.user === "string" ? quote.user : input.account,
      }),
      requiredApprovals,
      chainId,
    };

    return buildPreparedOperation(
      "orbs",
      "swap",
      `Prepare Orbs swap on chain ${chainId}`,
      approvalActions.length > 0 ? approvalActions : [signAction],
      {
        summary: `Prepare Orbs swap on chain ${chainId}`,
        intent,
        quote: intent.quote,
        chainId,
        approvalActions,
        signAction,
      },
      {
        intent,
      }
    );
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("ORBS_QUOTE_ERROR", error);
  }
}

export async function resumeOrbsSwapOperation(
  resumeState: OperationResumeState,
  actionResults: Record<string, OperationActionResult>
): Promise<ResumeOperationCompletedResult | { completed: false; operation: PreparedOperation }> {
  const state = parseInput(orbsSwapResumeStateStateSchema, resumeState.state);
  const pendingApprovals = await getPendingPreparedActions(state.approvalActions, actionResults);
  if (pendingApprovals.length > 0) {
    return {
      completed: false,
      operation: toPendingOperation(
        resumeState,
        pendingApprovals,
        "Resume Orbs swap approvals",
        actionResults
      ),
    };
  }

  const signatureResult = assertActionResultType(actionResults, state.signAction.id, "signature");
  if (!signatureResult) {
    return {
      completed: false,
      operation: toPendingOperation(
        resumeState,
        [state.signAction],
        "Resume Orbs swap signing",
        actionResults
      ),
    };
  }

  const result = await submitSwap({
    chainId: state.chainId,
    quote: asQuote(assertSubmitSwapQuote(state.quote)),
    signature: signatureResult.signature,
  });
  return {
    completed: true,
    integration: "orbs",
    kind: "swap",
    result: { ...result },
  };
}

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
      slippage: input.slippage,
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

    const approvalActions = createPreparedApprovalActions(chainId, requiredApprovals);
    const signAction = createTypedDataAction(chainId, "Sign Spot order", eip712);

    const intent = {
      ...prepared,
      requiredApprovals,
      chainId,
    };

    return buildPreparedOperation(
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
    );
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("ORBS_ORDER_ERROR", error);
  }
}

export async function resumeSpotOrderOperation(
  resumeState: OperationResumeState,
  actionResults: Record<string, OperationActionResult>
): Promise<ResumeOperationCompletedResult | { completed: false; operation: PreparedOperation }> {
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

export async function submitSignedSwapDirect(
  params: SubmitSignedSwapInput
): Promise<SwapSubmissionResult> {
  const chainId = params.chainId ?? getConfig().chainId;
  return submitSwap({
    chainId,
    quote: asQuote(assertSubmitSwapQuote(params.quote)),
    signature: params.signature,
  });
}
