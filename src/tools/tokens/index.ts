import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getChainById } from "../../chains/registry.js";
import { listTokens, resolveToken } from "../../tokens/resolver.js";
import type { ToolDefinition } from "../../tools/register.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { listChainTokensSchema, resolveTokenSchema } from "./schemas.js";

async function handleResolveToken(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(resolveTokenSchema, params);
  if (!v.success) return v.error;
  const { symbol, chainId } = v.data;

  const chain = getChainById(chainId);
  if (!chain) {
    return formatToolError("UNKNOWN_CHAIN", `Chain ${chainId} is not a known EVM chain`);
  }

  const result = await resolveToken(symbol, chainId);
  if (!result) {
    const available = listTokens(chainId);
    const knownSymbols = available.map((t) => t.symbol).join(", ");

    return formatToolError(
      "TOKEN_NOT_FOUND",
      `Token '${symbol}' not found on ${chain.name} (${chainId}). Known tokens: ${knownSymbols || "none"}`
    );
  }

  return formatToolResponse(result);
}

function handleListTokens(params: Record<string, unknown>): CallToolResult {
  const v = validateInput(listChainTokensSchema, params);
  if (!v.success) return v.error;
  const { chainId } = v.data;

  const chain = getChainById(chainId);
  if (!chain) {
    return formatToolError("UNKNOWN_CHAIN", `Chain ${chainId} is not a known EVM chain`);
  }

  const tokens = listTokens(chainId);
  return formatToolResponse({
    chainId,
    chainName: chain.name,
    tokens,
  });
}

export function getTokenToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "resolve_token",
      category: "tokens",
      description:
        "Resolve a token symbol (e.g. 'USDT', 'WBNB') to its contract address and decimals on a specific chain. " +
        "Uses a built-in registry of verified canonical addresses for major tokens with DexScreener fallback. " +
        "ALWAYS call this first when you need a token address — do NOT use blockscout_lookup_token_by_symbol or get_token_info_by_symbol.",
      inputSchema: zodToJsonSchema(resolveTokenSchema) as Record<string, unknown>,
      handler: (params) => handleResolveToken(params),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "list_chain_tokens",
      category: "tokens",
      description:
        "List all well-known tokens available in the built-in registry for a specific chain. " +
        "Returns symbol, address, decimals, and name for each token.",
      inputSchema: zodToJsonSchema(listChainTokensSchema) as Record<string, unknown>,
      handler: (params) => Promise.resolve(handleListTokens(params)),
      annotations: { readOnlyHint: true },
    },
  ];
}
