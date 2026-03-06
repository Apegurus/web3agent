import { join } from "node:path";
import type { HostWriter, WriteOptions, WriteResult } from "./base.js";
import {
  mergeServers,
  multiServerEntries,
  proxyEntries,
  readJsonFile,
  safeWriteConfig,
} from "./base.js";

export class CursorWriter implements HostWriter {
  async write(options: WriteOptions): Promise<WriteResult> {
    const configPath = join(options.projectDir, ".cursor", "mcp.json");
    const incoming = options.mode === "proxy" ? proxyEntries() : multiServerEntries();

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
