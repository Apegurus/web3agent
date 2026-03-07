import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SUPPORTED_CHAIN_IDS } from "../chains/registry.js";
import { getConfig } from "../config/env.js";
import { formatToolError } from "../utils/errors.js";
import { goatProvider } from "./provider.js";

export const PLUGIN_CHAIN_SUPPORT: Record<string, number[]> = {
  uniswap: [1, 137, 43114, 8453, 10, 42161, 42220],
  balancer: [34443, 8453, 137, 100, 42161, 43114, 10],
  // Tier 0 plugins work on all chains
  erc20: [...SUPPORTED_CHAIN_IDS],
  erc721: [...SUPPORTED_CHAIN_IDS],
  ens: [...SUPPORTED_CHAIN_IDS],
  dexscreener: [...SUPPORTED_CHAIN_IDS],
  coingecko: [...SUPPORTED_CHAIN_IDS],
  "0x": [...SUPPORTED_CHAIN_IDS],
};

function findPluginForTool(toolName: string): string | undefined {
  const lowerName = toolName.toLowerCase();
  for (const pluginKey of Object.keys(PLUGIN_CHAIN_SUPPORT)) {
    if (lowerName.startsWith(pluginKey.toLowerCase())) {
      return pluginKey;
    }
  }
  return undefined;
}

export async function dispatchGoatTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<CallToolResult> {
  const config = getConfig();
  const chainId = typeof params.chainId === "number" ? params.chainId : config.chainId;

  if (!SUPPORTED_CHAIN_IDS.includes(chainId)) {
    return formatToolError(
      "UNSUPPORTED_CHAIN",
      `Chain ${chainId} is not supported. Supported chains: ${SUPPORTED_CHAIN_IDS.join(", ")}`
    );
  }

  const pluginKey = findPluginForTool(toolName);
  if (pluginKey && !PLUGIN_CHAIN_SUPPORT[pluginKey].includes(chainId)) {
    const availableChains = PLUGIN_CHAIN_SUPPORT[pluginKey];
    return formatToolError(
      "TOOL_UNAVAILABLE_ON_CHAIN",
      `${toolName} is not available on chain ${chainId}. Available on chains: ${availableChains.join(", ")}`,
      { availableChainIds: availableChains }
    );
  }

  const snapshot = goatProvider.getSnapshot(chainId);
  if (!snapshot) {
    return formatToolError("CHAIN_NOT_INITIALIZED", `No GOAT snapshot for chain ${chainId}`);
  }

  const { chainId: _ignored, ...goatParams } = params;

  try {
    const result = await snapshot.toolHandler(toolName, goatParams);
    return result as CallToolResult;
  } catch (e: unknown) {
    return formatToolError("GOAT_TOOL_ERROR", String(e));
  }
}
