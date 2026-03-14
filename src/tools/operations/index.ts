import { zodToJsonSchema } from "zod-to-json-schema";
import { prepareOperation, resumeOperation } from "../../api/operations.js";
import type { ToolDefinition } from "../../tools/register.js";
import { createToolHandler } from "../shared/handler-factory.js";
import { prepareOperationSchema, resumeOperationSchema } from "./schemas.js";

const operationPrepareTool = createToolHandler(
  prepareOperationSchema,
  prepareOperation,
  "OPERATION_PREPARE_ERROR"
);

const operationResumeTool = createToolHandler(
  resumeOperationSchema,
  resumeOperation,
  "OPERATION_RESUME_ERROR"
);

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
      annotations: { destructiveHint: true, openWorldHint: true },
    },
  ];
}
