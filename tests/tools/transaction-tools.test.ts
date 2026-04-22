import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQueue = vi.hoisted(() => {
  const queue = {
    enabled: true,
    confirm: vi.fn(),
    complete: vi.fn(),
    expire: vi.fn(),
    fail: vi.fn(),
    deny: vi.fn(),
    list: vi.fn(),
    pruneExpired: vi.fn(),
    releaseExecuting: vi.fn(),
    enqueue: vi.fn(),
  };
  return { queue };
});

const mockPersistence = vi.hoisted(() => ({
  getWalletState: vi.fn().mockReturnValue({ mode: "private-key", chainId: 1, address: "0x0" }),
  getActiveAccount: vi.fn().mockReturnValue({ address: "0x0" }),
  activateWallet: vi.fn(),
  deactivateWallet: vi.fn(),
}));

const simulationMocks = vi.hoisted(() => ({
  simulateTransaction: vi.fn(),
}));

const policyMocks = vi.hoisted(() => ({
  evaluatePolicy: vi.fn().mockReturnValue({ action: "allow", reasonCode: "ALLOWED" }),
  extractEstimatedUsd: vi.fn().mockResolvedValue(null),
  recordSpend: vi.fn(),
}));

const balanceCacheMocks = vi.hoisted(() => ({
  getCachedBalanceUsd: vi.fn().mockReturnValue(null),
  refreshBalanceUsd: vi.fn().mockResolvedValue(null),
}));

function mockPendingOperation(
  operation: Record<string, unknown>,
  options?: { confirmable?: boolean }
) {
  mockQueue.queue.list.mockReturnValueOnce([operation]);
  if (options?.confirmable === false) return;
  mockQueue.queue.confirm.mockReturnValueOnce({
    operation,
    stale: false,
  });
}

vi.mock("../../src/wallet/persistence.js", () => mockPersistence);

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: mockQueue.queue,
  ConfirmationQueueManager: vi.fn(),
}));

vi.mock("../../src/api/simulation.js", () => ({
  simulateTransaction: (...args: unknown[]) => simulationMocks.simulateTransaction(...args),
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: vi.fn().mockReturnValue({ chainId: 1 }),
}));

vi.mock("../../src/policy/config.js", () => ({
  resolvePolicy: vi.fn().mockReturnValue({
    enabled: true,
    maxSingleTransactionUsd: 100,
    maxHourlyUsd: 500,
    maxDailyUsd: 2000,
    minReserveUsd: 10,
    maxX402PaymentUsd: 5,
  }),
}));

vi.mock("../../src/policy/engine.js", () => ({
  evaluatePolicy: (...args: unknown[]) => policyMocks.evaluatePolicy(...args),
}));

vi.mock("../../src/policy/extract-usd.js", () => ({
  extractEstimatedUsd: (...args: unknown[]) => policyMocks.extractEstimatedUsd(...args),
}));

vi.mock("../../src/policy/spend-tracker.js", () => ({
  recordSpend: (...args: unknown[]) => policyMocks.recordSpend(...args),
  reserveSpend: vi.fn().mockReturnValue(0),
  commitReservation: vi.fn(),
  releaseReservation: vi.fn(),
}));

vi.mock("../../src/policy/balance-cache.js", () => ({
  getCachedBalanceUsd: (...args: unknown[]) => balanceCacheMocks.getCachedBalanceUsd(...args),
  refreshBalanceUsd: (...args: unknown[]) => balanceCacheMocks.refreshBalanceUsd(...args),
}));

function parseFirstTextJson(result: { content: Array<{ type: string; text?: string }> }) {
  const first = result.content[0];
  expect(first?.type).toBe("text");
  if (!first || first.type !== "text" || typeof first.text !== "string") {
    throw new Error("Expected first content item to be text");
  }
  return JSON.parse(first.text);
}

