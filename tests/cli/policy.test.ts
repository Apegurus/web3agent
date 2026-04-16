import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  parseEnv: vi.fn(),
  resolvePolicy: vi.fn(),
  savePolicyFile: vi.fn(),
  loadSpendLog: vi.fn(),
  getSpendWindow: vi.fn(),
  getRecentRecords: vi.fn(),
  getRemainingBudget: vi.fn(),
}));

vi.mock("../../src/config/env.js", () => ({
  parseEnv: (...args: unknown[]) => mockState.parseEnv(...args),
}));

vi.mock("../../src/policy/config.js", () => ({
  resolvePolicy: (...args: unknown[]) => mockState.resolvePolicy(...args),
  savePolicyFile: (...args: unknown[]) => mockState.savePolicyFile(...args),
}));

vi.mock("../../src/policy/spend-tracker.js", () => ({
  loadSpendLog: (...args: unknown[]) => mockState.loadSpendLog(...args),
  getSpendWindow: () => mockState.getSpendWindow(),
  getRecentRecords: (...args: unknown[]) => mockState.getRecentRecords(...args),
}));

vi.mock("../../src/policy/budget.js", () => ({
  getRemainingBudget: (...args: unknown[]) => mockState.getRemainingBudget(...args),
}));

describe("runPolicy", () => {
  const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const defaultPolicy = {
    enabled: true,
    maxSingleTransactionUsd: 100,
    maxHourlyUsd: 500,
    maxDailyUsd: 2000,
    minReserveUsd: 10,
    maxX402PaymentUsd: 5,
  };

  const defaultSpend = {
    hourlyUsd: 50,
    dailyUsd: 200,
    hourlyCount: 3,
    dailyCount: 10,
  };

  const defaultRemaining = {
    hourlyUsd: 450,
    dailyUsd: 1800,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockState.parseEnv.mockReturnValue({});
    mockState.resolvePolicy.mockReturnValue(defaultPolicy);
    mockState.loadSpendLog.mockResolvedValue(0);
    mockState.getSpendWindow.mockReturnValue(defaultSpend);
    mockState.getRecentRecords.mockReturnValue([]);
    mockState.getRemainingBudget.mockReturnValue(defaultRemaining);
  });

  it("shows policy with no args", async () => {
    const { runPolicy } = await import("../../src/cli/policy.js");
    await runPolicy([]);

    expect(mockState.parseEnv).toHaveBeenCalled();
    expect(mockState.resolvePolicy).toHaveBeenCalled();
    expect(mockState.loadSpendLog).toHaveBeenCalled();
    expect(mockState.getSpendWindow).toHaveBeenCalled();
    expect(mockState.getRemainingBudget).toHaveBeenCalledWith(defaultPolicy, defaultSpend);

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("Treasury Policy"));
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("yes"));
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("Current Spend"));
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("Remaining Budget"));
  });

  it("shows policy with 'show' subcommand", async () => {
    const { runPolicy } = await import("../../src/cli/policy.js");
    await runPolicy(["show"]);

    expect(mockState.resolvePolicy).toHaveBeenCalled();
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("Treasury Policy"));
  });

  it("displays recent transactions when present", async () => {
    mockState.getRecentRecords.mockReturnValue([
      { timestamp: "2026-03-17T10:00:00Z", toolName: "swap", estimatedUsd: 25 },
    ]);

    const { runPolicy } = await import("../../src/cli/policy.js");
    await runPolicy([]);

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("Recent Transactions"));
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("swap"));
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("$25.00"));
  });

  it("displays 'no' when policy is disabled", async () => {
    mockState.resolvePolicy.mockReturnValue({ ...defaultPolicy, enabled: false });

    const { runPolicy } = await import("../../src/cli/policy.js");
    await runPolicy([]);

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("no"));
  });

  it("sets numeric policy values via 'set' subcommand", async () => {
    mockState.savePolicyFile.mockResolvedValue("/home/user/.web3agent/policy.json");

    const { runPolicy } = await import("../../src/cli/policy.js");
    await runPolicy(["set", "--max-daily", "5000", "--max-hourly", "1000"]);

    expect(mockState.savePolicyFile).toHaveBeenCalledWith({
      maxDailyUsd: 5000,
      maxHourlyUsd: 1000,
    });
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("Policy updated"));
  });

  it("sets --enable flag", async () => {
    mockState.savePolicyFile.mockResolvedValue("/home/user/.web3agent/policy.json");

    const { runPolicy } = await import("../../src/cli/policy.js");
    await runPolicy(["set", "--enable"]);

    expect(mockState.savePolicyFile).toHaveBeenCalledWith({ enabled: true });
  });

  it("sets --disable flag", async () => {
    mockState.savePolicyFile.mockResolvedValue("/home/user/.web3agent/policy.json");

    const { runPolicy } = await import("../../src/cli/policy.js");
    await runPolicy(["set", "--disable"]);

    expect(mockState.savePolicyFile).toHaveBeenCalledWith({ enabled: false });
  });

  it("sets all numeric flags", async () => {
    mockState.savePolicyFile.mockResolvedValue("/home/user/.web3agent/policy.json");

    const { runPolicy } = await import("../../src/cli/policy.js");
    await runPolicy([
      "set",
      "--max-single-tx",
      "50",
      "--max-hourly",
      "250",
      "--max-daily",
      "1000",
      "--min-reserve",
      "20",
      "--max-x402",
      "10",
    ]);

    expect(mockState.savePolicyFile).toHaveBeenCalledWith({
      maxSingleTransactionUsd: 50,
      maxHourlyUsd: 250,
      maxDailyUsd: 1000,
      minReserveUsd: 20,
      maxX402PaymentUsd: 10,
    });
  });

  it("throws when set is called with no flags", async () => {
    const { runPolicy } = await import("../../src/cli/policy.js");
    await expect(runPolicy(["set"])).rejects.toThrow("No policy values specified");
  });

  it("throws when set is called with unknown flag", async () => {
    const { runPolicy } = await import("../../src/cli/policy.js");
    await expect(runPolicy(["set", "--bogus"])).rejects.toThrow("Unknown policy option: --bogus");
  });

  it("throws when numeric flag is missing its value", async () => {
    const { runPolicy } = await import("../../src/cli/policy.js");
    await expect(runPolicy(["set", "--max-daily"])).rejects.toThrow("--max-daily requires a value");
  });

  it("throws when numeric value is negative", async () => {
    const { runPolicy } = await import("../../src/cli/policy.js");
    await expect(runPolicy(["set", "--max-daily", "-100"])).rejects.toThrow(
      "Invalid value for maxDailyUsd"
    );
  });

  it("throws when numeric value is NaN", async () => {
    const { runPolicy } = await import("../../src/cli/policy.js");
    await expect(runPolicy(["set", "--max-daily", "abc"])).rejects.toThrow(
      "Invalid value for maxDailyUsd"
    );
  });

  it("throws when numeric value is Infinity", async () => {
    const { runPolicy } = await import("../../src/cli/policy.js");
    await expect(runPolicy(["set", "--max-daily", "Infinity"])).rejects.toThrow(
      "Invalid value for maxDailyUsd"
    );
  });

  it("prints help for unknown subcommand", async () => {
    const { runPolicy } = await import("../../src/cli/policy.js");
    await runPolicy(["help"]);

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("web3agent policy"));
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("--max-single-tx"));
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("--enable"));
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("--disable"));
  });

  it("prints env var override note after set", async () => {
    mockState.savePolicyFile.mockResolvedValue("/home/user/.web3agent/policy.json");

    const { runPolicy } = await import("../../src/cli/policy.js");
    await runPolicy(["set", "--enable"]);

    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining("env vars (POLICY_*) override policy.json values")
    );
  });
});
