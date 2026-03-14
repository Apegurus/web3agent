import type { Quote } from "@orbs-network/liquidity-hub-sdk";
import type { RePermitOrder } from "@orbs-network/twap-sdk";
import { encodeFunctionData, maxUint256 } from "viem";
import { createPublicClientForRuntimeChain } from "../../operations/chain-access.js";
import { assertAddress, assertHex, preserveWeb3AgentError } from "../../operations/validation.js";
import {
  getLiquidityHubError,
  getTwapError,
  isLiquidityHubSupported,
  isTwapSupported,
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
import {
  getSrcTokenChunkAmount,
  getTwapDurationSeconds,
  prepareTwapOrder,
  submitSignedOrder,
} from "../../orbs/twap.js";
import { joinSignature, splitSignature } from "../../utils/signature.js";
import { Web3AgentError } from "../errors.js";
import {
  orbsGetRequiredApprovalsSchema,
  orbsOrderResumeStateStateSchema,
  orbsSwapResumeStateStateSchema,
} from "../schemas.js";
import type {
  ApprovalStep,
  GetRequiredApprovalsInput,
  LimitIntent,
  OperationActionResult,
  OperationResumeState,
  PrepareLimitIntentInput,
  PrepareSwapIntentInput,
  PrepareTwapIntentInput,
  PreparedOperation,
  PreparedSignTypedDataAction,
  ResumeOperationCompletedResult,
  SubmitSignedSwapInput,
  SubmitSignedTwapOrderInput,
  SwapIntent,
  SwapSubmissionResult,
  TwapIntent,
  TwapOrderResult,
  TypedDataPayload,
} from "../types.js";
import { parseInput } from "../validation.js";
import {
  asQuote,
  assertActionResultType,
  assertSignedOrder,
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

function toPlainRecord(value: object): Record<string, unknown> {
  return { ...value };
}

function toRePermitOrder(value: Record<string, unknown>): RePermitOrder {
  // Orbs SDK submission expects the concrete SDK order type at this boundary.
  return value as unknown as RePermitOrder;
}

export async function getRequiredApprovals(
  params: GetRequiredApprovalsInput
): Promise<ApprovalStep[]> {
  const input = parseInput(orbsGetRequiredApprovalsSchema, params);
  const publicClient = createPublicClientForRuntimeChain(input.chainId);

  try {
    const steps: ApprovalStep[] = [];
    let effectiveFromToken = assertAddress(input.fromToken, "fromToken");

    if (isNativeTokenAddress(input.fromToken)) {
      const wrapped = getWrappedNativeToken(input.chainId);
      if (!wrapped) {
        throw new Web3AgentError({
          code: "CHAIN_NOT_SUPPORTED",
          message: `No wrapped native token configured for chain ${input.chainId}`,
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
          value: input.inAmount,
        },
      });
      effectiveFromToken = wrapped;
    }

    const allowance = await publicClient.readContract({
      address: effectiveFromToken,
      abi: SWAP_PREPARATION_ABI,
      functionName: "allowance",
      args: [assertAddress(input.account, "account"), PERMIT2_ADDRESS],
    });

    if ((allowance as bigint) < BigInt(input.inAmount)) {
      steps.push({
        type: "approve",
        label: "Approve Permit2 (unlimited allowance)",
        tx: {
          to: effectiveFromToken,
          data: encodeFunctionData({
            abi: SWAP_PREPARATION_ABI,
            functionName: "approve",
            args: [PERMIT2_ADDRESS, maxUint256],
          }),
        },
      });
    }

    return steps;
  } catch (error: unknown) {
    throw preserveWeb3AgentError("APPROVAL_CHECK_ERROR", error);
  }
}

export async function prepareSwapOperation(
  input: PrepareSwapIntentInput
): Promise<PreparedOperation> {
  if (!isLiquidityHubSupported(input.chainId)) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: getLiquidityHubError(input.chainId),
    });
  }

  try {
    const quote = (await getIntentQuote(input.chainId, {
      fromToken: resolveSwapQuoteFromToken(input.chainId, input.fromToken),
      toToken: input.toToken,
      inAmount: input.inAmount,
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
      chainId: input.chainId,
      fromToken: input.fromToken,
      inAmount: input.inAmount,
      account: input.account,
    });
    const approvalActions = createPreparedApprovalActions(input.chainId, requiredApprovals);
    const signAction = createTypedDataAction(input.chainId, "Sign swap intent", eip712);
    const intent: SwapIntent = {
      eip712,
      quote: toSwapIntentQuote({
        ...quote,
        user: typeof quote.user === "string" ? quote.user : input.account,
      }),
      requiredApprovals,
      chainId: input.chainId,
    };

    return buildPreparedOperation(
      "orbs",
      "swap",
      `Prepare Orbs swap on chain ${input.chainId}`,
      approvalActions.length > 0 ? approvalActions : [signAction],
      {
        summary: `Prepare Orbs swap on chain ${input.chainId}`,
        intent,
        quote: intent.quote,
        chainId: input.chainId,
        approvalActions,
        signAction,
      },
      {
        intent,
      }
    );
  } catch (error: unknown) {
    throw preserveWeb3AgentError("ORBS_QUOTE_ERROR", error);
  }
}

