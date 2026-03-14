import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  getRequiredApprovals as getRequiredApprovalsForIntent,
  prepareLimitIntent,
  prepareSwapIntent,
  prepareTwapIntent,
  submitSignedSwap as submitPreparedSwap,
  submitSignedTwapOrder,
} from "../../api/intents.js";
import {
  getLiquidityHubError,
  getTwapError,
  isLiquidityHubSupported,
  isTwapSupported,
} from "../../orbs/chains.js";
import { getDsltpToolDefinitions } from "../../orbs/dsltp.js";
import {
  DEX_MIN_AMOUNT_OUT_DISABLED,
  getQuote,
  getSdk,
  normalizeEip712ForSigning,
  pollSwapStatus,
  prepareSwap,
  submitSwap,
} from "../../orbs/liquidity-hub.js";
import {
  getTwapDurationSeconds,
  listOrders,
  prepareTwapOrder,
  submitSignedOrder,
} from "../../orbs/twap.js";
import type { ToolDefinition } from "../../tools/register.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { splitSignature } from "../../utils/signature.js";
import { resolveChainId } from "../../utils/tool-helpers.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getActiveAccount, getWalletState } from "../../wallet/persistence.js";
import { createToolHandler } from "../shared/handler-factory.js";
import {
  orbsGetQuoteSchema,
  orbsGetRequiredApprovalsSchema,
  orbsListOrdersSchema,
  orbsPlaceLimitSchema,
  orbsPlaceTwapSchema,
  orbsPrepareLimitIntentSchema,
  orbsPrepareSwapIntentSchema,
  orbsPrepareTwapIntentSchema,
  orbsSubmitSignedSwapSchema,
  orbsSubmitSignedTwapOrderSchema,
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
      dexMinAmountOut: DEX_MIN_AMOUNT_OUT_DISABLED,
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

const orbsPrepareSwapIntentTool = createToolHandler(
  orbsPrepareSwapIntentSchema,
  prepareSwapIntent,
  "ORBS_QUOTE_ERROR"
);

const orbsGetRequiredApprovalsTool = createToolHandler(
  orbsGetRequiredApprovalsSchema,
  getRequiredApprovalsForIntent,
  "APPROVAL_CHECK_ERROR"
);

async function executeOrbsTwapNow(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = resolveChainId(params);
  const chunks = Number(params.chunks ?? 5);
  const fillDelay = Number(params.fillDelay ?? 300);

  try {
    const account = getActiveAccount();

    const durationSeconds = getTwapDurationSeconds(chunks, fillDelay);
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

const orbsPrepareTwapIntentTool = createToolHandler(
  orbsPrepareTwapIntentSchema,
  prepareTwapIntent,
  "ORBS_TWAP_ERROR"
);

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

const orbsPrepareLimitIntentTool = createToolHandler(
  orbsPrepareLimitIntentSchema,
  prepareLimitIntent,
  "ORBS_LIMIT_ERROR"
);

const orbsSubmitSignedSwapTool = createToolHandler(
  orbsSubmitSignedSwapSchema,
  submitPreparedSwap,
  "ORBS_SWAP_ERROR"
);

const orbsSubmitSignedTwapOrderTool = createToolHandler(
  orbsSubmitSignedTwapOrderSchema,
  submitSignedTwapOrder,
  "ORBS_TWAP_ERROR"
);

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
      inputSchema: zodToJsonSchema(orbsGetQuoteSchema) as Record<string, unknown>,
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
      inputSchema: zodToJsonSchema(orbsSwapSchema) as Record<string, unknown>,
      handler: orbsSwap,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_prepare_swap_intent",
      category: "swap",
      description:
        "Prepare a same-chain Orbs swap intent for external wallet signing. Returns required approvals, full quote, and EIP-712 typed data.",
      inputSchema: zodToJsonSchema(orbsPrepareSwapIntentSchema) as Record<string, unknown>,
      handler: orbsPrepareSwapIntentTool,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_get_required_approvals",
      category: "swap",
      description:
        "Check whether wrapping native assets or approving Permit2 is required before signing an Orbs swap intent.",
      inputSchema: zodToJsonSchema(orbsGetRequiredApprovalsSchema) as Record<string, unknown>,
      handler: orbsGetRequiredApprovalsTool,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_place_twap",
      category: "orders",
      description: "Place a dTWAP (time-weighted average price) order (write, confirmation-gated)",
      inputSchema: zodToJsonSchema(orbsPlaceTwapSchema) as Record<string, unknown>,
      handler: orbsPlaceTwap,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_prepare_twap_intent",
      category: "orders",
      description:
        "Prepare a dTWAP order for external wallet signing. Returns raw order data and EIP-712 typed data.",
      inputSchema: zodToJsonSchema(orbsPrepareTwapIntentSchema) as Record<string, unknown>,
      handler: orbsPrepareTwapIntentTool,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_place_limit",
      category: "orders",
      description: "Place a dLIMIT order (write, confirmation-gated)",
      inputSchema: zodToJsonSchema(orbsPlaceLimitSchema) as Record<string, unknown>,
      handler: orbsPlaceLimit,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_prepare_limit_intent",
      category: "orders",
      description:
        "Prepare a dLIMIT order for external wallet signing. Returns raw order data and EIP-712 typed data.",
      inputSchema: zodToJsonSchema(orbsPrepareLimitIntentSchema) as Record<string, unknown>,
      handler: orbsPrepareLimitIntentTool,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_submit_signed_swap",
      category: "swap",
      description:
        "Submit an externally signed Orbs Liquidity Hub swap using the quote returned by orbs_prepare_swap_intent.",
      inputSchema: zodToJsonSchema(orbsSubmitSignedSwapSchema) as Record<string, unknown>,
      handler: orbsSubmitSignedSwapTool,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_submit_signed_twap_order",
      category: "orders",
      description:
        "Submit an externally signed dTWAP or dLIMIT order using the order returned by the prepare intent tools.",
      inputSchema: zodToJsonSchema(orbsSubmitSignedTwapOrderSchema) as Record<string, unknown>,
      handler: orbsSubmitSignedTwapOrderTool,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_swap_status",
      category: "swap",
      description: "Check the status of a pending Orbs Liquidity Hub swap",
      inputSchema: zodToJsonSchema(orbsSwapStatusSchema) as Record<string, unknown>,
      handler: orbsSwapStatus,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_list_orders",
      category: "orders",
      description: "List open TWAP/dLIMIT orders for active wallet",
      inputSchema: zodToJsonSchema(orbsListOrdersSchema) as Record<string, unknown>,
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
