import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodTypeAny } from "zod";
import { formatToolErrorFromUnknown, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";

export function createToolHandler<TInput>(
  schema: ZodTypeAny,
  handler: (input: TInput) => Promise<unknown>,
  errorCode: string
): (params: Record<string, unknown>) => Promise<CallToolResult> {
  return async (params: Record<string, unknown>): Promise<CallToolResult> => {
    const validation = validateInput(schema, params);
    if (!validation.success) return validation.error;

    try {
      return formatToolResponse(await handler(validation.data));
    } catch (error: unknown) {
      return formatToolErrorFromUnknown(errorCode, error);
    }
  };
}
