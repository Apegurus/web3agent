import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { getLiquidityHubError, isLiquidityHubSupported } from "../../orbs/chains.js";
import {
  DEX_MIN_AMOUNT_OUT_DISABLED,
  getSdk,
  normalizeEip712ForSigning,
  pollSwapStatus,
  prepareSwap,
  submitSwap,
} from "../../orbs/liquidity-hub.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { executeWrite } from "../../utils/write.js";
import { getActiveAccount } from "../../wallet/persistence.js";
import { resolveToolChainId } from "../shared/chain-context.js";
import { orbsSwapSchema, orbsSwapStatusSchema } from "./schemas.js";

import { validateInput } from "../../utils/validation.js";

export async function executeOrbsSwapNow(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = resolveToolChainId(params.chainId as number | undefined);

  try {
    const account = getActiveAccount();

    const { fromToken } = await prepareSwap({
      chainId,
      fromToken: params.fromToken as string,
      inAmount: params.fromAmount as string,
      account,
    });

    const sdk = getSdk(chainId);
    const slippage = (params.slippagePct as number) ?? 0.5;
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

export async function orbsSwapStatus(params: Record<string, unknown>): Promise<CallToolResult> {
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

export async function orbsSwap(params: Record<string, unknown>): Promise<CallToolResult> {
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
