import { type LiFiStep, convertQuoteToRoute, getQuote as getLifiQuote } from "@lifi/sdk";
import type { Quote } from "@orbs-network/liquidity-hub-sdk";
import type { RePermitOrder } from "@orbs-network/twap-sdk";
import { createPublicClient, encodeFunctionData, maxUint256 } from "viem";
import { getChainById } from "../chains/registry.js";
import { parseEnv } from "../config/env.js";
import { getTransportForChain } from "../config/wallet-factory.js";
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
import { lifiPrepareBridgeIntentSchema } from "../tools/lifi/schemas.js";
import {
  orbsGetRequiredApprovalsSchema,
  orbsPrepareLimitIntentSchema,
  orbsPrepareSwapIntentSchema,
  orbsPrepareTwapIntentSchema,
  orbsSubmitSignedSwapSchema,
  orbsSubmitSignedTwapOrderSchema,
} from "../tools/orbs/schemas.js";
import { Web3AgentError } from "./errors.js";
import type {
  ApprovalStep,
  BridgeIntent,
  BridgeTxStep,
  LimitIntent,
  PrepareBridgeIntentInput,
  PrepareLimitIntentInput,
  PrepareSwapIntentInput,
  PrepareTwapIntentInput,
  SubmitSignedSwapInput,
  SubmitSignedTwapOrderInput,
  SwapIntent,
  SwapSubmissionResult,
  TwapIntent,
  TwapOrderResult,
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

function requireChain(chainId: number) {
  const chain = getChainById(chainId);
  if (!chain) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: `Unsupported chain ID: ${chainId}`,
    });
  }
  return chain;
}

function getStandaloneTransport(chainId: number) {
  const config = parseEnv({ CHAIN_ID: String(chainId) });
  return getTransportForChain(chainId, config);
}

function toHex(value: string, field: string): `0x${string}` {
  if (!value.startsWith("0x")) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `${field} must be a 0x-prefixed hex string`,
    });
  }
  return value as `0x${string}`;
}

function normalizeSignatureV(v: number): `0x${string}` {
  if (!Number.isInteger(v) || v < 0 || v > 255) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "signature.v must be an integer between 0 and 255",
    });
  }
  return `0x${v.toString(16).padStart(2, "0")}` as `0x${string}`;
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

export async function getRequiredApprovals(
  params:
    | PrepareSwapIntentInput
    | { chainId: number; fromToken: string; inAmount: string; account: string }
): Promise<ApprovalStep[]> {
  const input = parseInput(orbsGetRequiredApprovalsSchema, params);
  const chain = requireChain(input.chainId);
  const publicClient = createPublicClient({
    chain,
    transport: getStandaloneTransport(input.chainId),
  });

  try {
    const steps: ApprovalStep[] = [];
    let effectiveFromToken = toHex(input.fromToken, "fromToken");

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
      args: [toHex(input.account, "account"), PERMIT2_ADDRESS],
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
    throw Web3AgentError.fromUnknown("APPROVAL_CHECK_ERROR", error);
  }
}

export async function prepareSwapIntent(params: PrepareSwapIntentInput): Promise<SwapIntent> {
  const input = parseInput(orbsPrepareSwapIntentSchema, params);

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

    const requiredApprovals = await getRequiredApprovals({
      chainId: input.chainId,
      fromToken: input.fromToken,
      inAmount: input.inAmount,
      account: input.account,
    });

    return {
      eip712: normalizeEip712ForSigning(
        quote.eip712.domain,
        quote.eip712.types,
        rawPrimaryType,
        rawMessage
      ),
      quote: toSwapIntentQuote({
        ...quote,
        user: typeof quote.user === "string" ? quote.user : input.account,
      }),
      requiredApprovals,
      chainId: input.chainId,
    };
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("ORBS_QUOTE_ERROR", error);
  }
}

