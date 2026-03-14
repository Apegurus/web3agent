import { type LiFiStep, convertQuoteToRoute, getQuote as getLifiQuote } from "@lifi/sdk";
import type { Quote } from "@orbs-network/liquidity-hub-sdk";
import type { RePermitOrder } from "@orbs-network/twap-sdk";
import { encodeFunctionData, maxUint256 } from "viem";
import { ChainAccess } from "../operations/chain-access.js";
import {
  assertAddress,
  assertHex,
  assertRecord,
  preserveWeb3AgentError,
} from "../operations/validation.js";
import {
  getLiquidityHubError,
  getTwapError,
  isLiquidityHubSupported,
  isTwapSupported,
} from "../orbs/chains.js";
import { SWAP_PREPARATION_ABI, type SwapResult } from "../orbs/liquidity-hub.js";
import {
  PERMIT2_ADDRESS,
  getIntentQuote,
  getWrappedNativeToken,
  isNativeTokenAddress,
  normalizeEip712ForSigning,
  resolveSwapQuoteFromToken,
  submitSwap,
} from "../orbs/liquidity-hub.js";
import { getSrcTokenChunkAmount, prepareTwapOrder, submitSignedOrder } from "../orbs/twap.js";
import { splitSignature } from "../utils/signature.js";
import { Web3AgentError } from "./errors.js";
import {
  operationResumeStateSchema,
  orbsGetRequiredApprovalsSchema,
  prepareOperationSchema,
  resumeOperationSchema,
} from "./schemas.js";
import type {
  ApprovalStep,
  BridgeIntent,
  BridgeTxStep,
  GetRequiredApprovalsInput,
  GoatToolOperationInput,
  LimitIntent,
  OperationActionResult,
  OperationResumeState,
  PrepareBridgeIntentInput,
  PrepareLimitIntentInput,
  PrepareOperationInput,
  PrepareOperationResult,
  PrepareSwapIntentInput,
  PrepareTwapIntentInput,
  PreparedOperation,
  PreparedSignTypedDataAction,
  PreparedTransactionAction,
  ResumeOperationCompletedResult,
  ResumeOperationInput,
  ResumeOperationResult,
  SwapIntent,
  SwapSubmissionResult,
  TwapIntent,
  TwapOrderResult,
  TypedDataPayload,
} from "./types.js";
import { parseInput } from "./validation.js";

interface RouteLike {
  steps?: Array<{
    type?: string;
    transactionRequest?: {
      to?: string;
      data?: string;
      value?: string;
      gasLimit?: string;
      chainId?: number;
    };
  }>;
}

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

function toBridgeStepLabel(type: BridgeTxStep["type"]): string {
  return type === "approval" ? "Approve bridge spender" : "Execute bridge";
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

function createPreparedApprovalActions(
  chainId: number,
  approvals: ApprovalStep[]
): PreparedTransactionAction[] {
  return approvals.map((step, index) => ({
    id: `approval:${index}`,
    type: "transaction",
    label: step.label,
    tx: {
      to: step.tx.to,
      chainId,
      ...(step.tx.data ? { data: step.tx.data } : {}),
      ...(step.tx.value ? { value: step.tx.value } : {}),
    },
  }));
}

function createTypedDataAction(
  chainId: number,
  label: string,
  eip712: TypedDataPayload
): PreparedSignTypedDataAction {
  return {
    id: "sign-typed-data:0",
    type: "signTypedData",
    label,
    chainId,
    eip712,
  };
}

function buildPreparedOperation(
  integration: PreparedOperation["integration"],
  kind: PreparedOperation["kind"],
  summary: string,
  actions: PreparedOperation["actions"],
  state: Record<string, unknown>,
  meta?: Record<string, unknown>
): PreparedOperation {
  return {
    integration,
    kind,
    summary,
    actions,
    resumeState: {
      version: 1,
      integration,
      kind,
      state: {
        ...state,
        ...(meta ? { meta } : {}),
      },
    },
    ...(meta ? { meta } : {}),
  };
}

function assertActionResultType<TType extends OperationActionResult["type"]>(
  actionResults: Record<string, OperationActionResult>,
  actionId: string,
  expectedType: TType
): Extract<OperationActionResult, { type: TType }> | undefined {
  const result = actionResults[actionId];
  if (!result) return undefined;
  if (result.type !== expectedType) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `Action result ${actionId} must be of type ${expectedType}`,
    });
  }
  return result as Extract<OperationActionResult, { type: TType }>;
}

