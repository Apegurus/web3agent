import { existsSync } from "node:fs";
import { join } from "node:path";
import { BLOCKSCOUT_DEFAULT_URL, ETHERSCAN_DEFAULT_URL } from "../../config/env.js";
import { BaseHostWriter, type WriteOptions } from "./base.js";

export class OpenCodeWriter extends BaseHostWriter {
  protected getConfigPath(options: WriteOptions): string {
    const dotOpencode = join(options.projectDir, ".opencode", "config.json");
    if (existsSync(dotOpencode)) return dotOpencode;
    const rootConfig = join(options.projectDir, "opencode.json");
    if (existsSync(rootConfig)) return rootConfig;
    return dotOpencode;
  }

  protected override getConfigSectionKey(): string {
    return "mcp";
  }

  protected override getEntries(options: WriteOptions): Record<string, unknown> {
    if (options.mode === "proxy") {
      return {
        web3agent: { type: "local", command: ["npx", "web3agent"] },
      };
    }
    return {
      web3agent: { type: "local", command: ["npx", "web3agent"] },
      blockscout: { type: "sse", url: BLOCKSCOUT_DEFAULT_URL },
      etherscan: { type: "sse", url: ETHERSCAN_DEFAULT_URL },
      evm: { type: "local", command: ["npx", "-y", "@mcpdotdirect/evm-mcp-server"] },
    };
  }
}
