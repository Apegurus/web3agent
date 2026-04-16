import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { BLOCKSCOUT_DEFAULT_URL, ETHERSCAN_DEFAULT_URL } from "../../config/env.js";

export type WriteMode = "proxy" | "multi-server";

export interface WriteOptions {
  projectDir: string;
  mode: WriteMode;
  dryRun: boolean;
}

export interface WriteResult {
  configPath: string;
  action: "created" | "updated" | "unchanged";
  diff?: string;
  backupPath?: string;
}

export interface HostWriter {
  write(options: WriteOptions): Promise<WriteResult>;
}

const MANAGED_KEYS = ["web3agent", "blockscout", "etherscan", "evm"];

export function proxyEntries(): Record<string, unknown> {
  return {
    web3agent: {
      type: "stdio",
      command: "npx",
      args: ["web3agent"],
    },
  };
}

export function multiServerEntries(): Record<string, unknown> {
  return {
    web3agent: {
      type: "stdio",
      command: "npx",
      args: ["web3agent"],
    },
    blockscout: {
      type: "sse",
      url: BLOCKSCOUT_DEFAULT_URL,
    },
    etherscan: {
      type: "sse",
      url: ETHERSCAN_DEFAULT_URL,
    },
    evm: {
      command: "npx",
      args: ["-y", "@mcpdotdirect/evm-mcp-server"],
    },
  };
}

export function mergeServers(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): { merged: Record<string, unknown>; changed: boolean } {
  const merged = { ...existing };
  let changed = false;

  for (const key of MANAGED_KEYS) {
    if (key in incoming) {
      const oldVal = JSON.stringify(merged[key]);
      const newVal = JSON.stringify(incoming[key]);
      if (oldVal !== newVal) {
        merged[key] = incoming[key];
        changed = true;
      }
    }
  }

  for (const key of MANAGED_KEYS) {
    if (!(key in incoming) && key in merged) {
      delete merged[key];
      changed = true;
    }
  }

  return { merged, changed };
}

export async function safeWriteConfig(
  configPath: string,
  content: string,
  dryRun: boolean
): Promise<{ action: "created" | "updated"; backupPath?: string }> {
  const exists = existsSync(configPath);

  if (dryRun) {
    return { action: exists ? "updated" : "created" };
  }

  await mkdir(dirname(configPath), { recursive: true });

  let backupPath: string | undefined;
  if (exists) {
    backupPath = `${configPath}.bak`;
    await copyFile(configPath, backupPath);
  }

  await writeFile(configPath, content, "utf-8");
  return { action: exists ? "updated" : "created", backupPath };
}

export async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export abstract class BaseHostWriter implements HostWriter {
  protected abstract getConfigPath(options: WriteOptions): string;

  protected getConfigSectionKey(): string {
    return "mcpServers";
  }

  protected getEntries(options: WriteOptions): Record<string, unknown> {
    return options.mode === "proxy" ? proxyEntries() : multiServerEntries();
  }

  async write(options: WriteOptions): Promise<WriteResult> {
    const configPath = this.getConfigPath(options);
    const incoming = this.getEntries(options);
    const sectionKey = this.getConfigSectionKey();

    const existing = await readJsonFile(configPath);

    if (existing) {
      const servers = (existing[sectionKey] as Record<string, unknown>) ?? {};
      const { merged, changed } = mergeServers(servers, incoming);

      if (!changed) {
        return { configPath, action: "unchanged" };
      }

      const updated = { ...existing, [sectionKey]: merged };
      const content = `${JSON.stringify(updated, null, 2)}\n`;

      if (options.dryRun) {
        return {
          configPath,
          action: "updated",
          diff: `Would update ${sectionKey} in ${configPath}`,
        };
      }

      const { backupPath } = await safeWriteConfig(configPath, content, false);
      return { configPath, action: "updated", backupPath };
    }

    const fresh = { [sectionKey]: incoming };
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
