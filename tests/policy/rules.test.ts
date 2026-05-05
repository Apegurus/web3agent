import { describe, expect, it } from "vitest";
import {
  evaluateDailyLimit,
  evaluateHourlyLimit,
  evaluateMinReserve,
  evaluateSingleTransactionLimit,
  evaluateX402Limit,
} from "../../src/policy/rules.js";
import type { SpendWindow, TreasuryPolicy } from "../../src/policy/types.js";

const basePolicy: TreasuryPolicy = {
  enabled: true,
  maxSingleTransactionUsd: 100,
  maxHourlyUsd: 500,
  maxDailyUsd: 2000,
  minReserveUsd: 10,
  maxX402PaymentUsd: 5,
};

const emptySpend: SpendWindow = {
  hourlyUsd: 0,
  dailyUsd: 0,
  hourlyCount: 0,
  dailyCount: 0,
};

describe("evaluateSingleTransactionLimit", () => {
  it("returns null when amount is within limit", () => {
    const result = evaluateSingleTransactionLimit(basePolicy, 50, "transfer_token");
    expect(result).toBeNull();
  });

  it("returns null when amount equals the limit exactly", () => {
    const result = evaluateSingleTransactionLimit(basePolicy, 100, "transfer_token");
    expect(result).toBeNull();
  });

  it("returns deny when amount exceeds limit", () => {
    const result = evaluateSingleTransactionLimit(basePolicy, 150, "transfer_token");
    expect(result).not.toBeNull();
    expect(result?.action).toBe("deny");
    expect(result?.reasonCode).toBe("SINGLE_TX_LIMIT");
    expect(result?.message).toContain("transfer_token");
    expect(result?.message).toContain("150.00");
    expect(result?.message).toContain("100.00");
  });

  it("includes tool name in deny message", () => {
    const result = evaluateSingleTransactionLimit(basePolicy, 200, "swap_tokens");
    expect(result?.message).toContain("swap_tokens");
  });
});

describe("evaluateHourlyLimit", () => {
  it("returns null when projected spend is within limit", () => {
    const spend: SpendWindow = { ...emptySpend, hourlyUsd: 100 };
    const result = evaluateHourlyLimit(basePolicy, 50, spend, "transfer_token");
    expect(result).toBeNull();
  });

  it("returns null when projected spend equals the limit exactly", () => {
    const spend: SpendWindow = { ...emptySpend, hourlyUsd: 450 };
    const result = evaluateHourlyLimit(basePolicy, 50, spend, "transfer_token");
    expect(result).toBeNull();
  });

  it("returns deny when projected spend exceeds hourly limit", () => {
    const spend: SpendWindow = { ...emptySpend, hourlyUsd: 480 };
    const result = evaluateHourlyLimit(basePolicy, 50, spend, "transfer_token");
    expect(result).not.toBeNull();
    expect(result?.action).toBe("deny");
    expect(result?.reasonCode).toBe("HOURLY_LIMIT");
    expect(result?.message).toContain("transfer_token");
    expect(result?.message).toContain("530.00");
    expect(result?.message).toContain("500.00");
    expect(result?.message).toContain("480.00");
  });

  it("returns null when spend window is empty and amount is within limit", () => {
    const result = evaluateHourlyLimit(basePolicy, 100, emptySpend, "transfer_token");
    expect(result).toBeNull();
  });
});

describe("evaluateDailyLimit", () => {
  it("returns null when projected spend is within limit", () => {
    const spend: SpendWindow = { ...emptySpend, dailyUsd: 1000 };
    const result = evaluateDailyLimit(basePolicy, 500, spend, "transfer_token");
    expect(result).toBeNull();
  });

  it("returns null when projected spend equals the limit exactly", () => {
    const spend: SpendWindow = { ...emptySpend, dailyUsd: 1950 };
    const result = evaluateDailyLimit(basePolicy, 50, spend, "transfer_token");
    expect(result).toBeNull();
  });

  it("returns deny when projected spend exceeds daily limit", () => {
    const spend: SpendWindow = { ...emptySpend, dailyUsd: 1900 };
    const result = evaluateDailyLimit(basePolicy, 200, spend, "transfer_token");
    expect(result).not.toBeNull();
    expect(result?.action).toBe("deny");
    expect(result?.reasonCode).toBe("DAILY_LIMIT");
    expect(result?.message).toContain("transfer_token");
    expect(result?.message).toContain("2100.00");
    expect(result?.message).toContain("2000.00");
    expect(result?.message).toContain("1900.00");
  });

  it("returns null when spend window is empty and amount is within limit", () => {
    const result = evaluateDailyLimit(basePolicy, 500, emptySpend, "transfer_token");
    expect(result).toBeNull();
  });
});

describe("evaluateX402Limit", () => {
  it("returns null for non-x402 tools regardless of amount", () => {
    const result = evaluateX402Limit(basePolicy, 100, "transfer_token");
    expect(result).toBeNull();
  });

  it("returns null for non-x402 tools even when amount exceeds x402 limit", () => {
    const result = evaluateX402Limit(basePolicy, 50, "swap_tokens");
    expect(result).toBeNull();
  });

  it("returns null for x402 tool when amount is within limit", () => {
    const result = evaluateX402Limit(basePolicy, 3, "x402_pay");
    expect(result).toBeNull();
  });

  it("returns null for x402 tool when amount equals limit exactly", () => {
    const result = evaluateX402Limit(basePolicy, 5, "x402_pay");
    expect(result).toBeNull();
  });

  it("returns deny for x402 tool when amount exceeds limit", () => {
    const result = evaluateX402Limit(basePolicy, 10, "x402_pay");
    expect(result).not.toBeNull();
    expect(result?.action).toBe("deny");
    expect(result?.reasonCode).toBe("X402_LIMIT");
    expect(result?.message).toContain("x402_pay");
    expect(result?.message).toContain("10.00");
    expect(result?.message).toContain("5.00");
  });

  it("only applies to tools starting with x402_", () => {
    const nonX402 = evaluateX402Limit(basePolicy, 10, "pay_x402");
    expect(nonX402).toBeNull();

    const x402 = evaluateX402Limit(basePolicy, 10, "x402_pay");
    expect(x402?.reasonCode).toBe("X402_LIMIT");
  });
});

describe("evaluateMinReserve", () => {
  it("denies when wallet balance is null and minReserveUsd > 0", () => {
    const result = evaluateMinReserve(basePolicy, 50, null, "transfer");
    expect(result).toEqual(
      expect.objectContaining({ action: "deny", reasonCode: "BALANCE_UNKNOWN" })
    );
  });

  it("returns null when projected balance is above reserve", () => {
    const result = evaluateMinReserve(basePolicy, 50, 100, "transfer");
    expect(result).toBeNull();
  });

  it("returns null when projected balance equals reserve exactly", () => {
    const result = evaluateMinReserve(basePolicy, 90, 100, "transfer");
    expect(result).toBeNull();
  });

  it("returns deny when projected balance drops below reserve", () => {
    const result = evaluateMinReserve(basePolicy, 95, 100, "transfer");
    expect(result).not.toBeNull();
    expect(result?.action).toBe("deny");
    expect(result?.reasonCode).toBe("MIN_RESERVE");
    expect(result?.message).toContain("transfer");
    expect(result?.message).toContain("minimum reserve");
  });
});
