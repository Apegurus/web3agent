import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { AdapterHealth, PrefixedTool, UpstreamAdapter } from "../../types/upstream.js";
import type { WalletState } from "../../types/wallet.js";
import { walletEvents } from "../../wallet/events.js";

const PREFIX = "evm";

function buildEvmEnv(_walletState?: WalletState): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
  };
  if (process.env.TERM) env.TERM = process.env.TERM;
  if (process.env.NODE_ENV) env.NODE_ENV = process.env.NODE_ENV;
  if (process.env.PRIVATE_KEY) env.EVM_PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (process.env.MNEMONIC) env.EVM_MNEMONIC = process.env.MNEMONIC;
  if (process.env.WALLET_ACCOUNT_INDEX) env.EVM_ACCOUNT_INDEX = process.env.WALLET_ACCOUNT_INDEX;
  if (process.env.ETHERSCAN_API_KEY) env.ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
  return env;
}

export class EvmAdapter implements UpstreamAdapter {
  public readonly name = "evm";

  private client!: Client;
  private transport!: StdioClientTransport;
  private tools: PrefixedTool[] = [];
  private routeMap = new Map<string, string>();
  private health: AdapterHealth;
  private startedAt?: Date;
  private restartCount = 0;
  private restarting = false;

  constructor() {
    this.health = {
      name: "evm",
      status: "unavailable",
      message: "Not initialized",
    };
  }

  async initialize(): Promise<void> {
    await this.start();

    walletEvents.on("wallet-changed", async (_state: WalletState) => {
      await this.restart();
    });

    process.on("exit", () => this.killSubprocess());
    process.on("SIGTERM", () => this.killSubprocess());
    process.on("SIGINT", () => this.killSubprocess());
  }

  private async start(): Promise<void> {
    try {
      const whitelistedEnv = buildEvmEnv();

      this.transport = new StdioClientTransport({
        command: "npx",
        args: ["-y", "@mcpdotdirect/evm-mcp-server"],
        env: whitelistedEnv,
      });

      this.client = new Client({
        name: "web3agent-evm",
        version: "1.0.0",
      });

      await this.client.connect(this.transport);
      this.startedAt = new Date();

      const result = await this.client.listTools();
      this.tools = [];
      this.routeMap.clear();

      for (const tool of result.tools) {
        const prefixed = `${PREFIX}_${tool.name}`;
        this.routeMap.set(prefixed, tool.name);
        this.tools.push({
          ...tool,
          name: prefixed,
          upstreamName: tool.name,
          prefix: PREFIX,
        });
      }

      const pid =
        (this.transport as unknown as { process?: { pid?: number } }).process?.pid ?? undefined;

      this.health = {
        name: "evm",
        status: "ok",
        message: `Running with ${this.tools.length} tools`,
        toolCount: this.tools.length,
        restartCount: this.restartCount,
        pid,
        uptimeMs: 0,
      };

      process.stderr.write(
        `[evm] Started with ${this.tools.length} tools (pid=${pid ?? "unknown"})\n`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown startup error";
      process.stderr.write(`[evm] Failed to start: ${message}\n`);

      this.tools = [];
      this.routeMap.clear();
      this.health = {
        name: "evm",
        status: "degraded",
        message: `Startup failed: ${message}`,
        toolCount: 0,
        restartCount: this.restartCount,
      };
    }
  }

  private async restart(): Promise<void> {
    if (this.restarting) return;
    this.restarting = true;

    try {
      process.stderr.write("[evm] Restarting due to wallet change...\n");

      try {
        await this.client?.close();
      } catch {}
      this.killSubprocess();

      this.restartCount++;
      await this.start();

      this.health.lastRestartAt = new Date();
      this.health.restartCount = this.restartCount;
    } finally {
      this.restarting = false;
    }
  }

  private killSubprocess(): void {
    try {
      const proc = (this.transport as unknown as { process?: { kill?: () => void } })?.process;
      if (proc?.kill) {
        proc.kill();
      }
    } catch {}
  }

  getTools(): PrefixedTool[] {
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const upstreamName = this.routeMap.get(name);
    if (!upstreamName) {
      throw new Error(`Unknown EVM tool: ${name}`);
    }

    if (this.health.status !== "ok") {
      throw new Error(`EVM adapter is ${this.health.status}: ${this.health.message}`);
    }

    const result = await this.client.callTool({
      name: upstreamName,
      arguments: args,
    });
    return result;
  }

  getHealth(): AdapterHealth {
    if (this.startedAt && this.health.status === "ok") {
      this.health.uptimeMs = Date.now() - this.startedAt.getTime();
    }
    return this.health;
  }

  async shutdown(): Promise<void> {
    try {
      await this.client?.close();
    } catch {}
    this.killSubprocess();
    this.health = {
      name: "evm",
      status: "unavailable",
      message: "Shut down",
      toolCount: 0,
    };
    process.stderr.write("[evm] Shut down\n");
  }
}
