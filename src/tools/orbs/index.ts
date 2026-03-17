import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  getRequiredApprovals as getRequiredApprovalsForIntent,
  prepareSwapIntent,
  submitSignedSwap as submitPreparedSwap,
} from "../../api/intents.js";
import { getRequiredApprovals } from "../../api/operations/orbs.js";
import {
  getLiquidityHubError,
  getSpotError,
  isLiquidityHubSupported,
  isSpotSupported,
} from "../../orbs/chains.js";
import {
  DEX_MIN_AMOUNT_OUT_DISABLED,
  getQuote,
  getSdk,
  normalizeEip712ForSigning,
  pollSwapStatus,
  prepareSwap,
  submitSwap,
} from "../../orbs/liquidity-hub.js";
import { querySpotOrders, submitSpotOrder } from "../../orbs/spot-client.js";
import { REPERMIT_CANCEL_ABI, getSpotApiUrl, getSpotContracts } from "../../orbs/spot-config.js";
import { prepareSpotOrder } from "../../orbs/spot-prepare.js";
import { listOrders } from "../../orbs/twap.js";
import type { ToolDefinition } from "../../tools/register.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { splitSignature } from "../../utils/signature.js";
import { resolveChainId } from "../../utils/tool-helpers.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getActiveAccount, getWalletState } from "../../wallet/persistence.js";
import { resolveToolChainId } from "../shared/chain-context.js";
import { createToolHandler } from "../shared/handler-factory.js";
import { buildWriteContext, isWriteContext } from "../shared/write-context.js";
import {
  orbsCancelOrderSchema,
  orbsGetQuoteSchema,
  orbsGetRequiredApprovalsSchema,
  orbsPlaceLimitSchema,
  orbsPlaceOrderSchema,
  orbsPlaceTwapSchema,
  orbsPrepareLimitIntentSchema,
  orbsPrepareOrderIntentSchema,
  orbsPrepareSwapIntentSchema,
  orbsPrepareTwapIntentSchema,
  orbsQueryOrdersSchema,
  orbsSubmitSignedOrderSchema,
  orbsSubmitSignedSwapSchema,
  orbsSwapSchema,
  orbsSwapStatusSchema,
} from "./schemas.js";

/* ---------- Existing swap handlers ---------- */

