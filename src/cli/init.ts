import { resolve } from "node:path";
import { installContext } from "../hosts/context/index.js";
import { assertSingleHost, detectHosts } from "../hosts/detect.js";
import { HOSTS, type SupportedHost } from "../hosts/registry.js";
import type { WriteMode } from "../hosts/writers/base.js";
import { ClaudeWriter } from "../hosts/writers/claude.js";
import { CodexWriter } from "../hosts/writers/codex.js";
import { CursorWriter } from "../hosts/writers/cursor.js";
import { OpenCodeWriter } from "../hosts/writers/opencode.js";
import { WindsurfWriter } from "../hosts/writers/windsurf.js";

export interface InitOptions {
  host?: SupportedHost;
  mode: WriteMode;
  project: string;
  dryRun: boolean;
}

function parseArgs(args: string[]): InitOptions {
  const options: InitOptions = {
    mode: "proxy",
    project: process.cwd(),
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--host" && i + 1 < args.length) {
      options.host = args[++i] as SupportedHost;
    } else if (arg === "--mode" && i + 1 < args.length) {
      options.mode = args[++i] as WriteMode;
    } else if (arg === "--project" && i + 1 < args.length) {
      options.project = resolve(args[++i]);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

function getWriter(host: SupportedHost) {
  switch (host) {
    case "claude":
      return new ClaudeWriter();
    case "cursor":
      return new CursorWriter();
    case "windsurf":
      return new WindsurfWriter();
    case "opencode":
      return new OpenCodeWriter();
    case "codex":
      return new CodexWriter();
    default:
      throw new Error(`No init writer available for host: ${host}`);
  }
}

export async function runInit(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const projectDir = options.project;

  if (options.dryRun) {
    process.stderr.write("[dry-run] No files will be modified\n");
  }

  const { detected } = await detectHosts(projectDir);
  const initCapable = detected.filter((h) => HOSTS[h].installMethod === "init");
  const host = assertSingleHost(initCapable, options.host);
  if (HOSTS[host].installMethod !== "init") {
    throw new Error(
      `Installation for ${host} is guide-driven, not supported through \`web3agent init\`. Use docs/guides/universal-access.md and let the ${host} agent follow that guide directly.`
    );
  }

  process.stderr.write(`Configuring web3agent for ${host}...\n`);

  const writer = getWriter(host);
  const writeResult = await writer.write({
    projectDir,
    mode: options.mode,
    dryRun: options.dryRun,
  });

  const contextResult = await installContext(host, {
    projectDir,
    mode: options.mode,
    dryRun: options.dryRun,
  });

  process.stderr.write(`\nConfig: ${writeResult.configPath} (${writeResult.action})\n`);
  if (writeResult.diff) {
    process.stderr.write(`  ${writeResult.diff}\n`);
  }
  if (writeResult.backupPath) {
    process.stderr.write(`  Backup: ${writeResult.backupPath}\n`);
  }

  process.stderr.write(`Context: ${contextResult.configPath} (${contextResult.action})\n`);
  if (contextResult.diff) {
    process.stderr.write(`  ${contextResult.diff}\n`);
  }

  if (options.dryRun) {
    process.stderr.write("\n[dry-run] Complete. Re-run without --dry-run to apply changes.\n");
  } else {
    process.stderr.write(`\nDone. Restart ${host} to activate web3agent.\n`);
  }
}
