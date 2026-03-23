import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isAddress } from "viem";
import type { ZodType } from "zod";
import { formatToolError } from "./errors.js";

/**
 * Tool-layer validation that returns CallToolResult errors instead of throwing.
 * The SDK layer uses Zod .parse() directly and throws on invalid input.
 * Both paths exist because MCP tools must return structured errors while
 * SDK consumers expect thrown exceptions.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: CallToolResult };

export function validateAddress(address: string, paramName: string): CallToolResult | null {
  if (!isAddress(address)) {
    return formatToolError(
      "INVALID_ADDRESS",
      `Invalid Ethereum address for ${paramName}: "${address}"`
    );
  }
  return null;
}

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
