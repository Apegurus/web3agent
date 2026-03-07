import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQueue = vi.hoisted(() => {
  const queue = {
    enabled: true,
    confirm: vi.fn(),
    deny: vi.fn(),
    list: vi.fn(),
    pruneExpired: vi.fn(),
    enqueue: vi.fn(),
  };
  return { queue };
});

vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: vi.fn().mockReturnValue({ mode: "read-only", chainId: 1 }),
  getActiveAccount: vi.fn().mockReturnValue({ address: "0x0" }),
  activateWallet: vi.fn(),
  deactivateWallet: vi.fn(),
}));

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: mockQueue.queue,
  ConfirmationQueueManager: vi.fn(),
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

  it("confirms a queued operation and returns details", async () => {
    mockQueue.queue.confirm.mockReturnValueOnce({
      operation: {
        id: "op-1",
        type: "swap",
        description: "Swap 1 ETH for USDC",
        params: { amount: "1" },
        createdAt: new Date(),
        ttlMs: 30 * 60 * 1000,
      },
      stale: false,
    });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "op-1" });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.confirmed).toBe(true);
    expect(payload.stale).toBe(false);
    expect(payload.operation.type).toBe("swap");
    expect(payload.operation.params.amount).toBe("1");
  });

  it("includes stale warning when operation exceeds TTL", async () => {
    mockQueue.queue.confirm.mockReturnValueOnce({
      operation: {
        id: "op-2",
        type: "bridge",
        description: "Bridge ETH",
        params: {},
        createdAt: new Date(Date.now() - 31 * 60 * 1000),
        ttlMs: 30 * 60 * 1000,
      },
      stale: true,
    });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "op-2" });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.stale).toBe(true);
    expect(payload.warning).toBeDefined();
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
