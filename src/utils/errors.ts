import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Web3AgentError } from "../api/errors.js";

// `content[].text` uses the legacy shape ({ error, message }) for backwards compatibility
// with consumers that parse the text field. `structuredContent` uses the normalized envelope
// ({ ok, error: { code, message } }) for programmatic consumers via the root API.
function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, toJsonSafe(nested)])
    );
  return value;
}

function toErrorBody(code: string, message: string, details?: unknown) {
  return {
    error: code,
    message,
    ...(details === undefined ? {} : { details: toJsonSafe(details) }),
  };
}

export function formatToolError(code: string, message: string, details?: unknown): CallToolResult {
  const body = toErrorBody(code, message, details);
  const safeDetails = details === undefined ? undefined : toJsonSafe(details);
  const structuredContent = {
    ok: false,
    error: {
      code,
      message,
      ...(safeDetails === undefined ? {} : { details: safeDetails }),
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
  const safeData = toJsonSafe(data);
  const structuredContent = {
    ok: true,
    data: safeData,
  } satisfies Record<string, unknown>;

  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(safeData, null, 2),
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
