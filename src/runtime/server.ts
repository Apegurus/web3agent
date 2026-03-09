import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { RESTRICTED_PLUGIN_CHAINS, dispatchGoatTool } from "../goat/dispatch.js";
import type { GoatProvider } from "../goat/provider.js";
import { getLifiToolDefinitions } from "../tools/lifi/index.js";
import { getOrbsToolDefinitions } from "../tools/orbs/index.js";
import {
  type ToolDefinition,
  getTransactionToolDefinitions,
  getUtilityToolDefinitions,
  getWalletToolDefinitions,
} from "../tools/register.js";
import { getTokenToolDefinitions } from "../tools/tokens/index.js";
import type { BlockscoutAdapter } from "../upstream/blockscout/adapter.js";
import type { EtherscanAdapter } from "../upstream/etherscan/adapter.js";
import type { EvmAdapter } from "../upstream/evm/adapter.js";
import { formatToolError } from "../utils/errors.js";
import { walletEvents } from "../wallet/events.js";

function normalizeInputSchema(schema: Record<string, unknown> | object): {
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
  private readonly tokenTools: ToolDefinition[];
  private readonly goatToolNames: Set<string>;
  private walletChangeHandler?: () => void;

  constructor(
    private readonly blockscoutAdapter: BlockscoutAdapter,
    private readonly etherscanAdapter: EtherscanAdapter,
    private readonly evmAdapter: EvmAdapter,
    private readonly goatProvider: GoatProvider
  ) {
    this.server = new Server(
      { name: "web3agent", version: "0.1.0" },
      { capabilities: { tools: {} } }
    );
    this.frameworkTools = [
      ...getWalletToolDefinitions(),
      ...getTransactionToolDefinitions(),
      ...getUtilityToolDefinitions(),
    ];
    this.lifiTools = getLifiToolDefinitions();
    this.orbsTools = getOrbsToolDefinitions();
    this.tokenTools = getTokenToolDefinitions();
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

      if (name.startsWith("etherscan_")) {
        return (await this.etherscanAdapter.callTool(name, args)) as CallToolResult;
      }

      if (name.startsWith("evm_")) {
        return (await this.evmAdapter.callTool(name, args)) as CallToolResult;
      }

      const tokenTool = this.tokenTools.find((entry) => entry.name === name);
      if (tokenTool) {
        return tokenTool.handler(args);
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
    const snapshot = this.goatProvider.getReferenceSnapshot();
    if (!snapshot) return [];

    return snapshot.listOfTools.map((tool) => {
      const schema = normalizeInputSchema(tool.inputSchema);
      const properties = (schema.properties ?? {}) as Record<string, object>;
      properties.chainId = {
        type: "number",
        description:
          "Optional EVM chain ID to run this tool on (e.g. 1 for Ethereum, 8453 for Base, 9745 for Plasma). Defaults to the active wallet chain.",
      };

      let description = tool.description;
      const lowerName = tool.name.toLowerCase();
      for (const [plugin, chains] of Object.entries(RESTRICTED_PLUGIN_CHAINS)) {
        if (lowerName.startsWith(plugin)) {
          description += ` Only available on chains: ${chains.join(", ")}.`;
          break;
        }
      }

      return {
        name: tool.name,
        description,
        inputSchema: { ...schema, properties },
      };
    });
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
      ...this.etherscanAdapter.getTools(),
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
      ...this.tokenTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: normalizeInputSchema(tool.inputSchema),
      })),
    ];
  }

  private registerWalletChangeNotification(): void {
    this.walletChangeHandler = () => {
      this.server
        .notification({ method: "notifications/tools/list_changed" })
        .catch((e: unknown) => {
          process.stderr.write(`[web3agent] Failed to send tool list change notification: ${e}\n`);
        });
    };
    walletEvents.on("wallet-changed", this.walletChangeHandler);
  }

  async shutdown(): Promise<void> {
    if (this.walletChangeHandler) {
      walletEvents.off("wallet-changed", this.walletChangeHandler);
      this.walletChangeHandler = undefined;
    }
  }

  async connect(transport: StdioServerTransport): Promise<void> {
    await this.server.connect(transport);
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.connect(transport);
  }
}
