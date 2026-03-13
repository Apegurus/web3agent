import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isSupported } from "../chains/registry.js";
import { getConfig } from "../config/env.js";
import type { RuntimeConfig } from "../types/config.js";
import { formatToolError } from "../utils/errors.js";
import { type GoatProvider, goatProvider } from "./provider.js";

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

interface DispatchGoatToolOptions {
  config?: RuntimeConfig;
  goatProvider?: GoatProvider;
}

export async function dispatchGoatTool(
  toolName: string,
  params: Record<string, unknown>,
  options?: DispatchGoatToolOptions
): Promise<CallToolResult> {
  const config = options?.config ?? getConfig();
  const activeGoatProvider = options?.goatProvider ?? goatProvider;
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

  const snapshot = await activeGoatProvider.getOrBuildSnapshot(chainId);
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
