import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmationQueueManager } from "../../src/wallet/confirmation.js";

vi.mock("../../src/wallet/audit.js", () => ({
  appendAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const noopExecutor = async () => ({ content: [{ type: "text" as const, text: "ok" }] });

describe("confirmation queue", () => {
  let queue: ConfirmationQueueManager;

  beforeEach(() => {
    queue = new ConfirmationQueueManager(true);
  });

  it("enqueues operations and returns ID", () => {
    const result = queue.enqueue("swap", "Swap 1 ETH for USDC", { amount: "1" }, noopExecutor);
    expect(result.queued).toBe(true);
    expect(result.id).toBeTruthy();
    expect(result.summary).toContain("swap");
  });

  it("confirms operation and returns params", () => {
    const { id } = queue.enqueue("swap", "Swap 1 ETH", { amount: "1" }, noopExecutor);
    const confirmed = queue.confirm(id as string);
    expect(confirmed).not.toBeNull();
    expect(confirmed?.operation.params.amount).toBe("1");
    expect(confirmed?.stale).toBe(false);
  });

  it("deny removes operation without executing", () => {
    const { id } = queue.enqueue("swap", "Swap", { amount: "1" }, noopExecutor);
    expect(queue.deny(id as string)).toBe(true);
    expect(queue.confirm(id as string)).toBeNull();
  });

  it("disabled queue bypasses enqueue", () => {
    const disabledQueue = new ConfirmationQueueManager(false);
    const result = disabledQueue.enqueue("swap", "Swap", { amount: "1" }, noopExecutor);
    expect(result.queued).toBe(false);
    expect(result.id).toBeNull();
    expect(result.summary).toContain("bypassed");
  });

  it("stale operations warn but still execute", () => {
    const { id } = queue.enqueue("swap", "Swap", { amount: "1" }, noopExecutor);
    const op = queue.list()[0];
    (op as { createdAt: Date }).createdAt = new Date(Date.now() - 31 * 60 * 1000);
    const confirmed = queue.confirm(id as string);
    expect(confirmed?.stale).toBe(true);
    expect(confirmed?.operation.params.amount).toBe("1");
  });

  it("list returns all pending operations", () => {
    queue.enqueue("swap", "Swap A", {}, noopExecutor);
    queue.enqueue("bridge", "Bridge B", {}, noopExecutor);
    expect(queue.list()).toHaveLength(2);
  });

  it("pruneExpired removes stale operations", () => {
    queue.enqueue("swap", "Swap", {}, noopExecutor);
    const ops = queue.list();
    (ops[0] as { createdAt: Date }).createdAt = new Date(Date.now() - 31 * 60 * 1000);
    queue.pruneExpired();
    expect(queue.list()).toHaveLength(0);
  });

  it("confirm returns null for unknown ID", () => {
    expect(queue.confirm("nonexistent")).toBeNull();
  });

  it("deny returns false for unknown ID", () => {
    expect(queue.deny("nonexistent")).toBe(false);
  });

  it("rewrites pending-ops.json when legacy unrestorable entries are dropped on load", async () => {
    const tempHome = await mkdtemp(join(tmpdir(), "web3agent-confirmation-"));
    vi.stubEnv("HOME", tempHome);

    const pendingOpsDir = join(tempHome, ".web3agent");
    const pendingOpsPath = join(pendingOpsDir, "pending-ops.json");
    await mkdir(pendingOpsDir, { recursive: true });
    await writeFile(
      pendingOpsPath,
      JSON.stringify(
        [
          {
            id: "legacy-ccxt-op",
            type: "ccxt_private_write",
            description: "Legacy CCXT write",
            params: {
              account: "binance_main",
              method: "createOrder",
              args: ["BTC/USDT", "limit", "buy", 0.001, 50000],
            },
            createdAt: new Date().toISOString(),
            ttlMs: 30 * 60 * 1000,
            riskLevel: "financial",
          },
        ],
        null,
        2
      )
    );

    const restored = await queue.loadQueue();
    expect(restored).toBe(0);
    expect(queue.list()).toEqual([]);

    await queue.flushPendingPersists();

    const rewritten = JSON.parse(await readFile(pendingOpsPath, "utf-8")) as unknown[];
    expect(rewritten).toEqual([]);

    await rm(tempHome, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("emits EXPIRED audit for TTL-dropped entries when loading persisted queue", async () => {
    const { appendAuditLog: appendAuditLogMock } = await import("../../src/wallet/audit.js");
    const mocked = vi.mocked(appendAuditLogMock);
    mocked.mockClear();

    const tempHome = await mkdtemp(join(tmpdir(), "web3agent-confirmation-"));
    vi.stubEnv("HOME", tempHome);

    try {
      const pendingOpsDir = join(tempHome, ".web3agent");
      const pendingOpsPath = join(pendingOpsDir, "pending-ops.json");
      await mkdir(pendingOpsDir, { recursive: true });
      await writeFile(
        pendingOpsPath,
        JSON.stringify(
          [
            {
              id: "ttl-expired-op",
              type: "swap",
              description: "Stale swap",
              params: { amount: "1" },
              createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
              ttlMs: 30 * 60 * 1000, // 30 min TTL — already expired
              riskLevel: "financial",
            },
          ],
          null,
          2
        )
      );

      await queue.loadQueue();
      await queue.flushPendingPersists();

      const expiredCalls = mocked.mock.calls.filter(
        ([entry]) => entry.action === "EXPIRED" && entry.operationId === "ttl-expired-op"
      );
      expect(expiredCalls).toHaveLength(1);
    } finally {
      await rm(tempHome, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });

  it("flushPendingPersists terminates even when persistQueue fails with a concurrent re-schedule", async () => {
    // Patch persistQueue on the instance prototype to:
    //   1. Trigger a concurrent schedulePersist() (simulating another enqueue() mid-flight),
    //      which sets persistNeeded=true while the chain still has persistScheduled=true.
    //   2. Then throw, landing in the catch arm.
    // Pre-fix: catch only clears persistScheduled, leaving persistNeeded=true on a
    //          resolved chain → infinite loop in flushPendingPersists.
    // Post-fix: catch also clears persistNeeded → loop exits.
    const proto = Object.getPrototypeOf(queue) as {
      persistQueue: () => Promise<void>;
    };
    const originalPersistQueue = proto.persistQueue;
    proto.persistQueue = async function (this: typeof queue) {
      // While persistScheduled=true and the chain is in-flight, fire a second
      // schedulePersist() by calling enqueue(). This sets persistNeeded=true but
      // returns early from schedulePersist() because persistScheduled is still true.
      this.enqueue("bridge", "Concurrent op during persist", {}, noopExecutor);
      throw new Error("injected persist failure");
    };

    try {
      queue.enqueue("swap", "First op", { amount: "1" }, noopExecutor);
      await expect(queue.flushPendingPersists()).resolves.toBeUndefined();
    } finally {
      proto.persistQueue = originalPersistQueue;
    }
  });

  it("flushPendingPersists returns immediately when nothing is pending", async () => {
    await expect(queue.flushPendingPersists()).resolves.toBeUndefined();
  });
});
