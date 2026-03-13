import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  getLiquidityHubError,
  getTwapError,
  isLiquidityHubSupported,
  isTwapSupported,
} from "../../orbs/chains.js";
import { getDsltpToolDefinitions } from "../../orbs/dsltp.js";
import {
  getQuote,
  getSdk,
  normalizeEip712ForSigning,
  pollSwapStatus,
  prepareSwap,
  submitSwap,
} from "../../orbs/liquidity-hub.js";
import { listOrders, prepareTwapOrder, submitSignedOrder } from "../../orbs/twap.js";
import type { ToolDefinition } from "../../tools/register.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { splitSignature } from "../../utils/signature.js";
import { resolveChainId } from "../../utils/tool-helpers.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getActiveAccount, getWalletState } from "../../wallet/persistence.js";
import {
  orbsGetQuoteSchema,
  orbsListOrdersSchema,
  orbsPlaceLimitSchema,
  orbsPlaceTwapSchema,
  orbsSwapSchema,
  orbsSwapStatusSchema,
} from "./schemas.js";

async function orbsGetQuote(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsGetQuoteSchema, params);
  if (!v.success) return v.error;
  const { chainId, fromToken, toToken, inAmount, slippage } = v.data;

  if (!isLiquidityHubSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getLiquidityHubError(chainId));
  }

  try {
    const result = await getQuote(chainId, {
      fromToken,
      toToken,
      inAmount,
      slippage: slippage ?? 0.5,
    });

    return formatToolResponse(result);
  } catch (e: unknown) {
    return formatToolError("ORBS_QUOTE_ERROR", String(e));
  }
}

async function executeOrbsSwapNow(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = resolveChainId(params);

  try {
    const account = getActiveAccount();

    const { fromToken } = await prepareSwap({
      chainId,
      fromToken: params.fromToken as string,
      inAmount: params.inAmount as string,
      account,
    });

    const sdk = getSdk(chainId);
    const slippage = (params.slippage as number) ?? 0.5;
    const toToken = params.toToken as string;
    const inAmount = params.inAmount as string;

    const quote = await sdk.getQuote({
      fromToken,
      toToken,
      inAmount,
      slippage,
      dexMinAmountOut: "-1",
      account: account.address,
    });

    if (quote.error) {
      return formatToolError("ORBS_QUOTE_ERROR", quote.error);
    }

    if (quote.inToken && quote.inToken.toLowerCase() !== fromToken.toLowerCase()) {
      process.stderr.write(
        `[orbs] Warning: quote.inToken (${quote.inToken}) does not match fromToken (${fromToken})\n`
      );
    }

    if (!account.signTypedData) {
      return formatToolError("WALLET_ERROR", "Active account does not support EIP-712 signing");
    }

    const rawPrimaryType = quote.eip712?.primaryType ?? "PermitWitnessTransferFrom";
    const rawMessage = quote.eip712?.message ?? quote.permitData;

    const {
      domain: eip712Domain,
      types: eip712Types,
      primaryType: eip712PrimaryType,
      message: eip712Message,
    } = normalizeEip712ForSigning(
      quote.eip712?.domain,
      quote.eip712?.types,
      rawPrimaryType,
      rawMessage
    );

    process.stderr.write(
      `[orbs] EIP-712 primaryType: ${eip712PrimaryType}, types keys: ${Object.keys(eip712Types).join(", ")}\n`
    );

    const signature = await account.signTypedData({
      domain: eip712Domain,
      types: eip712Types,
      primaryType: eip712PrimaryType,
      message: eip712Message,
    });

    process.stderr.write("[orbs] Attempting swap via SDK swap() method...\n");
    let txHash: string | undefined;
    try {
      txHash = await sdk.swap(quote, signature);
      process.stderr.write(`[orbs] SDK swap() returned txHash: ${txHash}\n`);
    } catch (sdkSwapErr: unknown) {
      process.stderr.write(`[orbs] SDK swap() error: ${sdkSwapErr}\n`);
    }

    if (txHash) {
      return formatToolResponse({
        txHash,
        status: "completed",
        quote: { outAmount: quote.outAmount, minAmountOut: quote.minAmountOut },
      });
    }

    process.stderr.write(
      "[orbs] SDK swap() did not return txHash, falling back to direct API...\n"
    );
    const submission = await submitSwap({ chainId, quote, signature });

    if (submission.status === "failed") {
      return formatToolError("ORBS_SWAP_ERROR", submission.error ?? "Swap submission failed");
    }

    if (submission.status === "completed") {
      return formatToolResponse({
        txHash: submission.txHash,
        status: "completed",
        quote: { outAmount: quote.outAmount, minAmountOut: quote.minAmountOut },
      });
    }

    const result = await pollSwapStatus({
      chainId,
      sessionId: submission.sessionId,
      user: quote.user,
      maxAttempts: 15,
    });

    if (result.status === "completed") {
      return formatToolResponse({
        txHash: result.txHash,
        status: "completed",
        quote: { outAmount: quote.outAmount, minAmountOut: quote.minAmountOut },
      });
    }

    return formatToolResponse({
      status: "pending",
      sessionId: submission.sessionId,
      chainId,
      user: quote.user,
      message: "Swap submitted but not yet filled. Use orbs_swap_status to check.",
      quote: { outAmount: quote.outAmount, minAmountOut: quote.minAmountOut },
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_SWAP_ERROR", String(e));
  }
}

async function orbsSwapStatus(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsSwapStatusSchema, params);
  if (!v.success) return v.error;
  const { chainId, sessionId, user, maxAttempts } = v.data;

  try {
    const result = await pollSwapStatus({
      chainId,
      sessionId,
      user,
      maxAttempts: maxAttempts ?? 15,
    });

    return formatToolResponse(result);
  } catch (e: unknown) {
    return formatToolError("ORBS_STATUS_ERROR", String(e));
  }
}

async function orbsSwap(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsSwapSchema, params);
  if (!v.success) return v.error;
  const { chainId, fromToken, toToken, inAmount } = v.data;

  if (!isLiquidityHubSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getLiquidityHubError(chainId));
  }

  return executeWrite({
    toolName: "orbs_swap",
    description: `Orbs Liquidity Hub swap: ${inAmount} of ${fromToken} → ${toToken} on chain ${chainId}`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeOrbsSwapNow,
  });
}