export async function prepareTwapIntent(params: PrepareTwapIntentInput): Promise<TwapIntent> {
  const input = parseInput(orbsPrepareTwapIntentSchema, params);

  if (!isTwapSupported(input.chainId)) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: getTwapError(input.chainId),
    });
  }

  try {
    const durationSeconds = input.chunks * input.fillDelay * 2;
    const order = prepareTwapOrder({
      chainId: input.chainId,
      srcToken: input.srcToken,
      dstToken: input.dstToken,
      srcAmount: input.srcAmount,
      chunks: input.chunks,
      fillDelaySeconds: input.fillDelay,
      durationSeconds,
      account: input.account,
    });

    return {
      eip712: {
        domain: order.domain as Record<string, unknown>,
        types: order.types as Record<string, Array<{ name: string; type: string }>>,
        primaryType: order.primaryType,
        message: order.order as unknown as Record<string, unknown>,
      },
      order: order.order as unknown as Record<string, unknown>,
      chainId: input.chainId,
      meta: {
        chunks: input.chunks,
        fillDelaySeconds: input.fillDelay,
        durationSeconds,
        srcAmountPerChunk: getSrcTokenChunkAmount(input.srcAmount, input.chunks),
      },
    };
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("ORBS_TWAP_ERROR", error);
  }
}

export async function prepareLimitIntent(params: PrepareLimitIntentInput): Promise<LimitIntent> {
  const input = parseInput(orbsPrepareLimitIntentSchema, params);

  if (!isTwapSupported(input.chainId)) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: getTwapError(input.chainId),
    });
  }

  try {
    const expirySeconds = input.expiry ?? 86400;
    const order = prepareTwapOrder({
      chainId: input.chainId,
      srcToken: input.srcToken,
      dstToken: input.dstToken,
      srcAmount: input.srcAmount,
      chunks: 1,
      fillDelaySeconds: 0,
      durationSeconds: expirySeconds,
      account: input.account,
      dstMinAmountPerTrade: input.dstMinAmount,
    });

    return {
      eip712: {
        domain: order.domain as Record<string, unknown>,
        types: order.types as Record<string, Array<{ name: string; type: string }>>,
        primaryType: order.primaryType,
        message: order.order as unknown as Record<string, unknown>,
      },
      order: order.order as unknown as Record<string, unknown>,
      chainId: input.chainId,
      meta: {
        expirySeconds,
        dstMinAmount: input.dstMinAmount,
      },
    };
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("ORBS_LIMIT_ERROR", error);
  }
}

export async function prepareBridgeIntent(params: PrepareBridgeIntentInput): Promise<BridgeIntent> {
  const input = parseInput(lifiPrepareBridgeIntentSchema, params);

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
          to: toHex(request.to, "transactionRequest.to"),
          data: toHex(request.data, "transactionRequest.data"),
          value: request.value,
          chainId: request.chainId ?? input.fromChainId,
          ...(request.gasLimit ? { gasLimit: request.gasLimit } : {}),
        },
      };
    });

    return {
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
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("BRIDGE_INTENT_ERROR", error);
  }
}

export async function submitSignedSwap(
  params: SubmitSignedSwapInput
): Promise<SwapSubmissionResult> {
  const input = parseInput(orbsSubmitSignedSwapSchema, params);

  try {
    const result: SwapResult = await submitSwap({
      chainId: input.chainId,
      // Orbs SDK owns the quote shape; we preserve the caller-provided payload at the SDK boundary.
      quote: input.quote as unknown as Quote,
      signature: input.signature,
    });
    return result;
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("ORBS_SWAP_ERROR", error);
  }
}

export async function submitSignedTwapOrder(
  params: SubmitSignedTwapOrderInput
): Promise<TwapOrderResult> {
  const input = parseInput(orbsSubmitSignedTwapOrderSchema, params);

  try {
    const order = await submitSignedOrder(
      // Orbs SDK owns the order shape; we preserve the caller-provided payload at the SDK boundary.
      input.order as unknown as RePermitOrder,
      {
        v: normalizeSignatureV(input.signature.v),
        r: toHex(input.signature.r, "signature.r"),
        s: toHex(input.signature.s, "signature.s"),
      }
    );

    return {
      orderId: order.id,
      status: order.status,
      ...(order.txHash ? { txHash: order.txHash } : {}),
    };
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("ORBS_TWAP_ERROR", error);
  }
}