function assertSubmitSwapQuote(quote: unknown): Record<string, unknown> {
  const record = assertRecord(quote, "quote");
  const requiredFields = [
    "sessionId",
    "inToken",
    "outToken",
    "inAmount",
    "outAmount",
    "minAmountOut",
    "user",
  ] as const;

  for (const field of requiredFields) {
    if (typeof record[field] !== "string") {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: `quote.${field} must be a string`,
      });
    }
  }

  return record;
}

function assertSignedOrder(order: unknown): Record<string, unknown> {
  return assertRecord(order, "order");
}

export async function getRequiredApprovals(
  params: GetRequiredApprovalsInput
): Promise<ApprovalStep[]> {
  const input = parseInput(orbsGetRequiredApprovalsSchema, params);
  const chainAccess = new ChainAccess();
  const publicClient = chainAccess.createPublicClient(input.chainId);

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
        label: "Approve Permit2",
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

async function prepareSwapOperation(input: PrepareSwapIntentInput): Promise<PreparedOperation> {
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
  const durationSeconds = isLimit ? (expirySeconds ?? 86400) : chunks * fillDelaySeconds * 2;
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
    domain: order.domain as Record<string, unknown>,
    types: order.types as Record<string, Array<{ name: string; type: string }>>,
    primaryType: order.primaryType,
    message: order.order as unknown as Record<string, unknown>,
  };

  if (isLimit) {
    const intent: LimitIntent = {
      eip712,
      order: order.order as unknown as Record<string, unknown>,
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
    order: order.order as unknown as Record<string, unknown>,
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

async function prepareTwapOperation(input: PrepareTwapIntentInput): Promise<PreparedOperation> {
  try {
    const { intent, signAction } = prepareTwapOrLimitIntent("twap", input);
    return buildPreparedOperation(
      "orbs",
      "twap",
      `Prepare Orbs TWAP order on chain ${input.chainId}`,
      [signAction],
      {
        summary: `Prepare Orbs TWAP order on chain ${input.chainId}`,
        intent,
        order: intent.order,
        signAction,
      },
      { intent }
    );
  } catch (error: unknown) {
    throw preserveWeb3AgentError("ORBS_TWAP_ERROR", error);
  }
}

async function prepareLimitOperation(input: PrepareLimitIntentInput): Promise<PreparedOperation> {
  try {
    const { intent, signAction } = prepareTwapOrLimitIntent("limit", input);
    return buildPreparedOperation(
      "orbs",
      "limit",
      `Prepare Orbs limit order on chain ${input.chainId}`,
      [signAction],
      {
        summary: `Prepare Orbs limit order on chain ${input.chainId}`,
        intent,
        order: intent.order,
        signAction,
      },
      { intent }
    );
  } catch (error: unknown) {
    throw preserveWeb3AgentError("ORBS_LIMIT_ERROR", error);
  }
}

async function prepareBridgeOperation(input: PrepareBridgeIntentInput): Promise<PreparedOperation> {
  try {
    const quote: LiFiStep = await getLifiQuote({
      fromChain: input.fromChainId,
      toChain: input.toChainId,
      fromToken: input.fromTokenAddress,
      toToken: input.toTokenAddress,
      fromAmount: input.fromAmount,
      fromAddress: input.account,
    });

    const route = convertQuoteToRoute(quote) as RouteLike;
    const steps: BridgeTxStep[] = (route.steps ?? []).map((step) => {
      const request = step.transactionRequest;
      if (!request?.to || !request.data || request.value === undefined) {
        throw new Web3AgentError({
          code: "BRIDGE_INTENT_ERROR",
          message: "Bridge route step did not include raw transaction data",
        });
      }

      const type: BridgeTxStep["type"] = step.type === "approval" ? "approval" : "bridge";
      return {
        type,
        label: toBridgeStepLabel(type),
        tx: {
          to: assertAddress(request.to, "transactionRequest.to"),
          data: assertHex(request.data, "transactionRequest.data"),
          value: request.value,
          chainId: request.chainId ?? input.fromChainId,
          ...(request.gasLimit ? { gasLimit: request.gasLimit } : {}),
        },
      };
    });

    const intent: BridgeIntent = {
      steps,
      estimate: {
        fromToken: quote.action.fromToken?.symbol ?? input.fromTokenAddress,
        toToken: quote.action.toToken?.symbol ?? input.toTokenAddress,
        fromAmount: quote.action.fromAmount,
        fromAmountUSD: quote.estimate?.fromAmountUSD,
        toAmount: quote.estimate?.toAmount ?? "0",
        toAmountUSD: quote.estimate?.toAmountUSD,
        toAmountMin: quote.estimate?.toAmountMin ?? "0",
        gasCostUSD: quote.estimate?.gasCosts?.[0]?.amountUSD,
        estimatedDurationSeconds: quote.estimate?.executionDuration,
      },
      fromChainId: input.fromChainId,
      toChainId: input.toChainId,
    };
    const actions: PreparedTransactionAction[] = steps.map((step, index) => ({
      id: `bridge:${index}`,
      type: "transaction",
      label: step.label,
      tx: step.tx,
    }));

    return buildPreparedOperation(
      "lifi",
      "bridge",
      `Prepare LI.FI bridge from ${input.fromChainId} to ${input.toChainId}`,
      actions,
      {
        summary: `Prepare LI.FI bridge from ${input.fromChainId} to ${input.toChainId}`,
        intent,
        actions,
      },
      { intent }
    );
  } catch (error: unknown) {
    throw preserveWeb3AgentError("BRIDGE_INTENT_ERROR", error);
  }
}

export async function prepareOperation(
  params: PrepareOperationInput
): Promise<PrepareOperationResult> {
  const input = parseInput(prepareOperationSchema, params);

  switch (input.integration) {
    case "orbs":
      if (input.kind === "swap") {
        return prepareSwapOperation(input);
      }
      if (input.kind === "twap") {
        return prepareTwapOperation(input);
      }
      return prepareLimitOperation(input);
    case "lifi":
      return prepareBridgeOperation(input);
    case "goat": {
      const { prepareOrResumeGoatOperation } = await import("../operations/goat.js");
      return prepareOrResumeGoatOperation({
        input: input as GoatToolOperationInput,
      });
    }
  }
}

function parseResumeState(resumeState: unknown): OperationResumeState {
  return parseInput(operationResumeStateSchema, resumeState);
}

function toPendingOperation(
  resumeState: OperationResumeState,
  actions: PreparedOperation["actions"],
  fallbackSummary: string
): PreparedOperation {
  const state = assertRecord(resumeState.state, "resumeState.state");
  const summary =
    typeof state.summary === "string" && state.summary.length > 0 ? state.summary : fallbackSummary;
  const meta = state.meta && typeof state.meta === "object" ? { ...(state.meta as object) } : {};

  return {
    integration: resumeState.integration,
    kind: resumeState.kind,
    summary,
    actions,
    resumeState,
    ...(Object.keys(meta).length > 0 ? { meta: meta as Record<string, unknown> } : {}),
  };
}

export async function resumeOperation(
  params: ResumeOperationInput
): Promise<ResumeOperationResult> {
  const input = parseInput(resumeOperationSchema, params);
  const resumeState = parseResumeState(input.resumeState);
  const actionResults = input.actionResults ?? {};
  const state = assertRecord(resumeState.state, "resumeState.state");

  if (resumeState.integration === "goat") {
    const { prepareOrResumeGoatOperation } = await import("../operations/goat.js");
    const goatInput = parseInput(prepareOperationSchema, {
      integration: "goat",
      kind: "tool",
      toolName: state.toolName,
      params: state.params,
      chainId: state.chainId,
      account: state.account,
    }) as GoatToolOperationInput;
    const result = await prepareOrResumeGoatOperation({
      input: goatInput,
      actionResults,
    });

    if ("completed" in result) {
      return result;
    }

    return {
      completed: false,
      operation: result,
    };
  }

  if (resumeState.integration === "orbs" && resumeState.kind === "swap") {
    const approvalActions = Array.isArray(state.approvalActions)
      ? (state.approvalActions as PreparedTransactionAction[])
      : [];
    const pendingApprovals = approvalActions.filter(
      (action) => !assertActionResultType(actionResults, action.id, "transaction")
    );
    if (pendingApprovals.length > 0) {
      return {
        completed: false,
        operation: toPendingOperation(resumeState, pendingApprovals, "Resume Orbs swap approvals"),
      };
    }

    const signAction = state.signAction as PreparedSignTypedDataAction | undefined;
    if (!signAction) {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: "Swap resume state is missing signAction",
      });
    }

    const signatureResult = assertActionResultType(actionResults, signAction.id, "signature");
    if (!signatureResult) {
      return {
        completed: false,
        operation: toPendingOperation(resumeState, [signAction], "Resume Orbs swap signing"),
      };
    }

    const quote = assertSubmitSwapQuote(state.quote);
    const result: SwapResult = await submitSwap({
      chainId: Number(state.chainId),
      quote: quote as unknown as Quote,
      signature: signatureResult.signature,
    });
    return {
      completed: true,
      integration: "orbs",
      kind: "swap",
      result: { ...result },
    };
  }

  if (
    resumeState.integration === "orbs" &&
    (resumeState.kind === "twap" || resumeState.kind === "limit")
  ) {
    const signAction = state.signAction as PreparedSignTypedDataAction | undefined;
    if (!signAction) {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: `${resumeState.kind} resume state is missing signAction`,
      });
    }

    const signatureResult = assertActionResultType(actionResults, signAction.id, "signature");
    if (!signatureResult) {
      return {
        completed: false,
        operation: toPendingOperation(
          resumeState,
          [signAction],
          `Resume Orbs ${resumeState.kind} signing`
        ),
      };
    }

    const signature = splitSignature(signatureResult.signature);
    const order = assertSignedOrder(state.order);
    const submittedOrder = await submitSignedOrder(order as unknown as RePermitOrder, signature);
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

  if (resumeState.integration === "lifi" && resumeState.kind === "bridge") {
    const actions = Array.isArray(state.actions)
      ? (state.actions as PreparedTransactionAction[])
      : [];
    const pendingActions = actions.filter(
      (action) => !assertActionResultType(actionResults, action.id, "transaction")
    );

    if (pendingActions.length > 0) {
      return {
        completed: false,
        operation: toPendingOperation(resumeState, pendingActions, "Resume LI.FI bridge"),
      };
    }

    return {
      completed: true,
      integration: "lifi",
      kind: "bridge",
      result: {
        status: "completed",
        message: "Bridge steps executed externally",
      },
    };
  }

  throw new Web3AgentError({
    code: "INVALID_PARAMS",
    message: `Unsupported resume state: ${resumeState.integration}/${resumeState.kind}`,
  });
}

