import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { BLOCKSCOUT_DEFAULT_URL } from "../../config/env.js";
import { RemoteMcpAdapter } from "../remote-mcp-adapter.js";

const BOOTSTRAP_TOOL = "__unlock_blockchain_analysis__";

const CHAIN_SUPPORT_NOTE =
  " NOTE: Blockscout hosted instances do NOT support all chains. " +
  "Supported: Ethereum (1), Polygon (137), Arbitrum (42161), Optimism (10), Base (8453), Gnosis (100), Scroll (534352), zkSync Era (324). " +
  "NOT supported: BSC (56), Linea (59144), Avalanche (43114), Blast (81457), Mantle (5000), Mode (34443). " +
  "For token lookups, prefer resolve_token tool instead.";

export class BlockscoutAdapter extends RemoteMcpAdapter {
  constructor(url = BLOCKSCOUT_DEFAULT_URL) {
    super({ name: "blockscout", prefix: "blockscout", url });
  }

  protected override async postConnect(): Promise<void> {
    await this.client.callTool({ name: BOOTSTRAP_TOOL, arguments: {} });
  }

  protected override filterTools(tools: Tool[]): Tool[] {
    return tools.filter((t) => t.name !== BOOTSTRAP_TOOL);
  }

  protected override transformDescription(desc: string): string {
    return desc + CHAIN_SUPPORT_NOTE;
  }
}
