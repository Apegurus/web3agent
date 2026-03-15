import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Chain } from "viem";
import { getChainById } from "../../chains/registry.js";
import { getConfig } from "../../config/env.js";
import { formatToolError } from "../../utils/errors.js";

export function resolveToolChainId(chainId: number | undefined): number {
  return chainId ?? getConfig().chainId;
}

export function resolveToolChain(
  chainId: number
): { chain: Chain; chainId: number } | CallToolResult {
  const chain = getChainById(chainId);
  if (!chain) {
    return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);
  }
  return { chain, chainId };
}

export function isChainResolved(
  value: { chain: Chain; chainId: number } | CallToolResult
): value is { chain: Chain; chainId: number } {
  return "chain" in value && !("isError" in value);
}
