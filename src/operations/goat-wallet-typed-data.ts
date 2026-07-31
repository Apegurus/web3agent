import { Web3AgentError } from "../api/errors.js";
import type { PreparedSignTypedDataAction } from "../api/types.js";

export type EVMTypedData = {
  readonly domain: Record<string, unknown>;
  readonly types: Record<string, unknown>;
  readonly primaryType: string;
  readonly message: Record<string, unknown>;
};

export function normalizeTypedDataTypes(
  types: Record<string, unknown>
): PreparedSignTypedDataAction["eip712"]["types"] {
  const normalized: PreparedSignTypedDataAction["eip712"]["types"] = {};

  for (const [typeName, entries] of Object.entries(types)) {
    if (!Array.isArray(entries)) {
      throw new Web3AgentError({
        code: "GOAT_TOOL_ERROR",
        message: `Typed data type ${typeName} must be an array`,
      });
    }

    normalized[typeName] = entries.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new Web3AgentError({
          code: "GOAT_TOOL_ERROR",
          message: `Typed data entry ${typeName}[${index}] must be an object`,
        });
      }

      const name = (entry as { name?: unknown }).name;
      const type = (entry as { type?: unknown }).type;
      if (typeof name !== "string" || typeof type !== "string") {
        throw new Web3AgentError({
          code: "GOAT_TOOL_ERROR",
          message: `Typed data entry ${typeName}[${index}] must include string name/type`,
        });
      }

      return { name, type };
    });
  }

  return normalized;
}
