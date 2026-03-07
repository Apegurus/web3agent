import { type LiFiStep, convertQuoteToRoute, executeRoute, getChains, getQuote } from "@lifi/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDefinition } from "../../tools/register.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { confirmationQueue } from "../../wallet/confirmation.js";
import { getWalletState } from "../../wallet/persistence.js";

async function lifiGetChains(_params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const chains = await getChains();
    const summary = chains.map((c) => ({
      id: c.id,
      name: c.name,
      nativeToken: c.nativeToken?.symbol,
    }));
    return formatToolResponse(summary);
  } catch (e) {
    return formatToolError("LIFI_ERROR", String(e));
  }
}

async function lifiGetQuote(params: Record<string, unknown>): Promise<CallToolResult> {
  const { fromChainId, toChainId, fromTokenAddress, toTokenAddress, fromAmount } = params;

  if (!fromChainId || !toChainId || !fromTokenAddress || !toTokenAddress || !fromAmount) {
    return formatToolError(
      "MISSING_PARAMS",
      "Required: fromChainId, toChainId, fromTokenAddress, toTokenAddress, fromAmount"
    );
  }

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
  } catch (e) {
    return formatToolError("LIFI_QUOTE_ERROR", String(e));
  }
}

async function lifiExecuteBridge(params: Record<string, unknown>): Promise<CallToolResult> {
  const walletState = getWalletState();
  if (walletState.mode === "read-only") {
    return formatToolError(
      "WALLET_REQUIRED",
      "Bridge execution requires an active wallet. Use wallet_activate first."
    );
  }

  const { fromChainId, toChainId, fromTokenAddress, toTokenAddress, fromAmount } = params;

  if (!fromChainId || !toChainId || !fromTokenAddress || !toTokenAddress || !fromAmount) {
    return formatToolError(
      "MISSING_PARAMS",
      "Required: fromChainId, toChainId, fromTokenAddress, toTokenAddress, fromAmount"
    );
  }

  const enqueueResult = confirmationQueue.enqueue(
    "bridge",
    `Bridge ${fromAmount} from chain ${fromChainId} to chain ${toChainId}`,
    params
  );

  if (enqueueResult.queued) {
    return formatToolResponse({
      status: "queued",
      operationId: enqueueResult.id,
      summary: enqueueResult.summary,
      instruction: `Use transaction_confirm("${enqueueResult.id}") to execute the bridge.`,
    });
  }

  return executeBridgeNow(params);
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
  } catch (e) {
    return formatToolError("BRIDGE_ERROR", String(e));
  }
}

export function getLifiToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "lifi_get_chains",
      description: "Get list of chains supported by LI.FI for cross-chain bridging",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
      handler: lifiGetChains,
    },
    {
      name: "lifi_get_quote",
      description: "Get a cross-chain bridge/swap quote from LI.FI",
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
    },
    {
      name: "lifi_execute_bridge",
      description:
        "Execute a cross-chain bridge (write operation, requires wallet and confirmation)",
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
    },
  ];
}
