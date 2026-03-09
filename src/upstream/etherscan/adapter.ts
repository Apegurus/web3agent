import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ETHERSCAN_DEFAULT_URL } from "../../config/env.js";
import type { BackendStatusCode } from "../../types/health.js";
import type { AdapterHealth, PrefixedTool, UpstreamAdapter } from "../../types/upstream.js";

const PREFIX = "etherscan";

export class EtherscanAdapter implements UpstreamAdapter {
  public readonly name = "etherscan";
  private client: Client;
  private tools: PrefixedTool[] = [];
  private routeMap = new Map<string, string>();
  private health: AdapterHealth;
  private url: string;
  private apiKey: string | undefined;

  constructor(url = ETHERSCAN_DEFAULT_URL, apiKey?: string) {
    this.url = url;
    this.apiKey = apiKey;
    this.client = new Client({ name: "web3agent", version: "0.1.0" });
    this.health = {
      name: "etherscan",
      status: (apiKey ? "unavailable" : "not_configured") as BackendStatusCode,
      message: apiKey ? "Not initialized" : "No API key provided (ETHERSCAN_API_KEY)",
    };
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      return;
    }

    const endpoint = new URL(this.url);
    const requestInit: RequestInit = {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    };

    let connected = false;
    for (const TransportClass of [StreamableHTTPClientTransport, SSEClientTransport]) {
      try {
        const transport = new TransportClass(endpoint, { requestInit });
        await this.client.connect(transport);
        connected = true;
        break;
      } catch (e: unknown) {
        process.stderr.write(`[etherscan] ${TransportClass.name} transport failed: ${e}\n`);
        this.client = new Client({ name: "web3agent", version: "0.1.0" });
      }
    }

    if (!connected) {
      this.health = {
        name: "etherscan",
        status: "degraded" as BackendStatusCode,
        message: `Failed to connect to ${this.url} via StreamableHTTP and SSE`,
      };
      return;
    }

    try {
      const { tools: rawTools } = await this.client.listTools();

      this.tools = rawTools.map((t) => {
        const prefixedName = `${PREFIX}_${t.name}`;
        this.routeMap.set(prefixedName, t.name);
        return {
          ...t,
          name: prefixedName,
          upstreamName: t.name,
          prefix: PREFIX,
        } as PrefixedTool;
      });

      this.health = {
        name: "etherscan",
        status: "ok" as BackendStatusCode,
        message: `Connected with ${this.tools.length} tools`,
        toolCount: this.tools.length,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown post-connect error";
      this.health = {
        name: "etherscan",
        status: "degraded" as BackendStatusCode,
        message: `Connected but listTools failed: ${msg}`,
      };
    }
  }

  getTools(): PrefixedTool[] {
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const originalName = this.routeMap.get(name);
    if (!originalName) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return this.client.callTool({ name: originalName, arguments: args });
  }

  getHealth(): AdapterHealth {
    return this.health;
  }

  async shutdown(): Promise<void> {
    try {
      await this.client.close();
    } catch (e: unknown) {
      process.stderr.write(`[etherscan] Failed to close client during shutdown: ${e}\n`);
    }
  }
}
