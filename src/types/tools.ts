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

export function formatToolError(code: string, message: string, details?: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: code, message, details }),
      },
    ],
    isError: true,
  };
}

export function formatToolResponse(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
    isError: false,
  };
}
