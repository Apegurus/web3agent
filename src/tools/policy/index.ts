import { getConfig } from "../../config/env.js";
import { getRemainingBudget } from "../../policy/budget.js";
import { resolvePolicy } from "../../policy/config.js";
import { getRecentRecords, getSpendWindow } from "../../policy/spend-tracker.js";
import { formatToolResponse } from "../../utils/errors.js";
import type { ToolDefinition } from "../register.js";

export function getPolicyToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "policy_get",
      category: "status",
      description:
        "Get current treasury policy limits and spend totals. Shows per-transaction, hourly, and daily caps plus how much budget remains. Read-only — policy limits are set by the user, not the agent.",
      inputSchema: {
        type: "object",
        properties: {
          includeRecentSpends: {
            type: "boolean",
            description: "Include list of recent spend records (default false)",
          },
        },
      },
      handler: async (params) => {
        const config = getConfig();
        const policy = resolvePolicy(config);
        const spend = getSpendWindow();
        const recentSpends = params.includeRecentSpends === true ? getRecentRecords(10) : undefined;

        return formatToolResponse({
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
        });
      },
      annotations: { readOnlyHint: true },
    },
  ];
}
