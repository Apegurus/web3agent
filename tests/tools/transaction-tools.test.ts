import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQueue = vi.hoisted(() => {
  const queue = {
    enabled: true,
    confirm: vi.fn(),
    complete: vi.fn(),
    deny: vi.fn(),
    list: vi.fn(),
    pruneExpired: vi.fn(),
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

vi.mock("../../src/wallet/persistence.js", () => mockPersistence);

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: mockQueue.queue,
  ConfirmationQueueManager: vi.fn(),
}));

vi.mock("../../src/api/simulation.js", () => ({
  simulateTransaction: (...args: unknown[]) => simulationMocks.simulateTransaction(...args),
}));

describe("transaction_confirm tool handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing id param", async () => {
    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.error).toBe("INVALID_PARAMS");
  });

  it("returns NOT_FOUND for unknown operation ID", async () => {
    mockQueue.queue.confirm.mockReturnValueOnce(null);

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "nonexistent-uuid" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.error).toBe("NOT_FOUND");
  });

  it("confirms a queued operation and executes it", async () => {
    const executorResult = {
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ confirmed: true, txHash: "0xabc" }) }],
    };
    mockQueue.queue.confirm.mockReturnValueOnce({
      operation: {
        id: "op-1",
        type: "swap",
        description: "Swap 1 ETH for USDC",
        params: { amount: "1" },
        createdAt: new Date(),
        ttlMs: 30 * 60 * 1000,
        executor: vi.fn().mockResolvedValue(executorResult),
      },
      stale: false,
    });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "op-1" });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.confirmed).toBe(true);
    expect(payload.txHash).toBe("0xabc");
  });

  it("returns OPERATION_EXPIRED error when operation exceeds TTL", async () => {
    mockQueue.queue.confirm.mockReturnValueOnce({
      operation: {
        id: "op-2",
        type: "bridge",
        description: "Bridge ETH",
        params: {},
        createdAt: new Date(Date.now() - 31 * 60 * 1000),
        ttlMs: 30 * 60 * 1000,
        executor: vi.fn(),
      },
      stale: true,
    });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "op-2" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.error).toBe("OPERATION_EXPIRED");
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
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.error).toBe("INVALID_PARAMS");
  });

  it("returns NOT_FOUND for unknown operation ID", async () => {
    mockQueue.queue.deny.mockReturnValueOnce(false);

    const { transactionDeny } = await import("../../src/tools/wallet/index.js");
    const result = await transactionDeny({ id: "nonexistent-uuid" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.error).toBe("NOT_FOUND");
  });

  it("denies a queued operation", async () => {
    mockQueue.queue.deny.mockReturnValueOnce(true);

    const { transactionDeny } = await import("../../src/tools/wallet/index.js");
    const result = await transactionDeny({ id: "op-1" });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text as string);
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
    const payload = JSON.parse(result.content[0].text as string);
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
    const payload = JSON.parse(result.content[0].text as string);
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
    const payload = JSON.parse(result.content[0].text as string);
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
    const payload = JSON.parse(result.content[0].text as string);
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
