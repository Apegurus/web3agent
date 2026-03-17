import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Web3AgentError } from "../api/errors.js";

// `content[].text` uses the legacy shape ({ error, message }) for backwards compatibility
// with consumers that parse the text field. `structuredContent` uses the normalized envelope
// ({ ok, error: { code, message } }) for programmatic consumers via the root API.
function toErrorBody(code: string, message: string, details?: unknown) {
  return {
    error: code,
    message,
    ...(details === undefined ? {} : { details }),
  };
}

export function formatToolError(code: string, message: string, details?: unknown): CallToolResult {
  const body = toErrorBody(code, message, details);
  const structuredContent = {
    ok: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  } satisfies Record<string, unknown>;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(body),
      },
    ],
    structuredContent,
    isError: true,
  };
}

export function formatToolResponse(data: unknown): CallToolResult {
  const structuredContent = {
    ok: true,
    data,
  } satisfies Record<string, unknown>;

  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
    structuredContent,
    isError: false,
  };
}

export function formatSpotSubmitError(status: number, response: unknown): string {
  const preview = JSON.stringify(response).slice(0, 200);
  return `Spot submit failed (${status}): ${preview}`;
}

export function formatToolErrorFromUnknown(
  fallbackCode: string,
  error: unknown,
  fallbackMessage = "Unknown error"
): CallToolResult {
  if (error instanceof Web3AgentError) {
    return formatToolError(error.code, error.message, error.details);
  }
  if (error instanceof Error) {
    return formatToolError(fallbackCode, error.message);
  }
  return formatToolError(fallbackCode, typeof error === "string" ? error : fallbackMessage);
}
