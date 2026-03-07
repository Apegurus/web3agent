import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getConfig } from "../../config/env.js";
import {
  getLiquidityHubError,
  getTwapError,
  isLiquidityHubSupported,
  isTwapSupported,
} from "../../orbs/chains.js";
import { getDsltpToolDefinitions } from "../../orbs/dsltp.js";
import type { ToolDefinition } from "../../tools/register.js";
import { formatToolError, formatToolResponse } from "../../types/tools.js";
import { confirmationQueue } from "../../wallet/confirmation.js";
import { getActiveAccount, getWalletState } from "../../wallet/persistence.js";

async function orbsGetQuote(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = Number(params.chainId ?? getConfig().chainId);

  if (!isLiquidityHubSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getLiquidityHubError(chainId));
  }

  try {
    const { getQuote } = await import("../../orbs/liquidity-hub.js");
    const result = await getQuote(chainId, {
      fromToken: params.fromToken as string,
      toToken: params.toToken as string,
      inAmount: params.inAmount as string,
      slippage: (params.slippage as number) ?? 0.5,
    });

    return formatToolResponse(result);
  } catch (e) {
    return formatToolError("ORBS_QUOTE_ERROR", String(e));
  }
}

async function orbsSwap(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = Number(params.chainId ?? getConfig().chainId);

  if (!isLiquidityHubSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getLiquidityHubError(chainId));
  }

  const walletState = getWalletState();
  if (walletState.mode === "read-only") {
    return formatToolError(
      "WALLET_READ_ONLY",
      "orbs_swap requires an active wallet. Use wallet_generate or import a key first."
    );
  }

  const description = `Orbs Liquidity Hub swap: ${params.inAmount} of ${params.fromToken} → ${params.toToken} on chain ${chainId}`;
  const { queued, id, summary } = confirmationQueue.enqueue("orbs_swap", description, {
    ...params,
    chainId,
  });

  if (queued) {
    return formatToolResponse({ status: "pending_confirmation", id, summary });
  }

  try {
    const { getSdk } = await import("../../orbs/liquidity-hub.js");
    const sdk = getSdk(chainId);
    const account = getActiveAccount();

    const quote = await sdk.getQuote({
      fromToken: params.fromToken as string,
      toToken: params.toToken as string,
      inAmount: params.inAmount as string,
      slippage: (params.slippage as number) ?? 0.5,
      account: account.address,
    });

    if (quote.error) {
      return formatToolError("ORBS_QUOTE_ERROR", quote.error);
    }

    if (!account.signTypedData) {
      return formatToolError("WALLET_ERROR", "Active account does not support EIP-712 signing");
    }
    const signature = await account.signTypedData({
      domain: quote.eip712?.domain,
      types: quote.eip712?.types,
      primaryType: quote.eip712?.primaryType ?? "PermitWitnessTransferFrom",
      message: quote.eip712?.message ?? quote.permitData,
    });

    const txHash = await sdk.swap(quote, signature);
    return formatToolResponse({
      txHash,
      quote: { outAmount: quote.outAmount, minAmountOut: quote.minAmountOut },
    });
  } catch (e) {
    return formatToolError("ORBS_SWAP_ERROR", String(e));
  }
}

async function orbsPlaceTwap(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = Number(params.chainId ?? getConfig().chainId);

  if (!isTwapSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getTwapError(chainId));
  }

  const walletState = getWalletState();
  if (walletState.mode === "read-only") {
    return formatToolError("WALLET_READ_ONLY", "orbs_place_twap requires an active wallet.");
  }

  const chunks = Number(params.chunks ?? 5);
  const fillDelay = Number(params.fillDelay ?? 300);
  const description = `dTWAP order: ${params.srcAmount} of ${params.srcToken} → ${params.dstToken}, ${chunks} chunks, ${fillDelay}s delay on chain ${chainId}`;

  const { queued, id, summary } = confirmationQueue.enqueue("orbs_place_twap", description, {
    ...params,
    chainId,
  });

  if (queued) {
    return formatToolResponse({ status: "pending_confirmation", id, summary });
  }

  try {
    const { prepareTwapOrder, submitSignedOrder } = await import("../../orbs/twap.js");
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

    const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
    const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
    const v = `0x${signature.slice(130, 132)}` as `0x${string}`;

    const order = await submitSignedOrder(prepared.order, { v, r, s });
    return formatToolResponse({
      orderId: order.id,
      status: order.status,
      txHash: order.txHash,
    });
  } catch (e) {
    return formatToolError("ORBS_TWAP_ERROR", String(e));
  }
}

async function orbsPlaceLimit(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = Number(params.chainId ?? getConfig().chainId);

  if (!isTwapSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getTwapError(chainId));
  }

  const walletState = getWalletState();
  if (walletState.mode === "read-only") {
    return formatToolError("WALLET_READ_ONLY", "orbs_place_limit requires an active wallet.");
  }

  const description = `dLIMIT order: ${params.srcAmount} of ${params.srcToken} → ${params.dstToken}, min output ${params.dstMinAmount} on chain ${chainId}`;
  const { queued, id, summary } = confirmationQueue.enqueue("orbs_place_limit", description, {
    ...params,
    chainId,
  });

  if (queued) {
    return formatToolResponse({ status: "pending_confirmation", id, summary });
  }

  try {
    const { prepareTwapOrder, submitSignedOrder } = await import("../../orbs/twap.js");
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

    const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
    const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
    const v = `0x${signature.slice(130, 132)}` as `0x${string}`;

    const order = await submitSignedOrder(prepared.order, { v, r, s });
    return formatToolResponse({
      orderId: order.id,
      status: order.status,
      txHash: order.txHash,
    });
  } catch (e) {
    return formatToolError("ORBS_LIMIT_ERROR", String(e));
  }
}

async function orbsListOrders(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = Number(params.chainId ?? getConfig().chainId);

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
    const { listOrders } = await import("../../orbs/twap.js");
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
  } catch (e) {
    return formatToolError("ORBS_LIST_ERROR", String(e));
  }
}

export function getOrbsToolDefinitions(): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      name: "orbs_get_quote",
      description: "Get a quote from Orbs Liquidity Hub for same-chain aggregated swap",
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
    },
    {
      name: "orbs_swap",
      description: "Execute a same-chain swap via Orbs Liquidity Hub (write, confirmation-gated)",
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
    },
    {
      name: "orbs_place_twap",
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
    },
    {
      name: "orbs_place_limit",
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
    },
    {
      name: "orbs_list_orders",
      description: "List open TWAP/dLIMIT orders for active wallet",
      inputSchema: {
        type: "object" as const,
        properties: {
          chainId: { type: "number" },
        },
        required: ["chainId"],
      },
      handler: orbsListOrders,
    },
    ...getDsltpToolDefinitions(),
  ];

  return tools;
}
