import { type LiFiStep, getChains, getQuote } from "@lifi/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { prepareBridgeIntent } from "../../api/intents.js";
import { emptyInputSchema } from "../../api/schemas/common.js";
import { ensureLifiInitialized } from "../../lifi/config.js";
import { executeLifiRoute } from "../../lifi/route-execution.js";
import type { ToolDefinition } from "../../tools/register.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getWalletState } from "../../wallet/persistence.js";
import { createToolHandler } from "../shared/handler-factory.js";
import { lifiGetQuoteSchema, lifiPrepareBridgeIntentSchema } from "./schemas.js";

async function lifiGetChains(_params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    ensureLifiInitialized();
    const chains = await getChains();
    const summary = chains.map((c) => ({
      id: c.id,
      name: c.name,
      nativeToken: c.nativeToken?.symbol,
    }));
    return formatToolResponse(summary);
  } catch (e: unknown) {
    if (e instanceof Error) return formatToolError("LIFI_ERROR", e.message);
    return formatToolError("LIFI_ERROR", "LI.FI chain lookup failed");
  }
}

async function lifiGetQuote(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(lifiGetQuoteSchema, params);
  if (!v.success) return v.error;
  const { fromChainId, toChainId, fromToken, toToken, fromAmount } = v.data;

  try {
    ensureLifiInitialized();
    const walletState = getWalletState();
    const quote: LiFiStep = await getQuote({
      fromChain: fromChainId as string | number,
      toChain: toChainId as string | number,
      fromToken: fromToken as string,
      toToken: toToken as string,
      fromAmount: fromAmount as string,
      fromAddress: walletState.address ?? "0x0000000000000000000000000000000000000000",
    });

    const trimmed = {
      fromChainId: quote.action.fromChainId,
      toChainId: quote.action.toChainId,
      fromToken: quote.action.fromToken?.address,
      toToken: quote.action.toToken?.address,
      fromDecimals: quote.action.fromToken?.decimals,
      toDecimals: quote.action.toToken?.decimals,
      fromAmount: quote.action.fromAmount,
      fromAmountUSD: quote.estimate?.fromAmountUSD,
      toAmount: quote.estimate?.toAmount,
      toAmountUSD: quote.estimate?.toAmountUSD,
      toAmountMin: quote.estimate?.toAmountMin,
      gasCostUSD: quote.estimate?.gasCosts?.[0]?.amountUSD,
      estimatedDurationSeconds: quote.estimate?.executionDuration,
      includedSteps: quote.includedSteps?.map((s) => ({
        type: s.type,
        tool: s.tool,
      })),
    };

    return formatToolResponse(trimmed);
  } catch (e: unknown) {
    if (e instanceof Error) return formatToolError("LIFI_QUOTE_ERROR", e.message);
    return formatToolError("LIFI_QUOTE_ERROR", "LI.FI quote lookup failed");
  }
}

async function lifiExecuteBridge(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(lifiGetQuoteSchema, params);
  if (!v.success) return v.error;
  const { fromChainId, toChainId, fromAmount } = v.data;

  return executeWrite({
    toolName: "lifi_execute_bridge",
    description: `Bridge ${fromAmount} from chain ${fromChainId} to chain ${toChainId}`,
    params: {
      fromChainId: v.data.fromChainId,
      toChainId: v.data.toChainId,
      fromToken: v.data.fromToken,
      toToken: v.data.toToken,
      fromAmount: v.data.fromAmount,
    },
    executor: executeBridgeNow,
  });
}

const lifiPrepareBridgeIntentTool = createToolHandler(
  lifiPrepareBridgeIntentSchema,
  prepareBridgeIntent,
  "BRIDGE_INTENT_ERROR"
);

async function executeBridgeNow(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const { fromChainId, toChainId, fromToken, toToken, fromAmount } = params;
    const result = await executeLifiRoute({
      fromChainId: Number(fromChainId),
      toChainId: Number(toChainId),
      fromToken: String(fromToken),
      toToken: String(toToken),
      fromAmount: String(fromAmount),
    });
    return formatToolResponse(result);
  } catch (e: unknown) {
    if (e instanceof Error) return formatToolError("BRIDGE_ERROR", e.message);
    return formatToolError("BRIDGE_ERROR", "LI.FI route execution failed");
  }
}

export function getLifiToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "lifi_get_chains",
      category: "status",
      description: "Get list of chains supported by LI.FI for cross-chain bridging",
      inputSchema: zodToJsonSchema(emptyInputSchema) as Record<string, unknown>,
      handler: lifiGetChains,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "lifi_get_quote",
      category: "swap",
      description:
        "Get a cross-chain bridge/swap quote from LI.FI. " +
        "Supports 20+ EVM chains including Ethereum, BSC, Polygon, Arbitrum, Optimism, Base, Linea, Avalanche, zkSync, Scroll, Gnosis, and more. " +
        "Requires token addresses — use resolve_token first to get addresses.",
      inputSchema: zodToJsonSchema(lifiGetQuoteSchema) as Record<string, unknown>,
      handler: lifiGetQuote,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "lifi_execute_bridge",
      category: "swap",
      description:
        "Execute a cross-chain bridge (write operation, requires wallet and confirmation). " +
        "Requires token addresses — use resolve_token first to get addresses.",
      inputSchema: zodToJsonSchema(lifiGetQuoteSchema) as Record<string, unknown>,
      handler: lifiExecuteBridge,
      riskLevel: "financial",
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "lifi_prepare_bridge_intent",
      category: "swap",
      description:
        "Prepare a cross-chain bridge route for an external wallet. Returns raw transaction steps without executing them.",
      inputSchema: zodToJsonSchema(lifiPrepareBridgeIntentSchema) as Record<string, unknown>,
      handler: lifiPrepareBridgeIntentTool,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}

export function registerLifiExecutors(): void {
  registerExecutor("lifi_execute_bridge", executeBridgeNow);
}
