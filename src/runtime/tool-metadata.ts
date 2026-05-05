import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { RESTRICTED_PLUGIN_CHAINS } from "../goat/dispatch.js";

const GOAT_CHAIN_ID_DESCRIPTION =
  "Optional EVM chain ID to run this tool on (e.g. 1 for Ethereum, 8453 for Base, 42161 for Arbitrum). Defaults to the active wallet chain.";

export interface GoatToolMetadataInput {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown> | object;
}

export function normalizeInputSchema(
  schema: Record<string, unknown> | object
): Tool["inputSchema"] {
  const candidate = schema as { type?: unknown } & Record<string, unknown>;
  return {
    ...candidate,
    type: "object",
  };
}

function getRestrictedDescription(toolName: string, description?: string): string {
  const lowerName = toolName.toLowerCase();
  let normalizedDescription = description ?? "";

  for (const [plugin, chains] of Object.entries(RESTRICTED_PLUGIN_CHAINS)) {
    if (lowerName.startsWith(plugin)) {
      normalizedDescription += ` Only available on chains: ${chains.join(", ")}.`;
      break;
    }
  }

  return normalizedDescription;
}

export function createGoatToolMetadata(tool: GoatToolMetadataInput): {
  name: string;
  description: string;
  inputSchema: Tool["inputSchema"];
  annotations: Tool["annotations"];
} {
  const schema = normalizeInputSchema(tool.inputSchema);
  const properties = {
    ...((schema.properties ?? {}) as Record<string, object>),
    chainId: {
      type: "number",
      description: GOAT_CHAIN_ID_DESCRIPTION,
    },
  };

  return {
    name: tool.name,
    description: getRestrictedDescription(tool.name, tool.description),
    inputSchema: {
      ...schema,
      properties,
    },
    annotations: { openWorldHint: true },
  };
}
