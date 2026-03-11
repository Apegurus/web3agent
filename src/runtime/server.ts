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
import { VERSION } from "../version.js";
import { walletEvents } from "../wallet/events.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

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
  private goatToolNames: Set<string>;
  private toolDispatch = new Map<string, ToolHandler>();
  private walletChangeHandler?: () => void;

  constructor(
    private readonly blockscoutAdapter: BlockscoutAdapter,
    private readonly etherscanAdapter: EtherscanAdapter,
    private readonly evmAdapter: EvmAdapter,
    private readonly goatProvider: GoatProvider
  ) {
    this.server = new Server(
      { name: "web3agent", version: VERSION },
      {
        capabilities: { tools: { listChanged: true } },
        instructions: [
          "web3agent is a unified Web3 MCP proxy server.",
          "Token resolution: ALWAYS call resolve_token before swaps/bridges to get the correct contract address.",
          "Write operations: By default, writes (swaps, bridges, transfers) are queued. Call transaction_confirm(id) to execute, transaction_deny(id) to discard.",
          "Wallet activation: Call wallet_activate with a private key or mnemonic to enable write operations. Call wallet_get_active to check current state.",
          "Chain selection: Most tools accept an optional chainId parameter. Default chain is Base (8453).",
          "Tool routing: Use blockscout_* for historical/indexed data, evm_* for live on-chain state, other tools for DeFi operations.",
        ].join(" "),
      }
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

    this.rebuildDispatchMap();
    this.registerHandlers();
    this.registerWalletChangeNotification();
  }

  private rebuildDispatchMap(): void {
    this.toolDispatch.clear();

    for (const tool of this.blockscoutAdapter.getTools()) {
      this.toolDispatch.set(
        tool.name,
        (args) => this.blockscoutAdapter.callTool(tool.name, args) as Promise<CallToolResult>
      );
    }

    for (const tool of this.etherscanAdapter.getTools()) {
      this.toolDispatch.set(
        tool.name,
        (args) => this.etherscanAdapter.callTool(tool.name, args) as Promise<CallToolResult>
      );
    }

    for (const tool of this.evmAdapter.getTools()) {
      this.toolDispatch.set(
        tool.name,
        (args) => this.evmAdapter.callTool(tool.name, args) as Promise<CallToolResult>
      );
    }

    for (const tool of this.tokenTools) {
      this.toolDispatch.set(tool.name, (args) => tool.handler(args));
    }

    for (const name of this.goatToolNames) {
      this.toolDispatch.set(name, (args) => dispatchGoatTool(name, args));
    }

    for (const tool of this.lifiTools) {
      this.toolDispatch.set(tool.name, (args) => tool.handler(args));
    }

    for (const tool of this.orbsTools) {
      this.toolDispatch.set(tool.name, (args) => tool.handler(args));
    }

    for (const tool of this.frameworkTools) {
      this.toolDispatch.set(tool.name, (args) => tool.handler(args));
    }
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getAggregatedTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;

      const handler = this.toolDispatch.get(name);
      if (handler) {
        return handler(args);
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
          "Optional EVM chain ID to run this tool on (e.g. 1 for Ethereum, 8453 for Base, 42161 for Arbitrum). Defaults to the active wallet chain.",
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
        annotations: { openWorldHint: true },
      };
    });
  }

  private getAggregatedTools(): Tool[] {
    return [
      ...this.frameworkTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: normalizeInputSchema(tool.inputSchema),
        ...(tool.annotations && { annotations: tool.annotations }),
      })),
      ...this.getGoatTools(),
      ...this.blockscoutAdapter.getTools(),
      ...this.etherscanAdapter.getTools(),
      ...this.evmAdapter.getTools(),
      ...this.lifiTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: normalizeInputSchema(tool.inputSchema),
        ...(tool.annotations && { annotations: tool.annotations }),
      })),
      ...this.orbsTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: normalizeInputSchema(tool.inputSchema),
        ...(tool.annotations && { annotations: tool.annotations }),
      })),
      ...this.tokenTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: normalizeInputSchema(tool.inputSchema),
        ...(tool.annotations && { annotations: tool.annotations }),
      })),
    ];
  }

  private registerWalletChangeNotification(): void {
    this.walletChangeHandler = () => {
      this.goatProvider
        .waitForRebuild()
        .then(() => {
          this.goatToolNames = new Set(this.goatProvider.getAllToolNames());
          this.rebuildDispatchMap();
          return this.server.notification({ method: "notifications/tools/list_changed" });
        })
        .catch((e: unknown) => {
          process.stderr.write(`[web3agent] Failed to update tools after wallet change: ${e}\n`);
        });
    };
    walletEvents.on("wallet-changed", this.walletChangeHandler);
  }

  async shutdown(): Promise<void> {
    if (this.walletChangeHandler) {
      walletEvents.off("wallet-changed", this.walletChangeHandler);
      this.walletChangeHandler = undefined;
    }
    this.goatProvider.shutdown();
    // biome-ignore lint/suspicious/noEmptyBlockStatements: swallow rebuild errors during shutdown — adapter cleanup follows
    await this.goatProvider.waitForRebuild().catch(() => {});
    await Promise.allSettled([
      this.blockscoutAdapter.shutdown(),
      this.etherscanAdapter.shutdown(),
      this.evmAdapter.shutdown(),
    ]);
    await this.server.close().catch((e: unknown) => {
      process.stderr.write(`[web3agent] Failed to close MCP server: ${e}\n`);
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