async function orbsGetQuote(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsGetQuoteSchema, params);
  if (!v.success) return v.error;
  const { fromToken, toToken, fromAmount, slippage } = v.data;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isLiquidityHubSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getLiquidityHubError(chainId));
  }

  try {
    const result = await getQuote(chainId, {
      fromToken,
      toToken,
      inAmount: fromAmount,
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
      inAmount: params.fromAmount as string,
      account,
    });

    const sdk = getSdk(chainId);
    const slippage = (params.slippage as number) ?? 0.5;
    const toToken = params.toToken as string;
    const inAmount = params.fromAmount as string;

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
  const { sessionId, user, maxAttempts } = v.data;
  const chainId = resolveToolChainId(v.data.chainId);

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
  const { fromToken, toToken, fromAmount } = v.data;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isLiquidityHubSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getLiquidityHubError(chainId));
  }

  return executeWrite({
    toolName: "orbs_swap",
    description: `Orbs Liquidity Hub swap: ${fromAmount} of ${fromToken} → ${toToken} on chain ${chainId}`,
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

const orbsSubmitSignedSwapTool = createToolHandler(
  orbsSubmitSignedSwapSchema,
  submitPreparedSwap,
  "ORBS_SWAP_ERROR"
);

/* ---------- New Spot order handlers ---------- */

async function executeSpotOrderNow(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = resolveChainId(params);

  try {
    const account = getActiveAccount();

    const prepared = prepareSpotOrder({
      chainId,
      swapper: account.address,
      fromToken: params.fromToken as string,
      fromAmount: params.fromAmount as string,
      toToken: params.toToken as string,
      fromMaxAmount: params.fromMaxAmount as string | undefined,
      epoch: params.epoch as number | undefined,
      slippage: params.slippage as number | undefined,
      outputLimit: params.outputLimit as string | undefined,
      outputTriggerLower: params.outputTriggerLower as string | undefined,
      outputTriggerUpper: params.outputTriggerUpper as string | undefined,
      start: params.start as number | undefined,
      deadline: params.deadline as number | undefined,
      exactApproval: params.exactApproval as boolean | undefined,
    });

    // Check & execute approvals to RePermit
    const approvalSteps = await getRequiredApprovals({
      chainId,
      fromToken: params.fromToken as string,
      fromAmount: prepared.approval.amount,
      account: account.address,
      mode: "order",
      exactApproval: params.exactApproval as boolean | undefined,
    });

    if (approvalSteps.some((s) => s.tx?.data)) {
      const ctx = buildWriteContext(chainId);
      if (!isWriteContext(ctx)) return ctx;

      for (const step of approvalSteps) {
        if (step.tx?.data) {
          const txHash = await ctx.walletClient.sendTransaction({
            to: step.tx.to,
            data: step.tx.data,
            value: step.tx.value ? BigInt(step.tx.value) : 0n,
            chain: ctx.chain,
            account: ctx.account,
          });

          process.stderr.write(`[orbs-spot] Approval tx sent: ${txHash}\n`);
          await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });
          process.stderr.write(`[orbs-spot] Approval tx confirmed: ${txHash}\n`);
        }
      }
    }

    // Sign EIP-712 typed data
    if (!account.signTypedData) {
      return formatToolError("WALLET_ERROR", "Active account does not support EIP-712 signing");
    }

    const signature = await account.signTypedData({
      domain: {
        ...prepared.typedData.domain,
        verifyingContract: prepared.typedData.domain.verifyingContract as `0x${string}`,
      },
      types: prepared.typedData.types,
      primaryType: prepared.typedData.primaryType,
      message: prepared.typedData.message as unknown as Record<string, unknown>,
    });

    const { v, r, s } = splitSignature(signature);

    // Submit via Spot API
    const result = await submitSpotOrder({
      url: prepared.submit.url,
      order: prepared.submit.body.order as Record<string, unknown>,
      signature: { v, r, s },
    });

    if (!result.ok) {
      return formatToolError(
        "ORBS_ORDER_ERROR",
        `Spot API returned ${result.status}: ${typeof result.response === "string" ? result.response : JSON.stringify(result.response)}`
      );
    }

    return formatToolResponse({
      status: "submitted",
      response: result.response,
      meta: prepared.meta,
      warnings: prepared.warnings,
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_ORDER_ERROR", String(e));
  }
}

async function orbsPlaceOrder(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsPlaceOrderSchema, params);
  if (!v.success) return v.error;
  const { fromToken, toToken, fromAmount } = v.data;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isSpotSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getSpotError(chainId));
  }

  return executeWrite({
    toolName: "orbs_place_order",
    description: `Spot order: ${fromAmount} of ${fromToken} → ${toToken} on chain ${chainId}`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeSpotOrderNow,
  });
}

async function orbsPrepareOrderIntent(params: Record<string, unknown>): Promise<CallToolResult> {
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
      slippage: v.data.slippage,
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

async function orbsSubmitSignedOrderHandler(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  const v = validateInput(orbsSubmitSignedOrderSchema, params);
  if (!v.success) return v.error;

  const expectedBase = getSpotApiUrl();
  if (!v.data.submitUrl.startsWith(expectedBase)) {
    return formatToolError(
      "ORBS_ORDER_ERROR",
      `Submit URL must start with ${expectedBase}. Refusing to send signed order to untrusted endpoint.`
    );
  }

  try {
    const { v: sigV, r, s } = splitSignature(v.data.signature);

    const result = await submitSpotOrder({
      url: v.data.submitUrl,
      order: v.data.order,
      signature: { v: sigV, r, s },
    });

    if (!result.ok) {
      return formatToolError(
        "ORBS_ORDER_ERROR",
        `Spot API returned ${result.status}: ${typeof result.response === "string" ? result.response : JSON.stringify(result.response)}`
      );
    }

    return formatToolResponse({
      status: "submitted",
      response: result.response,
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_ORDER_ERROR", String(e));
  }
}

async function orbsQueryOrders(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsQueryOrdersSchema, params);
  if (!v.success) return v.error;

  try {
    // Try Spot API first
    const spotResult = await querySpotOrders({
      swapper: v.data.swapper,
      hash: v.data.hash,
    });

    if (spotResult.ok) {
      return formatToolResponse({
        source: "spot",
        orders: spotResult.orders,
      });
    }

    // If Spot API fails AND swapper is provided, fall back to SDK listOrders
    if (v.data.swapper) {
      const chainId = resolveToolChainId(v.data.chainId);
      try {
        const sdkOrders = await listOrders(chainId, v.data.swapper);
        return formatToolResponse({
          source: "sdk-fallback",
          orders: sdkOrders.map((o) => ({
            id: o.id,
            type: o.type,
            status: o.status,
            fromToken: o.srcTokenAddress,
            toToken: o.dstTokenAddress,
            fromAmount: o.srcAmount,
            progress: o.progress,
            createdAt: o.createdAt,
          })),
        });
      } catch (fallbackErr: unknown) {
        process.stderr.write(`[orbs-spot] SDK fallback also failed: ${fallbackErr}\n`);
      }
    }

    return formatToolError(
      "ORBS_QUERY_ERROR",
      `Spot API returned status ${spotResult.status}: ${spotResult.error}`
    );
  } catch (e: unknown) {
    return formatToolError("ORBS_QUERY_ERROR", String(e));
  }
}

async function executeSpotCancelNow(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = resolveChainId(params);
  const digest = params.digest as `0x${string}`;

  try {
    const ctx = buildWriteContext(chainId);
    if (!isWriteContext(ctx)) return ctx;

    const contracts = getSpotContracts();

    const txHash = await ctx.walletClient.writeContract({
      address: contracts.repermit,
      abi: REPERMIT_CANCEL_ABI,
      functionName: "cancel",
      args: [[digest]],
      chain: ctx.chain,
      account: ctx.account,
    });

    process.stderr.write(`[orbs-spot] Cancel tx sent: ${txHash}\n`);
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });

    return formatToolResponse({
      status: receipt.status === "success" ? "cancelled" : "failed",
      txHash,
      digest,
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_CANCEL_ERROR", String(e));
  }
}

async function orbsCancelOrder(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsCancelOrderSchema, params);
  if (!v.success) return v.error;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isSpotSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getSpotError(chainId));
  }

  return executeWrite({
    toolName: "orbs_cancel_order",
    description: `Cancel Spot order ${v.data.digest} on chain ${chainId}`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeSpotCancelNow,
  });
}

