import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { getLiquidityHubError, isLiquidityHubSupported } from "../../orbs/chains.js";
import { getQuote } from "../../orbs/liquidity-hub.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { resolveToolChainId } from "../shared/chain-context.js";
import { orbsGetQuoteSchema } from "./schemas.js";

export async function orbsGetQuote(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsGetQuoteSchema, params);
  if (!v.success) return v.error;
  const { fromToken, toToken, fromAmount, slippagePct } = v.data;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isLiquidityHubSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getLiquidityHubError(chainId));
  }

  try {
    const result = await getQuote(chainId, {
      fromToken,
      toToken,
      inAmount: fromAmount,
      slippage: slippagePct ?? 0.5,
    });

    return formatToolResponse(result);
  } catch (e: unknown) {
    return formatToolError("ORBS_QUOTE_ERROR", String(e));
  }
}
