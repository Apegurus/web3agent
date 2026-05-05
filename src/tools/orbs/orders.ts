import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Hex } from "viem";

import { getRequiredApprovals } from "../../api/operations/orbs.js";
import { getSpotError, isSpotSupported } from "../../orbs/chains.js";
import { querySpotOrders, submitSpotOrder } from "../../orbs/spot-client.js";
import {
  REPERMIT_CANCEL_ABI,
  getSpotApiUrl,
  getSpotContracts,
  isTrustedSpotSubmitUrl,
} from "../../orbs/spot-config.js";
import { prepareSpotOrder } from "../../orbs/spot-prepare.js";
import { type TwapToSpotParamsResult, twapParamsToSpotParams } from "../../orbs/twap-compat.js";
import { listOrders } from "../../orbs/twap.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { splitSignature } from "../../utils/signature.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { getActiveAccount } from "../../wallet/persistence.js";
import { resolveToolChainId } from "../shared/chain-context.js";
import { buildWriteContext, isWriteContext } from "../shared/write-context.js";
import { limitParamsToSpotParams } from "./helpers.js";
import {
  orbsCancelOrderSchema,
  orbsPlaceLimitSchema,
  orbsPlaceOrderSchema,
  orbsPlaceTwapSchema,
  orbsQueryOrdersSchema,
  orbsSubmitSignedOrderSchema,
} from "./schemas.js";

export async function executeSpotOrderNow(
  rawParams: Record<string, unknown>
): Promise<CallToolResult> {
  const params = { ...rawParams };
  if ("srcToken" in params && !("fromToken" in params)) {
    params.fromToken = params.srcToken;
    params.srcToken = undefined;
  }
  if ("dstToken" in params && !("toToken" in params)) {
    params.toToken = params.dstToken;
    params.dstToken = undefined;
  }
  if ("srcAmount" in params && !("fromAmount" in params)) {
    params.fromAmount = params.srcAmount;
    params.srcAmount = undefined;
  }
  if ("inAmount" in params && !("fromAmount" in params)) {
    params.fromAmount = params.inAmount;
    params.inAmount = undefined;
  }
  if ("dstMinAmount" in params && !("toMinAmount" in params)) {
    params.toMinAmount = params.dstMinAmount;
    params.dstMinAmount = undefined;
  }

  try {
    if (
      typeof params.chunks === "number" &&
      params.chunks >= 1 &&
      typeof params.fillDelay === "number" &&
      typeof params.fromAmount === "string"
    ) {
      const spotParams = twapParamsToSpotParams({
        fromAmount: params.fromAmount,
        chunks: params.chunks,
        fillDelay: params.fillDelay,
        slippageBps:
          typeof params.slippageBps === "number"
            ? params.slippageBps
            : typeof params.slippage === "number"
              ? params.slippage
              : undefined,
        exactApproval: typeof params.exactApproval === "boolean" ? params.exactApproval : undefined,
      });
      params.fromAmount = spotParams.fromAmount;
      params.fromMaxAmount = spotParams.fromMaxAmount;
      params.epoch = spotParams.epoch;
      params.chunks = undefined;
      params.fillDelay = undefined;
    }

    if (typeof params.toMinAmount === "string" && !("outputLimit" in params)) {
      const spotParams = limitParamsToSpotParams({
        fromAmount: params.fromAmount as string,
        toMinAmount: params.toMinAmount,
        expiry: typeof params.expiry === "number" ? params.expiry : undefined,
        slippageBps:
          typeof params.slippageBps === "number"
            ? params.slippageBps
            : typeof params.slippage === "number"
              ? params.slippage
              : undefined,
        exactApproval: typeof params.exactApproval === "boolean" ? params.exactApproval : undefined,
      });
      params.outputLimit = spotParams.outputLimit;
      if (spotParams.deadline !== undefined) params.deadline = spotParams.deadline;
      params.toMinAmount = undefined;
      params.expiry = undefined;
    }
  } catch (e: unknown) {
    return formatToolError("INVALID_PARAMS", e instanceof Error ? e.message : String(e));
  }

  try {
    const chainId = resolveToolChainId(params.chainId as number | undefined);
    const account = getActiveAccount();

    const prepared = prepareSpotOrder({
      chainId,
      swapper: account.address,
      fromToken: params.fromToken as string,
      fromAmount: params.fromAmount as string,
      toToken: params.toToken as string,
      fromMaxAmount: params.fromMaxAmount as string | undefined,
      epoch: params.epoch as number | undefined,
      slippage:
        (params.slippageBps as number | undefined) ?? (params.slippage as number | undefined),
      outputLimit: params.outputLimit as string | undefined,
      outputTriggerLower: params.outputTriggerLower as string | undefined,
      outputTriggerUpper: params.outputTriggerUpper as string | undefined,
      start: params.start as number | undefined,
      deadline: params.deadline as number | undefined,
      exactApproval: params.exactApproval as boolean | undefined,
    });

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

    if (!account.signTypedData) {
      return formatToolError("WALLET_ERROR", "Active account does not support EIP-712 signing");
    }

    const signature = await account.signTypedData({
      domain: {
        ...prepared.typedData.domain,
        verifyingContract: prepared.typedData.domain.verifyingContract as Hex,
      },
      types: prepared.typedData.types,
      primaryType: prepared.typedData.primaryType,
      message: prepared.typedData.message as unknown as Record<string, unknown>,
    });

    const { v, r, s } = splitSignature(signature);

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

export async function orbsPlaceOrder(params: Record<string, unknown>): Promise<CallToolResult> {
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

export async function orbsSubmitSignedOrderHandler(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  const v = validateInput(orbsSubmitSignedOrderSchema, params);
  if (!v.success) return v.error;

  const expectedBase = getSpotApiUrl();
  if (!isTrustedSpotSubmitUrl(v.data.submitUrl, expectedBase)) {
    return formatToolError(
      "ORBS_ORDER_ERROR",
      `Submit URL must target the trusted Spot submit endpoint under ${expectedBase}. Refusing to send signed order to untrusted endpoint.`
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

export async function orbsQueryOrders(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsQueryOrdersSchema, params);
  if (!v.success) return v.error;

  try {
    const spotResult = await querySpotOrders({
      swapper: v.data.swapper,
      hash: v.data.hash,
    });

    if (spotResult.ok) {
      return formatToolResponse({
        source: "spot",
        count: spotResult.orders.length,
        orders: spotResult.orders,
      });
    }

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

export async function executeSpotCancelNow(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  const chainId = resolveToolChainId(params.chainId as number | undefined);
  const digest = params.digest as Hex;

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

export async function orbsCancelOrder(params: Record<string, unknown>): Promise<CallToolResult> {
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

export async function orbsPlaceTwap(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsPlaceTwapSchema, params);
  if (!v.success) return v.error;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isSpotSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getSpotError(chainId));
  }

  let spotParams: TwapToSpotParamsResult;
  try {
    spotParams = twapParamsToSpotParams(v.data);
  } catch (e: unknown) {
    return formatToolError(
      "INVALID_PARAMS",
      e instanceof Error ? e.message : "Invalid TWAP parameters"
    );
  }

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

export async function orbsPlaceLimit(params: Record<string, unknown>): Promise<CallToolResult> {
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
