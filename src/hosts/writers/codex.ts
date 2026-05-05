import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { BLOCKSCOUT_DEFAULT_URL, ETHERSCAN_DEFAULT_URL } from "../../config/env.js";
import { type HostWriter, type WriteOptions, type WriteResult, safeWriteConfig } from "./base.js";

const MARKER_START = "# web3agent:start";
const MARKER_END = "# web3agent:end";
const MANAGED_SERVER_NAMES = new Set(["web3agent", "blockscout", "etherscan", "evm"]);

function toTomlString(value: string): string {
  return JSON.stringify(value);
}

function toTomlStringArray(values: string[]): string {
  return `[${values.map((value) => toTomlString(value)).join(", ")}]`;
}

export function encodeTomlSection(name: string, value: Record<string, unknown>): string[] {
  const lines = [`[mcp_servers.${name}]`];

  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") {
      lines.push(`${key} = ${toTomlString(raw)}`);
    } else if (typeof raw === "boolean") {
      lines.push(`${key} = ${raw ? "true" : "false"}`);
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      lines.push(`${key} = ${raw}`);
    } else if (Array.isArray(raw) && raw.every((item) => typeof item === "string")) {
      lines.push(`${key} = ${toTomlStringArray(raw as string[])}`);
    } else {
      process.stderr.write(
        `[hosts/codex] Skipping unsupported TOML value type for ${name}.${key}: ${typeof raw}\n`
      );
    }
  }

  return lines;
}

function getCodexEntries(options: WriteOptions): Record<string, Record<string, unknown>> {
  if (options.mode === "proxy") {
    return {
      web3agent: {
        command: "npx",
        args: ["web3agent"],
      },
    };
  }

  return {
    web3agent: {
      command: "npx",
      args: ["web3agent"],
    },
    blockscout: {
      url: BLOCKSCOUT_DEFAULT_URL,
    },
    etherscan: {
      url: ETHERSCAN_DEFAULT_URL,
    },
    evm: {
      command: "npx",
      args: ["-y", "@mcpdotdirect/evm-mcp-server"],
    },
  };
}

function buildManagedBlock(options: WriteOptions): string {
  const entries = getCodexEntries(options);
  const body = Object.entries(entries)
    .flatMap(([name, value]) => encodeTomlSection(name, value as Record<string, unknown>))
    .join("\n\n");

  return `${MARKER_START}\n${body}\n${MARKER_END}`;
}

function isManagedHeader(line: string): boolean {
  const match = line.match(/^\[mcp_servers\.([A-Za-z0-9_-]+)(?:\..+)?\]\s*$/);
  if (!match) return false;
  return MANAGED_SERVER_NAMES.has(match[1]);
}

function stripManagedSections(existing: string): string {
  const lines = existing.split("\n");
  const kept: string[] = [];
  let skippingManaged = false;

  for (const line of lines) {
    const isHeader = /^\[.*\]\s*$/.test(line);

    if (isManagedHeader(line)) {
      skippingManaged = true;
      continue;
    }

    if (skippingManaged) {
      if (isHeader) {
        skippingManaged = false;
        kept.push(line);
      }
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n").trimEnd();
}

export function mergeManagedBlock(existing: string, managedBlock: string): string {
  const startIdx = existing.indexOf(MARKER_START);
  // Start-anchor the end-marker search: only find MARKER_END that appears AFTER
  // MARKER_START. Otherwise a literal "# web3agent:end" earlier in the file
  // (e.g., in user comments) would be matched as the block terminator, producing
  // garbage output.
  const endIdx =
    startIdx === -1 ? -1 : existing.indexOf(MARKER_END, startIdx + MARKER_START.length);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx).trimEnd();
    const after = existing.slice(endIdx + MARKER_END.length).trimStart();
    const parts = [before, managedBlock, after].filter((part) => part.length > 0);
    return `${parts.join("\n\n")}\n`;
  }

  const stripped = stripManagedSections(existing);
  return stripped.length > 0 ? `${stripped}\n\n${managedBlock}\n` : `${managedBlock}\n`;
}

export class CodexWriter implements HostWriter {
  private getConfigPath(options: WriteOptions): string {
    const projectConfig = join(options.projectDir, ".codex", "config.toml");
    if (existsSync(projectConfig) || existsSync(join(options.projectDir, ".codex"))) {
      return projectConfig;
    }
    return join(homedir(), ".codex", "config.toml");
  }

  async write(options: WriteOptions): Promise<WriteResult> {
    const configPath = this.getConfigPath(options);
    const managedBlock = buildManagedBlock(options);
    const exists = existsSync(configPath);

    if (!exists) {
      if (options.dryRun) {
        return {
          configPath,
          action: "created",
          diff: `Would create ${configPath}`,
        };
      }

      await safeWriteConfig(configPath, `${managedBlock}\n`, false);
      return { configPath, action: "created" };
    }

    const existing = await readFile(configPath, "utf-8");
    const updated = mergeManagedBlock(existing, managedBlock);

    if (existing === updated) {
      return { configPath, action: "unchanged" };
    }

    if (options.dryRun) {
      return {
        configPath,
        action: "updated",
        diff: `Would update managed MCP servers in ${configPath}`,
      };
    }

    const { backupPath } = await safeWriteConfig(configPath, updated, false);
    return { configPath, action: "updated", backupPath };
  }
}
