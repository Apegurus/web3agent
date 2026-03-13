import { type LiFiStep, convertQuoteToRoute, executeRoute, getChains, getQuote } from "@lifi/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDefinition } from "../../tools/register.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getWalletState } from "../../wallet/persistence.js";
import { lifiGetQuoteSchema } from "./schemas.js";

async function lifiGetChains(_params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const chains = await getChains();
    const summary = chains.map((c) => ({
      id: c.id,
      name: c.name,
      nativeToken: c.nativeToken?.symbol,
    }));
    return formatToolResponse(summary);
  } catch (e: unknown) {
    return formatToolError("LIFI_ERROR", String(e));
  }
}

async function lifiGetQuote(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(lifiGetQuoteSchema, params);
  if (!v.success) return v.error;
  const { fromChainId, toChainId, fromTokenAddress, toTokenAddress, fromAmount } = v.data;

  try {
    const walletState = getWalletState();
    const quote: LiFiStep = await getQuote({
      fromChain: fromChainId as string | number,
      toChain: toChainId as string | number,
      fromToken: fromTokenAddress as string,
      toToken: toTokenAddress as string,
      fromAmount: fromAmount as string,
      fromAddress: walletState.address ?? "0x0000000000000000000000000000000000000000",
    });

    const trimmed = {
      fromChainId: quote.action.fromChainId,
      toChainId: quote.action.toChainId,
      fromToken: quote.action.fromToken?.symbol,
      toToken: quote.action.toToken?.symbol,
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
    return formatToolError("LIFI_QUOTE_ERROR", String(e));
  }
}

async function lifiExecuteBridge(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(lifiGetQuoteSchema, params);
  if (!v.success) return v.error;
  const { fromChainId, toChainId, fromTokenAddress, toTokenAddress, fromAmount } = v.data;

  return executeWrite({
    toolName: "lifi_execute_bridge",
    description: `Bridge ${fromAmount} from chain ${fromChainId} to chain ${toChainId}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeBridgeNow,
  });
}

async function executeBridgeNow(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const { fromChainId, toChainId, fromTokenAddress, toTokenAddress, fromAmount } = params;
    const walletState = getWalletState();

    const quote = await getQuote({
      fromChain: fromChainId as string | number,
      toChain: toChainId as string | number,
      fromToken: fromTokenAddress as string,
      toToken: toTokenAddress as string,
      fromAmount: fromAmount as string,
      fromAddress: walletState.address ?? "0x0000000000000000000000000000000000000000",
    });

    const route = convertQuoteToRoute(quote);

    await executeRoute(route, {
      updateRouteHook: (updatedRoute) => {
        const step = updatedRoute.steps?.[0];
        if (step?.execution) {
          process.stderr.write(
            `[web3agent] Bridge progress: ${JSON.stringify(step.execution.process)}\n`
          );
        }
      },
    });

    return formatToolResponse({
      status: "completed",
      message: "Bridge executed successfully",
    });
  } catch (e: unknown) {
    return formatToolError("BRIDGE_ERROR", String(e));
  }
}

export function getLifiToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "lifi_get_chains",
      category: "status",
      description: "Get list of chains supported by LI.FI for cross-chain bridging",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
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
      inputSchema: {
        type: "object" as const,
        properties: {
          fromChainId: {
            type: "number",
            description: "Source chain ID",
          },
          toChainId: {
            type: "number",
            description: "Destination chain ID",
          },
          fromTokenAddress: {
            type: "string",
            description: "Source token address",
          },
          toTokenAddress: {
            type: "string",
            description: "Destination token address",
          },
          fromAmount: {
            type: "string",
            description: "Amount in wei",
          },
        },
        required: ["fromChainId", "toChainId", "fromTokenAddress", "toTokenAddress", "fromAmount"],
      },
      handler: lifiGetQuote,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "lifi_execute_bridge",
      category: "swap",
      description:
        "Execute a cross-chain bridge (write operation, requires wallet and confirmation). " +
        "Requires token addresses — use resolve_token first to get addresses.",
      inputSchema: {
        type: "object" as const,
        properties: {
          fromChainId: { type: "number" },
          toChainId: { type: "number" },
          fromTokenAddress: { type: "string" },
          toTokenAddress: { type: "string" },
          fromAmount: { type: "string" },
        },
        required: ["fromChainId", "toChainId", "fromTokenAddress", "toTokenAddress", "fromAmount"],
      },
      handler: lifiExecuteBridge,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
  ];
}

export function registerLifiExecutors(): void {
  registerExecutor("lifi_execute_bridge", executeBridgeNow);
}
