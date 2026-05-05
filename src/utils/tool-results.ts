import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolResultError, ToolResultPayload } from "../runtime/types.js";
import { formatToolResponse } from "./errors.js";

type LegacyStructuredError = {
  error?: unknown;
  message?: unknown;
  details?: unknown;
};

export function isCallToolResult(value: unknown): value is CallToolResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { content?: unknown; isError?: unknown };
  return (
    Array.isArray(candidate.content) &&
    (candidate.isError === undefined || typeof candidate.isError === "boolean")
  );
}

function isToolResultError(value: unknown): value is ToolResultError {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { code?: unknown; message?: unknown; details?: unknown };
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}

function isToolResultPayload(value: unknown): value is ToolResultPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { ok?: unknown; data?: unknown; error?: unknown };

  if (candidate.ok === true) {
    return "data" in candidate;
  }

  return candidate.ok === false && isToolResultError(candidate.error);
}

function getFirstText(result: CallToolResult): string | undefined {
  const firstText = result.content.find((item) => {
    const content = item as { text?: unknown };
    return typeof content.text === "string";
  }) as { text?: string } | undefined;

  return firstText?.text;
}

function parseJsonText(rawText?: string): unknown {
  if (!rawText) {
    return undefined;
  }

  try {
    return JSON.parse(rawText);
  } catch (_error: unknown) {
    return rawText;
  }
}

function getLegacyError(value: unknown): ToolResultError | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as LegacyStructuredError;
  if (typeof candidate.error === "string" && typeof candidate.message === "string") {
    return {
      code: candidate.error,
      message: candidate.message,
      ...(candidate.details === undefined ? {} : { details: candidate.details }),
    };
  }

  if (isToolResultError(candidate.error)) {
    return candidate.error;
  }

  return undefined;
}

export function normalizeCallToolResult(value: unknown): CallToolResult {
  if (!isCallToolResult(value)) {
    return formatToolResponse(value);
  }

  const result: CallToolResult = {
    ...value,
    isError: value.isError ?? false,
  };

  if (isToolResultPayload(result.structuredContent)) {
    return result;
  }

  if (result.isError) {
    const error = getLegacyError(result.structuredContent) ??
      getLegacyError(parseJsonText(getFirstText(result))) ?? {
        code: "TOOL_ERROR",
        message: getFirstText(result) ?? "Tool invocation failed",
      };

    return {
      ...result,
      structuredContent: {
        ok: false,
        error,
      },
    };
  }

  const structuredContent = result.structuredContent;
  const data =
    structuredContent !== undefined ? structuredContent : parseJsonText(getFirstText(result));

  return {
    ...result,
    structuredContent: {
      ok: true,
      data,
    },
  };
}

export function getToolResultPayload(result: CallToolResult): ToolResultPayload {
  const normalized = normalizeCallToolResult(result);

  if (isToolResultPayload(normalized.structuredContent)) {
    return normalized.structuredContent;
  }

  return normalized.isError
    ? {
        ok: false,
        error: {
          code: "TOOL_ERROR",
          message: getFirstText(normalized) ?? "Tool invocation failed",
        },
      }
    : {
        ok: true,
        data: undefined,
      };
}