describe("transaction_confirm tool handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    policyMocks.evaluatePolicy.mockReturnValue({ action: "allow", reasonCode: "ALLOWED" });
    policyMocks.extractEstimatedUsd.mockResolvedValue(null);
    balanceCacheMocks.getCachedBalanceUsd.mockReturnValue(null);
    balanceCacheMocks.refreshBalanceUsd.mockResolvedValue(null);
  });

  it("rejects missing id param", async () => {
    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({});

    expect(result.isError).toBe(true);
    const payload = parseFirstTextJson(result);
    expect(payload.error).toBe("INVALID_PARAMS");
  });

  it("returns NOT_FOUND for unknown operation ID", async () => {
    mockQueue.queue.list.mockReturnValueOnce([]);

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "nonexistent-uuid" });

    expect(result.isError).toBe(true);
    const payload = parseFirstTextJson(result);
    expect(payload.error).toBe("NOT_FOUND");
  });

  it("confirms a queued operation and executes it", async () => {
    const executorResult = {
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ confirmed: true, txHash: "0xabc" }) }],
    };
    mockPendingOperation({
      id: "op-1",
      type: "swap",
      description: "Swap 1 ETH for USDC",
      params: { amount: "1" },
      createdAt: new Date(),
      ttlMs: 30 * 60 * 1000,
      walletAddress: "0x0",
      executor: vi.fn().mockResolvedValue(executorResult),
    });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "op-1" });

    expect(result.isError).toBe(false);
    const payload = parseFirstTextJson(result);
    expect(payload.confirmed).toBe(true);
    expect(payload.txHash).toBe("0xabc");
  });

  it("returns OPERATION_EXPIRED error when operation exceeds TTL", async () => {
    mockQueue.queue.list.mockReturnValueOnce([
      {
        id: "op-2",
        type: "bridge",
        description: "Bridge ETH",
        params: {},
        createdAt: new Date(Date.now() - 31 * 60 * 1000),
        ttlMs: 30 * 60 * 1000,
        executor: vi.fn(),
      },
    ]);

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "op-2" });

    expect(result.isError).toBe(true);
    const payload = parseFirstTextJson(result);
    expect(payload.error).toBe("OPERATION_EXPIRED");
  });

  it("denies financial operations when USD estimation fails at confirm time", async () => {
    policyMocks.extractEstimatedUsd.mockResolvedValueOnce(0);
    policyMocks.evaluatePolicy.mockReturnValueOnce({
      action: "deny",
      reasonCode: "USD_ESTIMATION_FAILED",
      message: "swap: USD estimation failed",
      riskLevel: "financial",
      toolName: "swap",
      currentSpend: { hourlyUsd: 0, dailyUsd: 0, hourlyCount: 0, dailyCount: 0 },
      appliedPolicy: {},
    });
    const executor = vi.fn().mockResolvedValue({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ confirmed: true }) }],
    });
    mockPendingOperation(
      {
        id: "op-price-fail",
        type: "swap",
        description: "Swap with unavailable price feed",
        params: { fromToken: "0xabc", fromAmount: "1000" },
        createdAt: new Date(),
        ttlMs: 30 * 60 * 1000,
        riskLevel: "financial",
        walletAddress: "0x0",
        executor,
      },
      { confirmable: false }
    );

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "op-price-fail" });

    expect(result.isError).toBe(true);
    const payload = parseFirstTextJson(result);
    expect(payload.error).toBe("POLICY_DENIED");
    expect(executor).not.toHaveBeenCalled();
  });

  it("allows gas-only financial operations to continue when no USD estimate is available", async () => {
    policyMocks.extractEstimatedUsd.mockResolvedValueOnce(null);
    const executorResult = {
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ confirmed: true, txHash: "0xabc" }) }],
    };
    const executor = vi.fn().mockResolvedValue(executorResult);
    mockPendingOperation({
      id: "op-gas-only",
      type: "orbs_cancel_order",
      description: "Cancel a pending order",
      params: { chainId: 1, digest: "0x123" },
      createdAt: new Date(),
      ttlMs: 30 * 60 * 1000,
      riskLevel: "financial",
      walletAddress: "0x0",
      executor,
    });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "op-gas-only" });

    expect(result.isError).toBe(false);
    expect(executor).toHaveBeenCalledOnce();
    expect(policyMocks.evaluatePolicy).toHaveBeenCalledOnce();
  });

  it("refreshes wallet balance for the operation chain before confirm-time policy evaluation", async () => {
    policyMocks.extractEstimatedUsd.mockResolvedValueOnce(50);
    balanceCacheMocks.getCachedBalanceUsd.mockReturnValueOnce(null);
    balanceCacheMocks.refreshBalanceUsd.mockResolvedValueOnce(125);
    const executor = vi.fn().mockResolvedValue({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ confirmed: true }) }],
    });
    mockPendingOperation({
      id: "op-refresh-balance",
      type: "swap",
      description: "Swap on a non-default chain",
      params: { chainId: 8453, fromToken: "0xabc", fromAmount: "1000" },
      createdAt: new Date(),
      ttlMs: 30 * 60 * 1000,
      riskLevel: "financial",
      walletAddress: "0x0",
      executor,
    });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "op-refresh-balance" });

    expect(result.isError).toBe(false);
    expect(balanceCacheMocks.refreshBalanceUsd).toHaveBeenCalledWith("0x0", 8453);
    expect(policyMocks.evaluatePolicy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        estimatedUsd: 50,
        walletBalanceUsd: 125,
      })
    );
  });

  it("allows non-wallet CCXT operations when wallet mode is read-only", async () => {
    mockPersistence.getWalletState.mockReturnValue({ mode: "read-only", chainId: 1 });
    policyMocks.extractEstimatedUsd.mockResolvedValueOnce(50);
    const executor = vi.fn().mockResolvedValue({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ confirmed: true, id: "order-1" }) }],
    });
    mockPendingOperation({
      id: "op-ccxt-read-only",
      type: "ccxt_private_write",
      description: "Create CCXT order",
      params: { method: "createOrder", args: ["BTC/USDT", "limit", "buy", 1, 50000] },
      createdAt: new Date(),
      ttlMs: 30 * 60 * 1000,
      riskLevel: "financial",
      executor,
    });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "op-ccxt-read-only" });

    expect(result.isError).toBe(false);
    expect(executor).toHaveBeenCalledOnce();
    expect(balanceCacheMocks.refreshBalanceUsd).not.toHaveBeenCalled();
    expect(policyMocks.evaluatePolicy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        estimatedUsd: 50,
        walletBalanceUsd: null,
        requiresWalletBalance: false,
      })
    );
  });

  it("still rejects wallet-backed operations when wallet mode is read-only", async () => {
    mockPersistence.getWalletState.mockReturnValue({ mode: "read-only", chainId: 1 });
    mockQueue.queue.list.mockReturnValueOnce([
      {
        id: "op-wallet-read-only",
        type: "swap",
        description: "Wallet-backed swap",
        params: { fromToken: "0xabc", fromAmount: "1000" },
        createdAt: new Date(),
        ttlMs: 30 * 60 * 1000,
        riskLevel: "financial",
        walletAddress: "0x1234",
        executor: vi.fn(),
      },
    ]);

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "op-wallet-read-only" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.error).toBe("WALLET_READ_ONLY");
  });

  it("still denies non-wallet CCXT operations when USD estimation fails in read-only mode", async () => {
    mockPersistence.getWalletState.mockReturnValue({ mode: "read-only", chainId: 1 });
    policyMocks.extractEstimatedUsd.mockResolvedValueOnce(0);
    policyMocks.evaluatePolicy.mockReturnValueOnce({
      action: "deny",
      reasonCode: "USD_ESTIMATION_FAILED",
      message: "ccxt_private_write: USD estimation failed",
      riskLevel: "financial",
      toolName: "ccxt_private_write",
      currentSpend: { hourlyUsd: 0, dailyUsd: 0, hourlyCount: 0, dailyCount: 0 },
      appliedPolicy: {},
    });
    const executor = vi.fn().mockResolvedValue({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ confirmed: true }) }],
    });
    mockPendingOperation(
      {
        id: "op-ccxt-price-fail",
        type: "ccxt_private_write",
        description: "Create CCXT order with unknown USD quote",
        params: { method: "createOrder", args: ["ETH/BTC", "limit", "buy", 1, 0.05] },
        createdAt: new Date(),
        ttlMs: 30 * 60 * 1000,
        riskLevel: "financial",
        executor,
      },
      { confirmable: false }
    );

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "op-ccxt-price-fail" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.error).toBe("POLICY_DENIED");
    expect(executor).not.toHaveBeenCalled();
    expect(policyMocks.evaluatePolicy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        estimatedUsd: 0,
        requiresWalletBalance: false,
      })
    );
  });
});

