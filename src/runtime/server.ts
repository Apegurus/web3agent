import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getAllChains } from "../chains/registry.js";
import { dispatchGoatTool } from "../goat/dispatch.js";
import type { GoatProvider } from "../goat/provider.js";
import { getLifiToolDefinitions } from "../tools/lifi/index.js";
import {
  getUtilityToolDefinitions,
  getWalletToolDefinitions,
  type ToolDefinition,
} from "../tools/register.js";
import { getOrbsToolDefinitions } from "../tools/orbs/index.js";
import { formatToolError } from "../utils/errors.js";
import type { BlockscoutAdapter } from "../upstream/blockscout/adapter.js";
import type { EvmAdapter } from "../upstream/evm/adapter.js";
import { walletEvents } from "../wallet/events.js";

function normalizeInputSchema(
  schema: Record<string, unknown> | object,
): {
  type: "object";
  properties?: { [key: string]: object };
  required?: string[];
  [key: string]: unknown;
} {
  const candidate = schema as { type?: unknown } & Record<string, unknown>;
  return {
    ...candidate,
    type: "object",
  };
}

export class ProxyServer {
  private readonly server: Server;
  private readonly frameworkTools: ToolDefinition[];
  private readonly lifiTools: ToolDefinition[];
  private readonly orbsTools: ToolDefinition[];
  private readonly goatToolNames: Set<string>;

  constructor(
    private readonly blockscoutAdapter: BlockscoutAdapter,
    private readonly evmAdapter: EvmAdapter,
    private readonly goatProvider: GoatProvider,
  ) {
    this.server = new Server(
      { name: "web3agent", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );
    this.frameworkTools = [
      ...getWalletToolDefinitions(),
      ...getUtilityToolDefinitions(),
    ];
    this.lifiTools = getLifiToolDefinitions();
    this.orbsTools = getOrbsToolDefinitions();
    this.goatToolNames = new Set(this.goatProvider.getAllToolNames());

    this.registerHandlers();
    this.registerWalletChangeNotification();
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getAggregatedTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;

      if (name.startsWith("blockscout_")) {
        return (await this.blockscoutAdapter.callTool(name, args)) as CallToolResult;
      }

      if (name.startsWith("evm_")) {
        return (await this.evmAdapter.callTool(name, args)) as CallToolResult;
      }

      if (this.goatToolNames.has(name)) {
        return dispatchGoatTool(name, args);
      }

      if (name.startsWith("lifi_")) {
        const tool = this.lifiTools.find((entry) => entry.name === name);
        if (tool) {
          return tool.handler(args);
        }
      }

      if (name.startsWith("orbs_")) {
        const tool = this.orbsTools.find((entry) => entry.name === name);
        if (tool) {
          return tool.handler(args);
        }
      }

      if (
        name.startsWith("wallet_") ||
        name.startsWith("transaction_") ||
        name === "server_status" ||
        name === "list_supported_chains"
      ) {
        const tool = this.frameworkTools.find((entry) => entry.name === name);
        if (tool) {
          return tool.handler(args);
        }
      }

      return formatToolError("UNKNOWN_TOOL", `Unknown tool: ${name}`);
    });
  }

  private getGoatTools(): Tool[] {
    const byName = new Map<string, Tool>();

    for (const chain of getAllChains()) {
      const snapshot = this.goatProvider.getSnapshot(chain.id);
      if (!snapshot) continue;

      for (const tool of snapshot.listOfTools) {
        if (byName.has(tool.name)) continue;
        byName.set(tool.name, {
          name: tool.name,
          description: tool.description,
          inputSchema: normalizeInputSchema(tool.inputSchema),
        });
      }
    }

    return [...byName.values()];
  }

  private getAggregatedTools(): Tool[] {
    return [
      ...this.frameworkTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: normalizeInputSchema(tool.inputSchema),
      })),
      ...this.getGoatTools(),
      ...this.blockscoutAdapter.getTools(),
      ...this.evmAdapter.getTools(),
      ...this.lifiTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: normalizeInputSchema(tool.inputSchema),
      })),
      ...this.orbsTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: normalizeInputSchema(tool.inputSchema),
      })),
    ];
  }

  private registerWalletChangeNotification(): void {
    walletEvents.on("wallet-changed", () => {
      this.server.notification({ method: "notifications/tools/list_changed" });
    });
  }

  async connect(transport: StdioServerTransport): Promise<void> {
    await this.server.connect(transport);
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.connect(transport);
  }
}
