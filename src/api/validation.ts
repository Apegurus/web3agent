import { type ZodType, z } from "zod";
import { Web3AgentError } from "./errors.js";

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
