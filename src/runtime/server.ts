import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { VERSION } from "../version.js";
import type { ManagedRuntime } from "./managed-runtime.js";

interface RuntimeBridge {
  getMcpTools(): Tool[];
  invokeTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  onToolsChanged(listener: () => void): () => void;
  shutdown(): Promise<void>;
}

export class ProxyServer {
  private readonly server: Server;
  private removeToolsChangedListener?: () => void;
  private readonly runtime: RuntimeBridge;

  constructor(runtime: ManagedRuntime) {
    this.runtime = runtime;
    this.server = new Server(
      { name: "web3agent", version: VERSION },
      {
        capabilities: { tools: { listChanged: true } },
        instructions: [
          "web3agent is a unified Web3 MCP proxy server.",
          "Token resolution: ALWAYS call resolve_token before swaps/bridges to get the correct contract address.",
          "Write operations: By default, writes (swaps, bridges, transfers) are queued. Call transaction_confirm(id) to execute, transaction_deny(id) to discard.",
          "Wallet activation: Call wallet_activate with a private key or mnemonic to enable write operations. Call wallet_get_active to check current state.",
          "Browser wallet flows: Use the *_prepare_* intent tools plus transaction_simulate to prepare and inspect externally signed transactions. Generic MCP hosts cannot trigger browser wallet signing prompts themselves.",
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
