import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { HOSTS, type SupportedHost } from "../registry.js";
import type { WriteOptions, WriteResult } from "../writers/base.js";

const MARKER_START = "<!-- web3agent:start -->";
const MARKER_END = "<!-- web3agent:end -->";

const CONTEXT_BODY = `## Web3

This project has web3agent configured. Use the MCP tools for Web3 operations.
See: web3agent server_status, list_supported_chains for available capabilities.`;

const MANAGED_BLOCK = `${MARKER_START}\n${CONTEXT_BODY}\n${MARKER_END}`;

const CURSOR_FRONTMATTER = `---
description: Web3 capabilities
globs: []
alwaysApply: false
---`;

function contextFilePath(host: SupportedHost, projectDir: string): string {
  return HOSTS[host].contextTarget({ projectDir, homeDir: homedir() });
}

function buildContent(host: SupportedHost): string {
  if (host === "cursor") {
    return `${CURSOR_FRONTMATTER}\n\n${MANAGED_BLOCK}\n`;
  }
  return `${MANAGED_BLOCK}\n`;
}

function replaceManagedBlock(existing: string, newBlock: string): string {
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + MARKER_END.length);
    return `${before}${newBlock}${after}`;
  }

  const trimmed = existing.trimEnd();
  return `${trimmed}\n\n${newBlock}\n`;
}

export async function installContext(
  host: SupportedHost,
  options: WriteOptions
): Promise<WriteResult> {
  const filePath = contextFilePath(host, options.projectDir);

  if (existsSync(filePath)) {
    const existing = await readFile(filePath, "utf-8");

    if (host === "cursor" || host === "windsurf") {
      const updated = buildContent(host);
      if (existing === updated) {
        return { configPath: filePath, action: "unchanged" };
      }
      if (options.dryRun) {
        return { configPath: filePath, action: "updated", diff: `Would update ${filePath}` };
      }
      await writeFile(filePath, updated, "utf-8");
      return { configPath: filePath, action: "updated" };
    }

    const hasMarkers = existing.includes(MARKER_START) && existing.includes(MARKER_END);
    const updated = replaceManagedBlock(existing, MANAGED_BLOCK);

    if (existing === updated) {
      return { configPath: filePath, action: "unchanged" };
    }

    if (options.dryRun) {
      const verb = hasMarkers ? "update managed section in" : "append managed section to";
      return { configPath: filePath, action: "updated", diff: `Would ${verb} ${filePath}` };
    }

    await writeFile(filePath, updated, "utf-8");
    return { configPath: filePath, action: "updated" };
  }

  if (options.dryRun) {
    return { configPath: filePath, action: "created", diff: `Would create ${filePath}` };
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, buildContent(host), "utf-8");
  return { configPath: filePath, action: "created" };
}