function prepareTwapOrLimitIntent(
  kind: "twap" | "limit",
  params: PrepareTwapIntentInput | PrepareLimitIntentInput
): { intent: TwapIntent | LimitIntent; signAction: PreparedSignTypedDataAction } {
  if (!isTwapSupported(params.chainId)) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: getTwapError(params.chainId),
    });
  }

  const isLimit = kind === "limit";
  const expirySeconds = isLimit ? ((params as PrepareLimitIntentInput).expiry ?? 86400) : undefined;
  const chunks = isLimit ? 1 : (params as PrepareTwapIntentInput).chunks;
  const fillDelaySeconds = isLimit ? 0 : (params as PrepareTwapIntentInput).fillDelay;
  const durationSeconds = isLimit
    ? (expirySeconds ?? 86400)
    : getTwapDurationSeconds(chunks, fillDelaySeconds);
  const order = prepareTwapOrder({
    chainId: params.chainId,
    srcToken: params.srcToken,
    dstToken: params.dstToken,
    srcAmount: params.srcAmount,
    chunks,
    fillDelaySeconds,
    durationSeconds,
    account: params.account,
    ...(isLimit
      ? {
          dstMinAmountPerTrade: (params as PrepareLimitIntentInput).dstMinAmount,
        }
      : {}),
  });
  const eip712: TypedDataPayload = {
    domain: order.domain as TypedDataPayload["domain"],
    types: order.types as TypedDataPayload["types"],
    primaryType: order.primaryType,
    message: toPlainRecord(order.order),
  };

  if (isLimit) {
    const intent: LimitIntent = {
      eip712,
      order: toPlainRecord(order.order),
      chainId: params.chainId,
      meta: {
        expirySeconds: expirySeconds ?? 86400,
        dstMinAmount: (params as PrepareLimitIntentInput).dstMinAmount,
      },
    };
    return {
      intent,
      signAction: createTypedDataAction(params.chainId, "Sign limit order", eip712),
    };
  }

  const intent: TwapIntent = {
    eip712,
    order: toPlainRecord(order.order),
    chainId: params.chainId,
    meta: {
      chunks,
      fillDelaySeconds,
      durationSeconds,
      srcAmountPerChunk: getSrcTokenChunkAmount(params.srcAmount, chunks),
    },
  };
  return {
    intent,
    signAction: createTypedDataAction(params.chainId, "Sign TWAP order", eip712),
  };
}

async function prepareTwapOrLimitOperation(
  kind: "twap" | "limit",
  input: PrepareTwapIntentInput | PrepareLimitIntentInput
): Promise<PreparedOperation> {
  const errorCode = kind === "twap" ? "ORBS_TWAP_ERROR" : "ORBS_LIMIT_ERROR";
  const summary = `Prepare Orbs ${kind === "twap" ? "TWAP order" : "limit order"} on chain ${input.chainId}`;

  try {
    const { intent, signAction } = prepareTwapOrLimitIntent(kind, input);
    return buildPreparedOperation(
      "orbs",
      kind,
      summary,
      [signAction],
      {
        summary,
        intent,
        order: intent.order,
        signAction,
      },
      { intent }
    );
  } catch (error: unknown) {
    throw preserveWeb3AgentError(errorCode, error);
  }
}

export async function prepareTwapOperation(
  input: PrepareTwapIntentInput
): Promise<PreparedOperation> {
  return prepareTwapOrLimitOperation("twap", input);
}

export async function prepareLimitOperation(
  input: PrepareLimitIntentInput
): Promise<PreparedOperation> {
  return prepareTwapOrLimitOperation("limit", input);
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

export async function resumeOrbsOrderOperation(
  resumeState: OperationResumeState,
  actionResults: Record<string, OperationActionResult>
): Promise<ResumeOperationCompletedResult | { completed: false; operation: PreparedOperation }> {
  const state = parseInput(orbsOrderResumeStateStateSchema, resumeState.state);
  const signatureResult = assertActionResultType(actionResults, state.signAction.id, "signature");
  if (!signatureResult) {
    return {
      completed: false,
      operation: toPendingOperation(
        resumeState,
        [state.signAction],
        `Resume Orbs ${resumeState.kind} signing`,
        actionResults
      ),
    };
  }

  const signature = splitSignature(signatureResult.signature);
  const submittedOrder = await submitSignedOrder(
    toRePermitOrder(assertSignedOrder(state.order)),
    signature
  );
  const result: TwapOrderResult = {
    orderId: submittedOrder.id,
    status: submittedOrder.status,
    ...(submittedOrder.txHash ? { txHash: submittedOrder.txHash } : {}),
  };
  return {
    completed: true,
    integration: "orbs",
    kind: resumeState.kind,
    result: { ...result },
  };
}

export async function submitSignedSwapDirect(
  params: SubmitSignedSwapInput
): Promise<SwapSubmissionResult> {
  return submitSwap({
    chainId: params.chainId,
    quote: asQuote(assertSubmitSwapQuote(params.quote)),
    signature: params.signature,
  });
}

export async function submitSignedTwapOrderDirect(
  params: SubmitSignedTwapOrderInput
): Promise<TwapOrderResult> {
  let signatureHex: `0x${string}`;
  try {
    signatureHex = joinSignature({
      r: assertHex(params.signature.r, "signature.r"),
      s: assertHex(params.signature.s, "signature.s"),
      v: params.signature.v,
    });
  } catch (error: unknown) {
    throw preserveWeb3AgentError("INVALID_PARAMS", error, "Invalid TWAP signature");
  }

  const result = await submitSignedOrder(
    toRePermitOrder(assertSignedOrder(params.order)),
    splitSignature(signatureHex)
  );
  return {
    orderId: result.id,
    status: result.status,
    ...(result.txHash ? { txHash: result.txHash } : {}),
  };
}