describe("transaction_deny tool handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing id param", async () => {
    const { transactionDeny } = await import("../../src/tools/wallet/index.js");
    const result = await transactionDeny({});

    expect(result.isError).toBe(true);
    const payload = parseFirstTextJson(result);
    expect(payload.error).toBe("INVALID_PARAMS");
  });

  it("returns NOT_FOUND for unknown operation ID", async () => {
    mockQueue.queue.deny.mockReturnValueOnce(false);

    const { transactionDeny } = await import("../../src/tools/wallet/index.js");
    const result = await transactionDeny({ id: "nonexistent-uuid" });

    expect(result.isError).toBe(true);
    const payload = parseFirstTextJson(result);
    expect(payload.error).toBe("NOT_FOUND");
  });

  it("denies a queued operation", async () => {
    mockQueue.queue.deny.mockReturnValueOnce(true);

    const { transactionDeny } = await import("../../src/tools/wallet/index.js");
    const result = await transactionDeny({ id: "op-1" });

    expect(result.isError).toBe(false);
    const payload = parseFirstTextJson(result);
    expect(payload.denied).toBe(true);
    expect(mockQueue.queue.deny).toHaveBeenCalledWith("op-1");
  });
});

describe("transaction_list tool handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty list when no operations pending", async () => {
    mockQueue.queue.list.mockReturnValueOnce([]);

    const { transactionList } = await import("../../src/tools/wallet/index.js");
    const result = await transactionList();

    expect(result.isError).toBe(false);
    const payload = parseFirstTextJson(result);
    expect(payload.count).toBe(0);
    expect(payload.operations).toHaveLength(0);
    expect(mockQueue.queue.pruneExpired).toHaveBeenCalled();
  });

  it("lists pending operations with metadata", async () => {
    const now = new Date();
    mockQueue.queue.list.mockReturnValueOnce([
      { id: "a", type: "swap", description: "Swap A", createdAt: now, ttlMs: 30 * 60 * 1000 },
      { id: "b", type: "bridge", description: "Bridge B", createdAt: now, ttlMs: 30 * 60 * 1000 },
    ]);

    const { transactionList } = await import("../../src/tools/wallet/index.js");
    const result = await transactionList();

    expect(result.isError).toBe(false);
    const payload = parseFirstTextJson(result);
    expect(payload.count).toBe(2);
    expect(payload.operations[0].type).toBe("swap");
    expect(payload.operations[1].type).toBe("bridge");
    expect(payload.operations[0].expiresIn).toBeGreaterThan(0);
  });
});

