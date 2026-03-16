import { zodToJsonSchema } from "zod-to-json-schema";
import { getConfig } from "../../config/env.js";
import { getRemainingBudget } from "../../policy/budget.js";
import { resolvePolicy } from "../../policy/config.js";
import { getRecentRecords, getSpendWindow } from "../../policy/spend-tracker.js";
import type { ToolDefinition } from "../register.js";
import { createToolHandler } from "../shared/handler-factory.js";
import { policyGetSchema } from "./schemas.js";

const policyGetHandler = createToolHandler(
  policyGetSchema,
  async (input: { includeRecentSpends?: boolean }) => {
    const config = getConfig();
    const policy = resolvePolicy(config);
    const spend = getSpendWindow();
    const recentSpends = input.includeRecentSpends === true ? getRecentRecords(10) : undefined;

    return {
      policy: {
        enabled: policy.enabled,
        maxSingleTransactionUsd: policy.maxSingleTransactionUsd,
        maxHourlyUsd: policy.maxHourlyUsd,
        maxDailyUsd: policy.maxDailyUsd,
        minReserveUsd: policy.minReserveUsd,
        maxX402PaymentUsd: policy.maxX402PaymentUsd,
      },
      currentSpend: spend,
      remainingBudget: getRemainingBudget(policy, spend),
      ...(recentSpends ? { recentSpends } : {}),
    };
  },
  "POLICY_GET_ERROR"
);

export function getPolicyToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "policy_get",
      category: "status",
      description:
        "Get current treasury policy limits and spend totals. Shows per-transaction, hourly, and daily caps plus how much budget remains. Read-only — policy limits are set by the user, not the agent.",
      inputSchema: zodToJsonSchema(policyGetSchema) as Record<string, unknown>,
      handler: policyGetHandler,
      annotations: { readOnlyHint: true },
    },
  ];
}
