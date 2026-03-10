import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { BackendStatusCode } from "../types/health.js";
import type { AdapterHealth, PrefixedTool, UpstreamAdapter } from "../types/upstream.js";
import { VERSION } from "../version.js";

export interface RemoteMcpAdapterConfig {
  name: string;
  prefix: string;
  url: string;
  initialStatus?: BackendStatusCode;
  initialMessage?: string;
}

export abstract class RemoteMcpAdapter implements UpstreamAdapter {
  public readonly name: string;
  protected client: Client;
  protected tools: PrefixedTool[] = [];
  protected routeMap = new Map<string, string>();
  protected health: AdapterHealth;

  private readonly prefix: string;
  private readonly url: string;

  constructor(config: RemoteMcpAdapterConfig) {
    this.name = config.name;
    this.prefix = config.prefix;
    this.url = config.url;
    this.client = new Client({ name: "web3agent", version: VERSION });
    this.health = {
      name: config.name,
      status: config.initialStatus ?? "unavailable",
      message: config.initialMessage ?? "Not initialized",
    };
  }

  protected shouldSkipInit(): boolean {
    return false;
  }

  protected getTransportOptions(): RequestInit | undefined {
    return undefined;
  }

  protected async postConnect(): Promise<void> {
    /* default: no-op */
  }

  protected filterTools(tools: Tool[]): Tool[] {
    return tools;
  }

  protected transformDescription(description: string): string {
    return description;
  }

  async initialize(): Promise<void> {
    if (this.shouldSkipInit()) return;

    const endpoint = new URL(this.url);
    const requestInit = this.getTransportOptions();

    let connected = false;
    for (const TransportClass of [StreamableHTTPClientTransport, SSEClientTransport]) {
      try {
        const transport = requestInit
          ? new TransportClass(endpoint, { requestInit })
          : new TransportClass(endpoint);
        await this.client.connect(transport);
        connected = true;
        break;
      } catch (e: unknown) {
        process.stderr.write(`[${this.name}] ${TransportClass.name} transport failed: ${e}\n`);
        try {
          await this.client.close();
        } catch {
          /* best-effort cleanup of partially-connected client */
        }
        this.client = new Client({ name: "web3agent", version: VERSION });
      }
    }

    if (!connected) {
      this.health = {
        name: this.name,
        status: "degraded" as BackendStatusCode,
        message: `Failed to connect to ${this.url} via StreamableHTTP and SSE`,
      };
      return;
    }

    try {
      await this.postConnect();

      const { tools: rawTools } = await this.client.listTools();
      const filtered = this.filterTools(rawTools);

      this.tools = filtered.map((t) => {
        const prefixedName = `${this.prefix}_${t.name}`;
        this.routeMap.set(prefixedName, t.name);
        return {
          ...t,
          name: prefixedName,
          description: this.transformDescription(t.description ?? ""),
          upstreamName: t.name,
          prefix: this.prefix,
        } as PrefixedTool;
      });

      this.health = {
        name: this.name,
        status: "ok" as BackendStatusCode,
        message: `Connected with ${this.tools.length} tools`,
        toolCount: this.tools.length,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown post-connect error";
      this.health = {
        name: this.name,
        status: "degraded" as BackendStatusCode,
        message: `Connected but post-connect/listTools failed: ${msg}`,
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
      process.stderr.write(`[${this.name}] Failed to close client during shutdown: ${e}\n`);
    }
  }
}
