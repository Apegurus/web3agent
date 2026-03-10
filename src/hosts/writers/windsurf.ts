import { homedir } from "node:os";
import { join } from "node:path";
import { BLOCKSCOUT_DEFAULT_URL, ETHERSCAN_DEFAULT_URL } from "../../config/env.js";
import { BaseHostWriter, type WriteOptions } from "./base.js";

export class WindsurfWriter extends BaseHostWriter {
  protected getConfigPath(_options: WriteOptions): string {
    return join(homedir(), ".codeium", "windsurf", "mcp_config.json");
  }

  protected override getEntries(options: WriteOptions): Record<string, unknown> {
    if (options.mode === "proxy") {
      return {
        web3agent: { command: "npx", args: ["web3agent"] },
      };
    }
    return {
      web3agent: { command: "npx", args: ["web3agent"] },
      blockscout: { serverUrl: BLOCKSCOUT_DEFAULT_URL },
      etherscan: { serverUrl: ETHERSCAN_DEFAULT_URL },
      evm: { command: "npx", args: ["-y", "@mcpdotdirect/evm-mcp-server"] },
    };
  }
}