describe("transaction_simulate tool handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing required params", async () => {
    const { transactionSimulate } = await import("../../src/tools/wallet/index.js");
    const result = await transactionSimulate({ chainId: 8453 });

    expect(result.isError).toBe(true);
    const payload = parseFirstTextJson(result);
    expect(payload.error).toBe("INVALID_PARAMS");
  });

  it("returns simulation data from the shared API", async () => {
    simulationMocks.simulateTransaction.mockResolvedValueOnce({
      success: true,
      gasEstimate: "145000",
      balanceChanges: [],
    });

    const { transactionSimulate } = await import("../../src/tools/wallet/index.js");
    const result = await transactionSimulate({
      chainId: 8453,
      from: "0x1234567890123456789012345678901234567890",
      to: "0x4200000000000000000000000000000000000006",
      data: "0xdeadbeef",
    });

    expect(result.isError).toBe(false);
    const payload = parseFirstTextJson(result);
    expect(payload.success).toBe(true);
    expect(payload.gasEstimate).toBe("145000");
    expect(simulationMocks.simulateTransaction).toHaveBeenCalledWith({
      chainId: 8453,
      from: "0x1234567890123456789012345678901234567890",
      to: "0x4200000000000000000000000000000000000006",
      data: "0xdeadbeef",
    });
  });
});
