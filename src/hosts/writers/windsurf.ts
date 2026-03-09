import { homedir } from "node:os";
import { join } from "node:path";
import { BLOCKSCOUT_DEFAULT_URL, ETHERSCAN_DEFAULT_URL } from "../../config/env.js";
import type { HostWriter, WriteOptions, WriteResult } from "./base.js";
import { mergeServers, readJsonFile, safeWriteConfig } from "./base.js";

function windsurfProxyEntries(): Record<string, unknown> {
  return {
    web3agent: {
      command: "npx",
      args: ["web3agent"],
    },
  };
}

function windsurfMultiServerEntries(): Record<string, unknown> {
  return {
    web3agent: {
      command: "npx",
      args: ["web3agent"],
    },
    blockscout: {
      serverUrl: BLOCKSCOUT_DEFAULT_URL,
    },
    etherscan: {
      serverUrl: ETHERSCAN_DEFAULT_URL,
    },
    evm: {
      command: "npx",
      args: ["-y", "@mcpdotdirect/evm-mcp-server"],
    },
  };
}

export class WindsurfWriter implements HostWriter {
  async write(options: WriteOptions): Promise<WriteResult> {
    const configPath = join(homedir(), ".codeium", "windsurf", "mcp_config.json");
    const incoming =
      options.mode === "proxy" ? windsurfProxyEntries() : windsurfMultiServerEntries();

    const existing = await readJsonFile(configPath);

    if (existing) {
      const servers = (existing.mcpServers as Record<string, unknown>) ?? {};
      const { merged, changed } = mergeServers(servers, incoming);

      if (!changed) {
        return { configPath, action: "unchanged" };
      }

      const updated = { ...existing, mcpServers: merged };
      const content = `${JSON.stringify(updated, null, 2)}\n`;

      if (options.dryRun) {
        return {
          configPath,
          action: "updated",
          diff: `Would update mcpServers in ${configPath}`,
        };
      }

      const { backupPath } = await safeWriteConfig(configPath, content, false);
      return { configPath, action: "updated", backupPath };
    }

    const fresh = { mcpServers: incoming };
    const content = `${JSON.stringify(fresh, null, 2)}\n`;

    if (options.dryRun) {
      return {
        configPath,
        action: "created",
        diff: `Would create ${configPath}`,
      };
    }

    await safeWriteConfig(configPath, content, false);
    return { configPath, action: "created" };
  }
}