/* ---------- TWAP / Limit param mapping ---------- */

function twapParamsToSpotParams(params: {
  fromAmount: string;
  chunks: number;
  fillDelay: number;
  slippage?: number;
  exactApproval?: boolean;
}): {
  fromAmount: string;
  fromMaxAmount: string;
  epoch: number;
  slippage?: number;
  exactApproval?: boolean;
} {
  const totalAmount = BigInt(params.fromAmount);
  const perChunkAmount = totalAmount / BigInt(params.chunks);
  return {
    fromAmount: perChunkAmount.toString(),
    fromMaxAmount: params.fromAmount,
    epoch: params.fillDelay,
    slippage: params.slippage,
    exactApproval: params.exactApproval,
  };
}

function limitParamsToSpotParams(params: {
  fromAmount: string;
  toMinAmount: string;
  expiry?: number;
  slippage?: number;
  exactApproval?: boolean;
}): {
  fromAmount: string;
  outputLimit: string;
  deadline?: number;
  slippage?: number;
  exactApproval?: boolean;
} {
  return {
    fromAmount: params.fromAmount,
    outputLimit: params.toMinAmount,
    deadline:
      params.expiry !== undefined ? Math.floor(Date.now() / 1000) + params.expiry : undefined,
    slippage: params.slippage,
    exactApproval: params.exactApproval,
  };
}

/* ---------- TWAP wrapper handlers ---------- */

async function orbsPlaceTwap(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsPlaceTwapSchema, params);
  if (!v.success) return v.error;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isSpotSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getSpotError(chainId));
  }

  const spotParams = twapParamsToSpotParams(v.data);

  return executeWrite({
    toolName: "orbs_place_twap",
    description: `TWAP order: ${v.data.fromAmount} of ${v.data.fromToken} → ${v.data.toToken}, ${v.data.chunks} chunks, ${v.data.fillDelay}s delay on chain ${chainId}`,
    params: {
      fromToken: v.data.fromToken,
      toToken: v.data.toToken,
      chainId,
      ...spotParams,
    } as Record<string, unknown>,
    executor: executeSpotOrderNow,
  });
}

async function orbsPrepareTwapIntent(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsPrepareTwapIntentSchema, params);
  if (!v.success) return v.error;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isSpotSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getSpotError(chainId));
  }

  try {
    const spotParams = twapParamsToSpotParams(v.data);

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
    return formatToolError("ORBS_TWAP_ERROR", String(e));
  }
}

/* ---------- Limit wrapper handlers ---------- */

async function orbsPlaceLimit(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsPlaceLimitSchema, params);
  if (!v.success) return v.error;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isSpotSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getSpotError(chainId));
  }

  const spotParams = limitParamsToSpotParams(v.data);

  return executeWrite({
    toolName: "orbs_place_limit",
    description: `Limit order: ${v.data.fromAmount} of ${v.data.fromToken} → ${v.data.toToken}, min output ${v.data.toMinAmount} on chain ${chainId}`,
    params: {
      fromToken: v.data.fromToken,
      toToken: v.data.toToken,
      chainId,
      ...spotParams,
    } as Record<string, unknown>,
    executor: executeSpotOrderNow,
  });
}

