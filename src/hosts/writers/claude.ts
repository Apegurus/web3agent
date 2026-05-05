import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BaseHostWriter, type WriteOptions } from "./base.js";

export class ClaudeWriter extends BaseHostWriter {
  protected getConfigPath(options: WriteOptions): string {
    const projectLocal = join(options.projectDir, ".mcp.json");
    if (existsSync(projectLocal)) {
      return projectLocal;
    }
    return join(homedir(), ".claude", "mcp.json");
  }
}
