import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { prepareOperation, resumeOperation } from "../../api/operations.js";
import type { ToolDefinition } from "../../tools/register.js";
import { formatToolErrorFromUnknown, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { prepareOperationSchema, resumeOperationSchema } from "./schemas.js";

async function operationPrepareTool(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(prepareOperationSchema, params);
  if (!v.success) return v.error;

  try {
    return formatToolResponse(await prepareOperation(v.data));
  } catch (error: unknown) {
    return formatToolErrorFromUnknown("OPERATION_PREPARE_ERROR", error);
  }
}

async function operationResumeTool(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(resumeOperationSchema, params);
  if (!v.success) return v.error;

  try {
    return formatToolResponse(await resumeOperation(v.data));
  } catch (error: unknown) {
    return formatToolErrorFromUnknown("OPERATION_RESUME_ERROR", error);
  }
}

export function getOperationToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "operation_prepare",
      category: "operation",
      description:
        "Prepare an external-wallet operation for Orbs, LI.FI, or GOAT. Returns the next actions plus opaque resume state.",
      inputSchema: zodToJsonSchema(prepareOperationSchema) as Record<string, unknown>,
      handler: operationPrepareTool,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "operation_resume",
      category: "operation",
      description:
        "Resume a previously prepared external-wallet operation after signatures or transactions complete externally.",
      inputSchema: zodToJsonSchema(resumeOperationSchema) as Record<string, unknown>,
      handler: operationResumeTool,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}