async function orbsPrepareLimitIntent(params: Record<string, unknown>): Promise<CallToolResult> {
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

/* ---------- Tool definitions ---------- */

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
      riskLevel: "financial",
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
      name: "orbs_submit_signed_swap",
      category: "swap",
      description:
        "Submit an externally signed Orbs Liquidity Hub swap using the quote returned by orbs_prepare_swap_intent.",
      inputSchema: zodToJsonSchema(orbsSubmitSignedSwapSchema) as Record<string, unknown>,
      handler: orbsSubmitSignedSwapTool,
      riskLevel: "financial",
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
      name: "orbs_place_twap",
      category: "orders",
      description:
        "Place a TWAP (time-weighted average price) order via Spot protocol. " +
        "Splits fromAmount into equal chunks executed at regular intervals. Write, confirmation-gated.",
      inputSchema: zodToJsonSchema(orbsPlaceTwapSchema) as Record<string, unknown>,
      handler: orbsPlaceTwap,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_prepare_twap_intent",
      category: "orders",
      description:
        "Prepare a TWAP order for external wallet signing. Returns EIP-712 typed data, approval calldata, and metadata.",
      inputSchema: zodToJsonSchema(orbsPrepareTwapIntentSchema) as Record<string, unknown>,
      handler: orbsPrepareTwapIntent,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_place_limit",
      category: "orders",
      description:
        "Place a limit order via Spot protocol. Executes only when output meets minimum amount. Write, confirmation-gated.",
      inputSchema: zodToJsonSchema(orbsPlaceLimitSchema) as Record<string, unknown>,
      handler: orbsPlaceLimit,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_prepare_limit_intent",
      category: "orders",
      description:
        "Prepare a limit order for external wallet signing. Returns EIP-712 typed data, approval calldata, and metadata.",
      inputSchema: zodToJsonSchema(orbsPrepareLimitIntentSchema) as Record<string, unknown>,
      handler: orbsPrepareLimitIntent,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_place_order",
      category: "orders",
      description:
        "Place a gasless order via Spot protocol. Supports market, limit, TWAP, stop-loss, take-profit, " +
        "and delayed orders. Order type determined by parameters: limit (outputLimit > 0), " +
        "chunked/TWAP (fromMaxAmount > fromAmount + epoch), stop-loss (outputTriggerLower), " +
        "take-profit (outputTriggerUpper), delayed (future start). Write, confirmation-gated.",
      inputSchema: zodToJsonSchema(orbsPlaceOrderSchema) as Record<string, unknown>,
      handler: orbsPlaceOrder,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_prepare_order_intent",
      category: "orders",
      description:
        "Prepare a Spot order for external wallet signing. Returns EIP-712 typed data, " +
        "approval calldata, submit URL, and order metadata. Supports all order types.",
      inputSchema: zodToJsonSchema(orbsPrepareOrderIntentSchema) as Record<string, unknown>,
      handler: orbsPrepareOrderIntent,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_submit_signed_order",
      category: "orders",
      description:
        "Submit an externally signed Spot order using the submit URL and order from orbs_prepare_order_intent.",
      inputSchema: zodToJsonSchema(orbsSubmitSignedOrderSchema) as Record<string, unknown>,
      handler: orbsSubmitSignedOrderHandler,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "orbs_query_orders",
      category: "orders",
      description:
        "Query Spot orders by swapper address or order hash. Falls back to SDK query if Spot API unavailable.",
      inputSchema: zodToJsonSchema(orbsQueryOrdersSchema) as Record<string, unknown>,
      handler: orbsQueryOrders,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "orbs_cancel_order",
      category: "orders",
      description:
        "Cancel a Spot order onchain by calling RePermit.cancel with the order digest. Write, confirmation-gated.",
      inputSchema: zodToJsonSchema(orbsCancelOrderSchema) as Record<string, unknown>,
      handler: orbsCancelOrder,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
  ];

  return tools;
}

export function registerOrbsExecutors(): void {
  registerExecutor("orbs_swap", executeOrbsSwapNow);
  registerExecutor("orbs_place_order", executeSpotOrderNow);
  registerExecutor("orbs_place_twap", executeSpotOrderNow);
  registerExecutor("orbs_place_limit", executeSpotOrderNow);
  registerExecutor("orbs_cancel_order", executeSpotCancelNow);
}
