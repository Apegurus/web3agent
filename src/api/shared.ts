import { type ZodType, z } from "zod";
import { getDefaultRuntime } from "../runtime/default.js";
import { getToolResultPayload } from "../utils/tool-results.js";
import { Web3AgentError } from "./errors.js";
import type { RuntimeBoundOptions, Web3AgentRuntime } from "./types.js";

export async function getRuntime(options?: RuntimeBoundOptions): Promise<Web3AgentRuntime> {
  if (options?.runtime) {
    return options.runtime;
  }
  return getDefaultRuntime();
}

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      throw new Web3AgentError({
        code: "INVALID_PARAMS",
        message: error.errors.map((issue) => issue.message).join("; "),
        details: error.errors,
        cause: error,
      });
    }
    throw Web3AgentError.fromUnknown("INVALID_PARAMS", error);
  }
}

export async function invokeAndRequireData<T>(
  runtime: Web3AgentRuntime,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const result = await runtime.invokeTool(toolName, args);
  const payload = getToolResultPayload(result);
  if (!payload.ok) {
    throw new Web3AgentError({
      code: payload.error.code ?? "TOOL_ERROR",
      message: payload.error.message ?? `Tool invocation failed: ${toolName}`,
      details: payload.error.details,
    });
  }
  return payload.data as T;
}
