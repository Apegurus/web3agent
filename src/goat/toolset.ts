import { getTools } from "@goat-sdk/core";
import type { PluginBase, ToolBase, WalletClientBase } from "@goat-sdk/core";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { PluginLoadResult } from "./plugins.js";

export interface GoatToolSnapshot {
  listOfTools: Array<{
    name: string;
    description: string;
    inputSchema: object;
  }>;
  toolHandler: (
    toolName: string,
    params: unknown
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
  chainId: number;
}

export async function buildGoatTools(params: {
  wallet: WalletClientBase;
  pluginResult: PluginLoadResult;
}): Promise<ToolBase[]> {
  const plugins = params.pluginResult.plugins as Array<PluginBase<WalletClientBase>>;

  return getTools({
    wallet: params.wallet,
    plugins,
  });
}

export function createGoatToolSnapshot(chainId: number, tools: ToolBase[]): GoatToolSnapshot {
  return {
    listOfTools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.parameters),
    })),
    toolHandler: async (toolName, params) => {
      const tool = tools.find((candidate) => candidate.name === toolName);
      if (!tool) {
        throw new Error(`Tool ${toolName} not found`);
      }

      const parsed = tool.parameters.parse(params ?? {});
      const result = await tool.execute(parsed);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    },
    chainId,
  };
}
