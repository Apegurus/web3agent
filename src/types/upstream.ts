import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { BackendStatus } from "./health.js";

export interface PrefixedTool extends Tool {
  upstreamName: string;
  prefix: string;
}

export interface AdapterHealth extends BackendStatus {
  restartCount?: number;
  pid?: number;
  uptimeMs?: number;
  lastRestartAt?: Date;
}

export interface UpstreamAdapter {
  name: string;
  initialize(): Promise<void>;
  getTools(): PrefixedTool[];
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  getHealth(): AdapterHealth;
  shutdown(): Promise<void>;
}
