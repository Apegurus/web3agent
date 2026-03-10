import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodType } from "zod";
import { formatToolError } from "./errors.js";

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: CallToolResult };

export function validateInput<T>(schema: ZodType<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const messages = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  return {
    success: false,
    error: formatToolError("INVALID_PARAMS", messages.join("; ")),
  };
}