async function executeOrbsTwapNow(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = resolveChainId(params);
  const chunks = Number(params.chunks ?? 5);
  const fillDelay = Number(params.fillDelay ?? 300);

  try {
    const account = getActiveAccount();

    const durationSeconds = chunks * fillDelay * 2;
    const prepared = prepareTwapOrder({
      chainId,
      srcToken: params.srcToken as string,
      dstToken: params.dstToken as string,
      srcAmount: params.srcAmount as string,
      chunks,
      fillDelaySeconds: fillDelay,
      durationSeconds,
      account: account.address,
    });

    if (!account.signTypedData) {
      return formatToolError("WALLET_ERROR", "Active account does not support EIP-712 signing");
    }
    const signature = await account.signTypedData({
      domain: prepared.domain,
      types: prepared.types,
      primaryType: prepared.primaryType as "RePermitWitnessTransferFrom",
      message: prepared.order as unknown as Record<string, unknown>,
    });

    const { v, r, s } = splitSignature(signature);

    const order = await submitSignedOrder(prepared.order, { v, r, s });
    return formatToolResponse({
      orderId: order.id,
      status: order.status,
      txHash: order.txHash,
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_TWAP_ERROR", String(e));
  }
}

async function orbsPlaceTwap(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsPlaceTwapSchema, params);
  if (!v.success) return v.error;
  const { chainId, srcToken, dstToken, srcAmount, chunks, fillDelay } = v.data;

  if (!isTwapSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getTwapError(chainId));
  }

  return executeWrite({
    toolName: "orbs_place_twap",
    description: `dTWAP order: ${srcAmount} of ${srcToken} → ${dstToken}, ${chunks} chunks, ${fillDelay}s delay on chain ${chainId}`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeOrbsTwapNow,
  });
}

async function executeOrbsLimitNow(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = resolveChainId(params);

  try {
    const account = getActiveAccount();

    const expirySeconds = Number(params.expiry ?? 86400);
    const prepared = prepareTwapOrder({
      chainId,
      srcToken: params.srcToken as string,
      dstToken: params.dstToken as string,
      srcAmount: params.srcAmount as string,
      chunks: 1,
      fillDelaySeconds: 0,
      durationSeconds: expirySeconds,
      account: account.address,
      dstMinAmountPerTrade: params.dstMinAmount as string,
    });

    if (!account.signTypedData) {
      return formatToolError("WALLET_ERROR", "Active account does not support EIP-712 signing");
    }
    const signature = await account.signTypedData({
      domain: prepared.domain,
      types: prepared.types,
      primaryType: prepared.primaryType as "RePermitWitnessTransferFrom",
      message: prepared.order as unknown as Record<string, unknown>,
    });

    const { v, r, s } = splitSignature(signature);

    const order = await submitSignedOrder(prepared.order, { v, r, s });
    return formatToolResponse({
      orderId: order.id,
      status: order.status,
      txHash: order.txHash,
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_LIMIT_ERROR", String(e));
  }
}

async function orbsPlaceLimit(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsPlaceLimitSchema, params);
  if (!v.success) return v.error;
  const { chainId, srcToken, dstToken, srcAmount, dstMinAmount } = v.data;

  if (!isTwapSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getTwapError(chainId));
  }

  return executeWrite({
    toolName: "orbs_place_limit",
    description: `dLIMIT order: ${srcAmount} of ${srcToken} → ${dstToken}, min output ${dstMinAmount} on chain ${chainId}`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeOrbsLimitNow,
  });
}

