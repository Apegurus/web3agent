import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

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
