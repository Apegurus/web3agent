import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BLOCKSCOUT_DEFAULT_URL } from "../../config/env.js";
import type { BackendStatusCode } from "../../types/health.js";
import type { AdapterHealth, PrefixedTool, UpstreamAdapter } from "../../types/upstream.js";

const BOOTSTRAP_TOOL = "__unlock_blockchain_analysis__";
const PREFIX = "blockscout";

const CHAIN_SUPPORT_NOTE =
  " NOTE: Blockscout hosted instances do NOT support all chains. " +
  "Supported: Ethereum (1), Polygon (137), Arbitrum (42161), Optimism (10), Base (8453), Gnosis (100), Scroll (534352), zkSync Era (324). " +
  "NOT supported: BSC (56), Linea (59144), Avalanche (43114), Blast (81457), Mantle (5000), Mode (34443). " +
  "For token lookups, prefer resolve_token tool instead.";

export class BlockscoutAdapter implements UpstreamAdapter {
  public readonly name = "blockscout";
  private client: Client;
  private tools: PrefixedTool[] = [];
  private routeMap = new Map<string, string>();
  private health: AdapterHealth;
  private url: string;

  constructor(url = BLOCKSCOUT_DEFAULT_URL) {
    this.url = url;
    this.client = new Client({ name: "web3agent", version: "0.1.0" });
    this.health = {
      name: "blockscout",
      status: "unavailable" as BackendStatusCode,
      message: "Not initialized",
    };
  }

  async initialize(): Promise<void> {
    const endpoint = new URL(this.url);

    let connected = false;
    for (const TransportClass of [StreamableHTTPClientTransport, SSEClientTransport]) {
      try {
        const transport = new TransportClass(endpoint);
        await this.client.connect(transport);
        connected = true;
        break;
      } catch (e: unknown) {
        process.stderr.write(`[blockscout] ${TransportClass.name} transport failed: ${e}\n`);
        this.client = new Client({ name: "web3agent", version: "0.1.0" });
      }
    }

    if (!connected) {
      this.health = {
        name: "blockscout",
        status: "degraded" as BackendStatusCode,
        message: `Failed to connect to ${this.url} via StreamableHTTP and SSE`,
      };
      return;
    }

    try {
      await this.client.callTool({
        name: BOOTSTRAP_TOOL,
        arguments: {},
      });

      const { tools: rawTools } = await this.client.listTools();
      const filtered = rawTools.filter((t) => t.name !== BOOTSTRAP_TOOL);

      this.tools = filtered.map((t) => {
        const prefixedName = `${PREFIX}_${t.name}`;
        this.routeMap.set(prefixedName, t.name);
        return {
          ...t,
          name: prefixedName,
          description: (t.description ?? "") + CHAIN_SUPPORT_NOTE,
          upstreamName: t.name,
          prefix: PREFIX,
        } as PrefixedTool;
      });

      this.health = {
        name: "blockscout",
        status: "ok" as BackendStatusCode,
        message: `Connected with ${this.tools.length} tools`,
        toolCount: this.tools.length,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown post-connect error";
      this.health = {
        name: "blockscout",
        status: "degraded" as BackendStatusCode,
        message: `Connected but bootstrap/listTools failed: ${msg}`,
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
      process.stderr.write(`[blockscout] Failed to close client during shutdown: ${e}\n`);
    }
  }
}