async function orbsListOrders(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsListOrdersSchema, params);
  if (!v.success) return v.error;
  const { chainId } = v.data;

  if (!isTwapSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getTwapError(chainId));
  }

  const walletState = getWalletState();
  if (!walletState.address) {
    return formatToolError(
      "WALLET_READ_ONLY",
      "orbs_list_orders requires an active wallet with an address."
    );
  }

  try {
    const orders = await listOrders(chainId, walletState.address);

    return formatToolResponse({
      count: orders.length,
      orders: orders.map((o) => ({
        id: o.id,
        type: o.type,
        status: o.status,
        srcToken: o.srcTokenAddress,
        dstToken: o.dstTokenAddress,
        srcAmount: o.srcAmount,
        progress: o.progress,
        createdAt: o.createdAt,
      })),
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_LIST_ERROR", String(e));
  }
}

export function getOrbsToolDefinitions(): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      name: "orbs_get_quote",
      category: "swap",
      description:
        "Get a quote from Orbs Liquidity Hub for same-chain aggregated swap. " +
        "Requires token addresses — use resolve_token first to get addresses.",
      inputSchema: {
        type: "object" as const,
        properties: {
          chainId: {
            type: "number",
            description: "Chain ID (supported: 137, 56, 8453, 59144, 81457, 42161)",
          },
          fromToken: { type: "string", description: "Source token address" },
          toToken: {
            type: "string",
            description: "Destination token address",
          },
          inAmount: {
            type: "string",
            description: "Input amount in wei",
          },
          slippage: {
            type: "number",
            description: "Slippage tolerance (0.5 = 0.5%)",
          },
        },
        required: ["chainId", "fromToken", "toToken", "inAmount"],
      },
      handler: orbsGetQuote,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_swap",
      category: "swap",
      description:
        "Execute a same-chain swap via Orbs Liquidity Hub (write, confirmation-gated). " +
        "Supported chains: 137 (Polygon), 56 (BSC), 8453 (Base), 59144 (Linea), 81457 (Blast), 42161 (Arbitrum). " +
        "Requires token addresses — use resolve_token first.",
      inputSchema: {
        type: "object" as const,
        properties: {
          chainId: { type: "number" },
          fromToken: { type: "string" },
          toToken: { type: "string" },
          inAmount: { type: "string" },
          slippage: { type: "number" },
        },
        required: ["chainId", "fromToken", "toToken", "inAmount"],
      },
      handler: orbsSwap,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_place_twap",
      category: "orders",
      description: "Place a dTWAP (time-weighted average price) order (write, confirmation-gated)",
      inputSchema: {
        type: "object" as const,
        properties: {
          chainId: { type: "number" },
          srcToken: { type: "string" },
          dstToken: { type: "string" },
          srcAmount: {
            type: "string",
            description: "Total amount to swap in wei",
          },
          chunks: {
            type: "number",
            description: "Number of equal chunks",
          },
          fillDelay: {
            type: "number",
            description: "Delay between fills in seconds",
          },
        },
        required: ["chainId", "srcToken", "dstToken", "srcAmount", "chunks", "fillDelay"],
      },
      handler: orbsPlaceTwap,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_place_limit",
      category: "orders",
      description: "Place a dLIMIT order (write, confirmation-gated)",
      inputSchema: {
        type: "object" as const,
        properties: {
          chainId: { type: "number" },
          srcToken: { type: "string" },
          dstToken: { type: "string" },
          srcAmount: { type: "string" },
          dstMinAmount: {
            type: "string",
            description: "Minimum output amount (the limit price)",
          },
          expiry: {
            type: "number",
            description: "Order expiry in seconds from now",
          },
        },
        required: ["chainId", "srcToken", "dstToken", "srcAmount", "dstMinAmount"],
      },
      handler: orbsPlaceLimit,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_swap_status",
      category: "swap",
      description: "Check the status of a pending Orbs Liquidity Hub swap",
      inputSchema: {
        type: "object" as const,
        properties: {
          chainId: { type: "number", description: "Chain ID" },
          sessionId: {
            type: "string",
            description: "Session ID from orbs_swap response",
          },
          user: {
            type: "string",
            description: "User wallet address",
          },
          maxAttempts: {
            type: "number",
            description: "Max poll attempts (default 15, 2s each = 30s)",
          },
        },
        required: ["chainId", "sessionId", "user"],
      },
      handler: orbsSwapStatus,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_list_orders",
      category: "orders",
      description: "List open TWAP/dLIMIT orders for active wallet",
      inputSchema: {
        type: "object" as const,
        properties: {
          chainId: { type: "number" },
        },
        required: ["chainId"],
      },
      handler: orbsListOrders,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ...getDsltpToolDefinitions(),
  ];

  return tools;
}

export function registerOrbsExecutors(): void {
  registerExecutor("orbs_swap", executeOrbsSwapNow);
  registerExecutor("orbs_place_twap", executeOrbsTwapNow);
  registerExecutor("orbs_place_limit", executeOrbsLimitNow);
}
