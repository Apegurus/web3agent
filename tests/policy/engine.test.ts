import { beforeEach, describe, expect, it } from "vitest";
import { evaluatePolicy } from "../../src/policy/engine.js";
import { recordSpend, resetSpendRecords } from "../../src/policy/spend-tracker.js";
import { DEFAULT_TREASURY_POLICY } from "../../src/policy/types.js";
import type { TreasuryPolicy } from "../../src/policy/types.js";

beforeEach(() => {
  resetSpendRecords();
});

const disabledPolicy: TreasuryPolicy = { ...DEFAULT_TREASURY_POLICY, enabled: false };

describe("evaluatePolicy — policy disabled", () => {
  it("allows any tool when policy is disabled", () => {
    const decision = evaluatePolicy(disabledPolicy, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 99999,
    });
    expect(decision.action).toBe("allow");
    expect(decision.reasonCode).toBe("POLICY_DISABLED");
  });

  it("includes currentSpend and appliedPolicy in decision", () => {
    const decision = evaluatePolicy(disabledPolicy, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 50,
    });
    expect(decision.currentSpend).toBeDefined();
    expect(decision.appliedPolicy).toBe(disabledPolicy);
  });
});

describe("evaluatePolicy — safe tools", () => {
  it("always allows safe tools regardless of amount", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "get_balance",
      riskLevel: "safe",
      estimatedUsd: 99999,
    });
    expect(decision.action).toBe("allow");
    expect(decision.reasonCode).toBe("SAFE_TOOL");
  });

  it("includes tool name and risk level in decision", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "get_balance",
      riskLevel: "safe",
      estimatedUsd: 0,
    });
    expect(decision.toolName).toBe("get_balance");
    expect(decision.riskLevel).toBe("safe");
  });

  it("still allows safe tools when estimatedUsd is null", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "get_balance",
      riskLevel: "safe",
      estimatedUsd: null,
    });
    expect(decision.action).toBe("allow");
    expect(decision.reasonCode).toBe("SAFE_TOOL");
  });
});

describe("evaluatePolicy — gas-only tools", () => {
  it("denies financial tool when estimatedUsd is null", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "approve_token",
      riskLevel: "financial",
      estimatedUsd: null,
      walletBalanceUsd: 1000,
    });
    expect(decision.action).toBe("deny");
    expect(decision.reasonCode).toBe("UNESTIMABLE_FINANCIAL_WRITE");
  });

  it("allows destructive tool when estimatedUsd is null", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "delete_wallet",
      riskLevel: "destructive",
      estimatedUsd: null,
      walletBalanceUsd: 1000,
    });
    expect(decision.action).toBe("allow");
    expect(decision.reasonCode).toBe("GAS_ONLY");
  });
});

describe("evaluatePolicy — financial tool within limits", () => {
  it("allows financial tool when all limits are satisfied", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 50,
      walletBalanceUsd: 1000,
    });
    expect(decision.action).toBe("allow");
    expect(decision.reasonCode).toBe("ALLOWED");
  });

  it("includes currentSpend and appliedPolicy in allow decision", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 50,
      walletBalanceUsd: 1000,
    });
    expect(decision.currentSpend).toBeDefined();
    expect(decision.currentSpend.hourlyUsd).toBeGreaterThanOrEqual(0);
    expect(decision.appliedPolicy).toBe(DEFAULT_TREASURY_POLICY);
  });
});

describe("evaluatePolicy — single transaction limit", () => {
  it("denies financial tool exceeding single tx limit", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 150,
    });
    expect(decision.action).toBe("deny");
    expect(decision.reasonCode).toBe("SINGLE_TX_LIMIT");
  });

  it("includes tool name in deny decision", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 150,
    });
    expect(decision.toolName).toBe("transfer_token");
    expect(decision.message).toContain("transfer_token");
  });
});

