import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getToolResultPayload } from "../utils/tool-results.js";

const provenanceKeys = [
  "provider",
  "adapterSource",
  "capabilityDecisionId",
  "capabilityReason",
  "fallbackReason",
  "stage",
  "status",
  "txHash",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getExecutionAuditMetadata(
  result: CallToolResult
): Readonly<Record<string, unknown>> | undefined {
  const payload = getToolResultPayload(result);
  const data = payload.ok ? payload.data : undefined;
  if (!isRecord(data)) return undefined;
  const metadata = Object.fromEntries(
    provenanceKeys.flatMap((key) => (typeof data[key] === "string" ? [[key, data[key]]] : []))
  );
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}