export async function submitSignedSwap(params: {
  chainId: number;
  quote: Record<string, unknown>;
  signature: string;
}): Promise<SwapSubmissionResult> {
  const result = await resumeOperation({
    resumeState: {
      version: 1,
      integration: "orbs",
      kind: "swap",
      state: {
        chainId: params.chainId,
        quote: assertSubmitSwapQuote(params.quote),
        approvalActions: [],
        signAction: {
          id: "sign-typed-data:0",
          type: "signTypedData",
          label: "Sign swap intent",
          chainId: params.chainId,
          eip712: {
            domain: {},
            types: {},
            primaryType: "PermitWitnessTransferFrom",
            message: {},
          },
        },
      },
    },
    actionResults: {
      "sign-typed-data:0": {
        type: "signature",
        signature: params.signature,
      },
    },
  });

  if (!result.completed) {
    throw new Web3AgentError({
      code: "ORBS_SWAP_ERROR",
      message: "Signed swap did not complete",
    });
  }

  return result.result as unknown as SwapSubmissionResult;
}

export async function submitSignedTwapOrder(params: {
  order: Record<string, unknown>;
  signature: { v: number; r: string; s: string };
}): Promise<TwapOrderResult> {
  const signatureHex =
    `${assertHex(params.signature.r, "signature.r")}${assertHex(params.signature.s, "signature.s").slice(2)}${assertHex(
      `0x${params.signature.v.toString(16).padStart(2, "0")}`,
      "signature.v"
    ).slice(2)}` as `0x${string}`;

  const result = await resumeOperation({
    resumeState: {
      version: 1,
      integration: "orbs",
      kind: "twap",
      state: {
        order: assertSignedOrder(params.order),
        signAction: {
          id: "sign-typed-data:0",
          type: "signTypedData",
          label: "Sign TWAP order",
          chainId: 0,
          eip712: {
            domain: {},
            types: {},
            primaryType: "RePermitWitnessTransferFrom",
            message: {},
          },
        },
      },
    },
    actionResults: {
      "sign-typed-data:0": {
        type: "signature",
        signature: signatureHex,
      },
    },
  });

  if (!result.completed) {
    throw new Web3AgentError({
      code: "ORBS_TWAP_ERROR",
      message: "Signed order did not complete",
    });
  }

  return result.result as unknown as TwapOrderResult;
}
