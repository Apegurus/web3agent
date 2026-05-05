import { join } from "node:path";
import { BaseHostWriter, type WriteOptions } from "./base.js";

export class CursorWriter extends BaseHostWriter {
  protected getConfigPath(options: WriteOptions): string {
    return join(options.projectDir, ".cursor", "mcp.json");
  }
}
