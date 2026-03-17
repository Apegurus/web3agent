import type { SpendWindow, TreasuryPolicy } from "./types.js";

export interface RemainingBudget {
  hourlyUsd: number;
  dailyUsd: number;
}

export function getRemainingBudget(policy: TreasuryPolicy, spend: SpendWindow): RemainingBudget {
  return {
    hourlyUsd: Math.max(0, policy.maxHourlyUsd - spend.hourlyUsd),
    dailyUsd: Math.max(0, policy.maxDailyUsd - spend.dailyUsd),
  };
}
