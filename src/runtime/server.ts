import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { dispatchGoatTool } from "../goat/dispatch.js";
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
import type { ManagedRuntime } from "./managed-runtime.js";
import { createGoatToolMetadata, normalizeInputSchema } from "./tool-metadata.js";

interface RuntimeBridge {
  getMcpTools(): Tool[];
  invokeTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  onToolsChanged(listener: () => void): () => void;
  shutdown(): Promise<void>;
}

function getGoatTools(goatProvider: GoatProvider): Tool[] {
  const snapshot = goatProvider.getReferenceSnapshot();
  if (!snapshot) return [];
  return snapshot.listOfTools.map((tool) => createGoatToolMetadata(tool));
}

function createLegacyRuntimeBridge(
  blockscoutAdapter: BlockscoutAdapter,
  etherscanAdapter: EtherscanAdapter,
  evmAdapter: EvmAdapter,
  goatProvider: GoatProvider
): RuntimeBridge {
  type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

  const frameworkTools = [
    ...getWalletToolDefinitions(),
    ...getTransactionToolDefinitions(),
    ...getUtilityToolDefinitions(),
  ];
  const lifiTools = getLifiToolDefinitions();
  const orbsTools = getOrbsToolDefinitions();
  const tokenTools = getTokenToolDefinitions();
  let goatToolNames = new Set(goatProvider.getAllToolNames());
  const toolDispatch = new Map<string, ToolHandler>();

  const rebuildDispatchMap = () => {
    toolDispatch.clear();

    for (const tool of blockscoutAdapter.getTools()) {
      toolDispatch.set(
        tool.name,
        (args) => blockscoutAdapter.callTool(tool.name, args) as Promise<CallToolResult>
      );
    }

    for (const tool of etherscanAdapter.getTools()) {
      toolDispatch.set(
        tool.name,
        (args) => etherscanAdapter.callTool(tool.name, args) as Promise<CallToolResult>
      );
    }

    for (const tool of evmAdapter.getTools()) {
      toolDispatch.set(
        tool.name,
        (args) => evmAdapter.callTool(tool.name, args) as Promise<CallToolResult>
      );
    }

    for (const tool of tokenTools) {
      toolDispatch.set(tool.name, (args) => tool.handler(args));
    }

    for (const name of goatToolNames) {
      toolDispatch.set(name, (args) => dispatchGoatTool(name, args));
    }

    for (const tool of lifiTools) {
      toolDispatch.set(tool.name, (args) => tool.handler(args));
    }

    for (const tool of orbsTools) {
      toolDispatch.set(tool.name, (args) => tool.handler(args));
    }

    for (const tool of frameworkTools) {
      toolDispatch.set(tool.name, (args) => tool.handler(args));
    }
  };

  rebuildDispatchMap();

  return {
    getMcpTools(): Tool[] {
      return [
        ...frameworkTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: normalizeInputSchema(tool.inputSchema),
          ...(tool.annotations && { annotations: tool.annotations }),
        })),
        ...getGoatTools(goatProvider),
        ...blockscoutAdapter.getTools(),
        ...etherscanAdapter.getTools(),
        ...evmAdapter.getTools(),
        ...lifiTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: normalizeInputSchema(tool.inputSchema),
          ...(tool.annotations && { annotations: tool.annotations }),
        })),
        ...orbsTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: normalizeInputSchema(tool.inputSchema),
          ...(tool.annotations && { annotations: tool.annotations }),
        })),
        ...tokenTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: normalizeInputSchema(tool.inputSchema),
          ...(tool.annotations && { annotations: tool.annotations }),
        })),
      ];
    },
    async invokeTool(
      name: string,
      args: Record<string, unknown> = {}
    ): Promise<CallToolResult> {
      const handler = toolDispatch.get(name);
      if (!handler) {
        return formatToolError("UNKNOWN_TOOL", `Unknown tool: ${name}`);
      }
      return handler(args);
    },
    onToolsChanged(listener: () => void): () => void {
      const handler = () => {
        goatProvider
          .waitForRebuild()
          .then(() => {
            goatToolNames = new Set(goatProvider.getAllToolNames());
            rebuildDispatchMap();
            listener();
          })
          .catch((e: unknown) => {
            process.stderr.write(`[web3agent] Failed to update tools after wallet change: ${e}\n`);
          });
      };
      walletEvents.on("wallet-changed", handler);
      return () => {
        walletEvents.off("wallet-changed", handler);
      };
    },
    async shutdown(): Promise<void> {
      goatProvider.shutdown();
      // biome-ignore lint/suspicious/noEmptyBlockStatements: best-effort wait before adapter teardown
      await goatProvider.waitForRebuild().catch(() => {});
      await Promise.allSettled([
        blockscoutAdapter.shutdown(),
        etherscanAdapter.shutdown(),
        evmAdapter.shutdown(),
      ]);
    },
  };
}

function isRuntimeBridge(value: unknown): value is RuntimeBridge {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RuntimeBridge>;
  return (
    typeof candidate.getMcpTools === "function" &&
    typeof candidate.invokeTool === "function" &&
    typeof candidate.onToolsChanged === "function" &&
    typeof candidate.shutdown === "function"
  );
}

function requireLegacyAdapter<T>(
  value: T | undefined,
  name: "etherscanAdapter" | "evmAdapter" | "goatProvider"
): T {
  if (value === undefined) {
    throw new Error(
      `Legacy ProxyServer construction requires ${name}; use createRuntime() for the managed runtime path`
    );
  }
  return value;
}

export class ProxyServer {
  private readonly server: Server;
  private removeToolsChangedListener?: () => void;
  private readonly runtime: RuntimeBridge;

  constructor(
    runtimeOrBlockscout: ManagedRuntime | BlockscoutAdapter,
    etherscanAdapter?: EtherscanAdapter,
    evmAdapter?: EvmAdapter,
    goatProviderInstance?: GoatProvider
  ) {
    this.runtime = isRuntimeBridge(runtimeOrBlockscout)
      ? runtimeOrBlockscout
      : createLegacyRuntimeBridge(
          runtimeOrBlockscout,
          requireLegacyAdapter(etherscanAdapter, "etherscanAdapter"),
          requireLegacyAdapter(evmAdapter, "evmAdapter"),
          requireLegacyAdapter(goatProviderInstance, "goatProvider")
        );
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
    this.registerHandlers();
    this.removeToolsChangedListener = this.runtime.onToolsChanged(() => {
      this.server
        .notification({ method: "notifications/tools/list_changed" })
        .catch((e: unknown) => {
          process.stderr.write(`[web3agent] Failed to emit tools/list_changed: ${e}\n`);
        });
    });
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getAggregatedTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      return this.runtime.invokeTool(name, args);
    });
  }

  private getAggregatedTools(): Tool[] {
    return this.runtime.getMcpTools();
  }

  async shutdown(): Promise<void> {
    if (this.removeToolsChangedListener) {
      this.removeToolsChangedListener();
      this.removeToolsChangedListener = undefined;
    }
    await this.runtime.shutdown();
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
