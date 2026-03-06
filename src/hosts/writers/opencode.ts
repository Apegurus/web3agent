import { existsSync } from "node:fs";
import { join } from "node:path";
import type { HostWriter, WriteOptions, WriteResult } from "./base.js";
import { mergeServers, readJsonFile, safeWriteConfig } from "./base.js";

function opencodeProxyEntries(): Record<string, unknown> {
  return {
    web3agent: {
      type: "local",
      command: ["npx", "web3agent"],
    },
  };
}

function opencodeMultiServerEntries(): Record<string, unknown> {
  return {
    web3agent: {
      type: "local",
      command: ["npx", "web3agent"],
    },
    blockscout: {
      type: "sse",
      url: "https://mcp.blockscout.com/mcp",
    },
    evm: {
      type: "local",
      command: ["npx", "-y", "@mcpdotdirect/evm-mcp-server"],
    },
  };
}

function resolveConfigPath(projectDir: string): string {
  const dotOpencode = join(projectDir, ".opencode", "config.json");
  if (existsSync(dotOpencode)) {
    return dotOpencode;
  }
  const rootConfig = join(projectDir, "opencode.json");
  if (existsSync(rootConfig)) {
    return rootConfig;
  }
  return dotOpencode;
}

export class OpenCodeWriter implements HostWriter {
  async write(options: WriteOptions): Promise<WriteResult> {
    const configPath = resolveConfigPath(options.projectDir);
    const incoming =
      options.mode === "proxy" ? opencodeProxyEntries() : opencodeMultiServerEntries();

    const existing = await readJsonFile(configPath);

    if (existing) {
      const mcpSection = (existing.mcp as Record<string, unknown>) ?? {};
      const { merged, changed } = mergeServers(mcpSection, incoming);

      if (!changed) {
        return { configPath, action: "unchanged" };
      }

      const updated = { ...existing, mcp: merged };
      const content = `${JSON.stringify(updated, null, 2)}\n`;

      if (options.dryRun) {
        return {
          configPath,
          action: "updated",
          diff: `Would update mcp section in ${configPath}`,
        };
      }

      const { backupPath } = await safeWriteConfig(configPath, content, false);
      return { configPath, action: "updated", backupPath };
    }

    const fresh = { mcp: incoming };
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