describe("evaluatePolicy — hourly limit", () => {
  it("denies financial tool when hourly limit would be exceeded", () => {
    recordSpend("transfer_token", 480);
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 50,
    });
    expect(decision.action).toBe("deny");
    expect(decision.reasonCode).toBe("HOURLY_LIMIT");
  });

  it("reflects current spend in the decision", () => {
    recordSpend("transfer_token", 480);
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 50,
    });
    expect(decision.currentSpend.hourlyUsd).toBe(480);
  });
});

describe("evaluatePolicy — daily limit", () => {
  it("denies financial tool when daily limit would be exceeded", () => {
    const tightDailyPolicy: TreasuryPolicy = {
      ...DEFAULT_TREASURY_POLICY,
      maxHourlyUsd: 99999,
      maxDailyUsd: 200,
    };
    recordSpend("transfer_token", 150);
    const decision = evaluatePolicy(tightDailyPolicy, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 100,
    });
    expect(decision.action).toBe("deny");
    expect(decision.reasonCode).toBe("DAILY_LIMIT");
  });

  it("reflects current daily spend in the decision", () => {
    const tightDailyPolicy: TreasuryPolicy = {
      ...DEFAULT_TREASURY_POLICY,
      maxHourlyUsd: 99999,
      maxDailyUsd: 200,
    };
    recordSpend("transfer_token", 150);
    const decision = evaluatePolicy(tightDailyPolicy, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 100,
    });
    expect(decision.currentSpend.dailyUsd).toBe(150);
  });
});

describe("evaluatePolicy — x402 limit", () => {
  it("denies x402 tool exceeding x402 limit", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "x402_pay",
      riskLevel: "financial",
      estimatedUsd: 10,
    });
    expect(decision.action).toBe("deny");
    expect(decision.reasonCode).toBe("X402_LIMIT");
  });

  it("allows x402 tool within x402 limit", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "x402_pay",
      riskLevel: "financial",
      estimatedUsd: 3,
      walletBalanceUsd: 1000,
    });
    expect(decision.action).toBe("allow");
  });

  it("does not apply x402 limit to non-x402 tools", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 10,
    });
    expect(decision.reasonCode).not.toBe("X402_LIMIT");
  });
});

describe("evaluatePolicy — decision shape", () => {
  it("always includes all required fields", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 50,
    });
    expect(decision).toHaveProperty("action");
    expect(decision).toHaveProperty("reasonCode");
    expect(decision).toHaveProperty("message");
    expect(decision).toHaveProperty("riskLevel");
    expect(decision).toHaveProperty("toolName");
    expect(decision).toHaveProperty("currentSpend");
    expect(decision).toHaveProperty("appliedPolicy");
  });

  it("currentSpend has all window fields", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 50,
    });
    expect(decision.currentSpend).toHaveProperty("hourlyUsd");
    expect(decision.currentSpend).toHaveProperty("dailyUsd");
    expect(decision.currentSpend).toHaveProperty("hourlyCount");
    expect(decision.currentSpend).toHaveProperty("dailyCount");
  });
});

describe("evaluatePolicy — min reserve", () => {
  it("denies when wallet balance would drop below reserve", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 95,
      walletBalanceUsd: 100,
    });
    expect(decision.action).toBe("deny");
    expect(decision.reasonCode).toBe("MIN_RESERVE");
  });

  it("denies when wallet balance is unknown and minReserveUsd > 0", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 50,
      walletBalanceUsd: null,
    });
    expect(decision.action).toBe("deny");
    expect(decision.reasonCode).toBe("BALANCE_UNKNOWN");
  });

  it("allows when projected balance stays above reserve", () => {
    const decision = evaluatePolicy(DEFAULT_TREASURY_POLICY, {
      toolName: "transfer_token",
      riskLevel: "financial",
      estimatedUsd: 50,
      walletBalanceUsd: 100,
    });
    expect(decision.action).toBe("allow");
  });
});
