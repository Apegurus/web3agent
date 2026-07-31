import { zeroAddress } from "viem";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Web3AgentError } from "../../api/errors.js";
import { getConfig } from "../../config/env.js";
import { prepareLifiRoute } from "../../lifi/route-execution.js";
import { assertAddress } from "../../operations/validation.js";
import { formatToolErrorFromUnknown, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getWalletState } from "../../wallet/persistence.js";
import { classifyZeroExError, getZeroExQuote } from "../../zerox/client.js";
import type { ToolDefinition } from "../register.js";
import { resolveToolChainId } from "../shared/chain-context.js";
import { prepareZeroExExecution } from "./confirmed-execution.js";
import { executeConfirmedLifiFallback, executeConfirmedZeroExSwap } from "./execution.js";
import { getLifiRouteIntegrityHash, zeroExLifiFallbackSchema } from "./lifi-confirmation.js";
import { zeroExSwapSchema } from "./schemas.js";

function getZeroExApiKey(): string {
  const apiKey = getConfig().zeroxApiKey;
  if (!apiKey) {
    throw new Web3AgentError({
      code: "ZEROEX_AUTHENTICATION",
      message: "ZEROX_API_KEY is required for Robinhood 0x swaps",
    });
  }
  return apiKey;
}

function getZeroExQuoteInput(params: Record<string, unknown>, chainId: number, taker: string) {
  return {
    apiKey: getZeroExApiKey(),
    chainId,
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    taker,
    ...(typeof params.slippageBps === "number" ? { slippageBps: params.slippageBps } : {}),
    ...(typeof params.referencePrice === "string" ? { referencePrice: params.referencePrice } : {}),
  };
}

function getRobinhoodChainId(params: Record<string, unknown>): number | undefined {
  const chainId = resolveToolChainId(params.chainId as number | undefined);
  return chainId === 4663 ? chainId : undefined;
}

export async function zeroExGetQuote(params: Record<string, unknown>) {
  const validation = validateInput(zeroExSwapSchema, params);
  if (!validation.success) return validation.error;
  const chainId = getRobinhoodChainId(validation.data);
  if (!chainId)
    return formatToolErrorFromUnknown(
      "ZEROEX_CHAIN_ERROR",
      new Web3AgentError({
        code: "CHAIN_NOT_SUPPORTED",
        message: "0x Robinhood routing is available only on chain 4663",
      })
    );
  try {
    const quote = await getZeroExQuote(
      getZeroExQuoteInput(validation.data, chainId, getWalletState().address ?? zeroAddress)
    );
    return formatToolResponse(quote);
  } catch (error: unknown) {
    if (error instanceof Web3AgentError) {
      return formatToolErrorFromUnknown("ZEROEX_QUOTE_ERROR", error);
    }
    if (error instanceof Error) return formatToolErrorFromUnknown("ZEROEX_QUOTE_ERROR", error);
    return formatToolErrorFromUnknown("ZEROEX_QUOTE_ERROR", error);
  }
}

export async function executeZeroExSwapNow(params: Record<string, unknown>) {
  try {
    return await executeConfirmedZeroExSwap(params);
  } catch (error: unknown) {
    return formatToolErrorFromUnknown("ZEROEX_SWAP_ERROR", error);
  }
}

async function executeZeroExLifiFallbackNow(params: Record<string, unknown>) {
  try {
    return await executeConfirmedLifiFallback(params);
  } catch (error: unknown) {
    return formatToolErrorFromUnknown("ZEROEX_LIFI_FALLBACK_ERROR", error);
  }
}

export async function zeroExSwap(params: Record<string, unknown>) {
  const validation = validateInput(zeroExSwapSchema, params);
  if (!validation.success) return validation.error;
  const chainId = getRobinhoodChainId(validation.data);
  if (!chainId)
    return formatToolErrorFromUnknown(
      "ZEROEX_CHAIN_ERROR",
      new Web3AgentError({
        code: "CHAIN_NOT_SUPPORTED",
        message: "0x Robinhood routing is available only on chain 4663",
      })
    );
  const taker = assertAddress(getWalletState().address ?? zeroAddress, "taker");
  try {
    const quote = await getZeroExQuote(getZeroExQuoteInput(validation.data, chainId, taker));
    const execution = await prepareZeroExExecution(quote, validation.data.fromAmount, taker);
    return executeWrite({
      toolName: "zeroex_swap",
      description: `0x swap: ${validation.data.fromAmount} of ${validation.data.fromToken} → ${validation.data.toToken} on chain ${chainId}`,
      params: { ...validation.data, execution },
      executor: executeZeroExSwapNow,
      riskLevel: "financial",
    });
  } catch (error: unknown) {
    const classification = classifyZeroExError(error);
    if (!classification.fallbackAllowed) {
      return formatToolErrorFromUnknown("ZEROEX_SWAP_ERROR", error);
    }
    try {
      const preparedRoute = await prepareLifiRoute({
        account: taker,
        fromChainId: chainId,
        toChainId: chainId,
        fromToken: validation.data.fromToken,
        toToken: validation.data.toToken,
        fromAmount: validation.data.fromAmount,
      });
      const fallback = zeroExLifiFallbackSchema.parse({
        ...validation.data,
        account: taker,
        fallbackReason: classification.kind,
        preparedRoute,
        routeIntegrityHash: getLifiRouteIntegrityHash(preparedRoute),
      });
      return executeWrite({
        toolName: "zeroex_lifi_fallback",
        description: `LI.FI fallback: ${validation.data.fromAmount} of ${validation.data.fromToken} → ${validation.data.toToken} on chain ${chainId}`,
        params: fallback,
        executor: executeZeroExLifiFallbackNow,
        riskLevel: "financial",
      });
    } catch (fallbackError: unknown) {
      return formatToolErrorFromUnknown("ZEROEX_LIFI_FALLBACK_ERROR", fallbackError);
    }
  }
}

export function getZeroExToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "zeroex_get_quote",
      category: "swap",
      description: "Get an executable 0x Swap API v2 quote for Robinhood Chain (4663).",
      inputSchema: zodToJsonSchema(zeroExSwapSchema) as Record<string, unknown>,
      handler: zeroExGetQuote,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "zeroex_swap",
      category: "swap",
      description:
        "Execute a Robinhood Chain 0x swap after confirmation, with bounded LI.FI fallback.",
      inputSchema: zodToJsonSchema(zeroExSwapSchema) as Record<string, unknown>,
      handler: zeroExSwap,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
  ];
}

export function registerZeroExExecutors(): void {
  registerExecutor("zeroex_swap", executeZeroExSwapNow);
  registerExecutor("zeroex_lifi_fallback", executeZeroExLifiFallbackNow);
}
