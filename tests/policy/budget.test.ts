import { describe, expect, it } from "vitest";
import { getRemainingBudget } from "../../src/policy/budget.js";
import type { SpendWindow, TreasuryPolicy } from "../../src/policy/types.js";

const POLICY: TreasuryPolicy = {
  enabled: true,
  maxSingleTransactionUsd: 100,
  maxHourlyUsd: 500,
  maxDailyUsd: 2000,
  minReserveUsd: 10,
  maxX402PaymentUsd: 5,
};

describe("getRemainingBudget", () => {
  it("returns full budget when no spend", () => {
    const spend: SpendWindow = { hourlyUsd: 0, dailyUsd: 0, hourlyCount: 0, dailyCount: 0 };
    const result = getRemainingBudget(POLICY, spend);
    expect(result.hourlyUsd).toBe(500);
    expect(result.dailyUsd).toBe(2000);
  });

  it("returns reduced budget after spending", () => {
    const spend: SpendWindow = { hourlyUsd: 200, dailyUsd: 800, hourlyCount: 2, dailyCount: 5 };
    const result = getRemainingBudget(POLICY, spend);
    expect(result.hourlyUsd).toBe(300);
    expect(result.dailyUsd).toBe(1200);
  });

  it("clamps to zero when overspent", () => {
    const spend: SpendWindow = {
      hourlyUsd: 600,
      dailyUsd: 2500,
      hourlyCount: 10,
      dailyCount: 20,
    };
    const result = getRemainingBudget(POLICY, spend);
    expect(result.hourlyUsd).toBe(0);
    expect(result.dailyUsd).toBe(0);
  });

  it("handles exact limit", () => {
    const spend: SpendWindow = {
      hourlyUsd: 500,
      dailyUsd: 2000,
      hourlyCount: 5,
      dailyCount: 10,
    };
    const result = getRemainingBudget(POLICY, spend);
    expect(result.hourlyUsd).toBe(0);
    expect(result.dailyUsd).toBe(0);
  });
});
