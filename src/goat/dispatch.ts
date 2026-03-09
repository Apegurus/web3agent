import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isSupported } from "../chains/registry.js";
import { getConfig } from "../config/env.js";
import { formatToolError } from "../utils/errors.js";
import { goatProvider } from "./provider.js";

export const RESTRICTED_PLUGIN_CHAINS: Record<string, number[]> = {
  uniswap: [1, 137, 43114, 8453, 10, 42161, 42220],
  balancer: [34443, 8453, 137, 100, 42161, 43114, 10],
};

function findRestrictedPlugin(toolName: string): string | undefined {
  const lowerName = toolName.toLowerCase();
  for (const pluginKey of Object.keys(RESTRICTED_PLUGIN_CHAINS)) {
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

  if (!isSupported(chainId)) {
    return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} is not a known EVM chain`);
  }

  const pluginKey = findRestrictedPlugin(toolName);
  if (pluginKey) {
    const availableChains = RESTRICTED_PLUGIN_CHAINS[pluginKey];
    if (!availableChains.includes(chainId)) {
      return formatToolError(
        "TOOL_UNAVAILABLE_ON_CHAIN",
        `${toolName} is not available on chain ${chainId}. Available on chains: ${availableChains.join(", ")}`,
        { availableChainIds: availableChains }
      );
    }
  }

  const snapshot = await goatProvider.getOrBuildSnapshot(chainId);
  if (!snapshot) {
    return formatToolError(
      "CHAIN_INIT_FAILED",
      `Failed to initialize GOAT tools for chain ${chainId}`
    );
  }

  const { chainId: _ignored, ...goatParams } = params;

  try {
    const result = await snapshot.toolHandler(toolName, goatParams);
    return result as CallToolResult;
  } catch (e: unknown) {
    return formatToolError("GOAT_TOOL_ERROR", String(e));
  }
}
