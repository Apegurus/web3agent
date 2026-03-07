import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

export type ToolSource = "custom" | "goat" | "blockscout" | "evm" | "lifi" | "orbs";

export interface ToolRoute {
  name: string;
  source: ToolSource;
  handler: (params: Record<string, unknown>) => Promise<CallToolResult>;
}

export interface AggregatedToolList {
  tools: Tool[];
  routes: Map<string, ToolRoute>;
}
