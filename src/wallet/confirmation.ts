import { randomUUID } from "node:crypto";
import type { OperationExecutor, PendingOperation } from "../types/wallet.js";
import { type AuditAction, appendAuditLog } from "./audit.js";
import { writePendingOperations } from "./confirmation-persistence.js";
import { restorePendingOperations } from "./confirmation-restore.js";

const DEFAULT_TTL_MS = 30 * 60 * 1000;

const executorRegistry = new Map<string, OperationExecutor>();

export function registerExecutor(type: string, fn: OperationExecutor): void {
  executorRegistry.set(type, fn);
}

export function getExecutor(type: string): OperationExecutor | undefined {
  return executorRegistry.get(type);
}

/**
 * Manages a queue of pending write operations that require explicit confirmation.
 *
 * **Security model: temporal pause, NOT authorization boundary.**
 *
 * This queue creates a deliberate pause between requesting and executing destructive
 * or financial operations. However, the same MCP session that enqueues an operation
 * can also confirm it — there is no caller identity verification.
 *
 * For true human-in-the-loop authorization, configure an out-of-band confirmation
 * channel (e.g., Telegram, email, hardware wallet). The queue alone only guarantees
 * that the operation was explicitly confirmed, not that a human reviewed it.
 *
 * Future: consider session-bound confirmations requiring a different credential.
 */
export class ConfirmationQueueManager {
  private queue: Map<string, PendingOperation> = new Map();
  private persistChain: Promise<void> = Promise.resolve();
  private persistScheduled = false;
  private persistNeeded = false;
  private persistVersion = 0;
  private persistedVersion = 0;
  private failedPersistVersion = 0;
  public enabled: boolean;
  public ttlMs: number;

  constructor(enabled: boolean, ttlMs: number = DEFAULT_TTL_MS) {
    this.enabled = enabled;
    this.ttlMs = ttlMs;
  }

  private schedulePersist(): number {
    const requestedVersion = ++this.persistVersion;
    this.persistNeeded = true;
    if (this.persistScheduled) return requestedVersion;
    this.persistScheduled = true;
    this.persistChain = this.persistChain
      .then(async () => {
        const targetVersion = this.persistVersion;
        this.persistNeeded = false;
        await this.persistQueue();
        this.persistedVersion = targetVersion;
      })
      .then(() => {
        this.persistScheduled = false;
        if (this.persistNeeded) this.schedulePersist();
      })
      .catch((e: unknown) => {
        // Clearing persistNeeded here drops any retry signal that a
        // concurrent schedulePersist() set during the in-flight persist.
        // The in-memory queue still holds the data, so the next mutating
        // call (enqueue/complete/fail/expire/deny) will schedule another
        // persist. We prioritise loop termination in flushPendingPersists
        // over best-effort retry on failure.
        this.persistScheduled = false;
        this.persistNeeded = false;
        this.failedPersistVersion = this.persistVersion;
        process.stderr.write(`[confirmation] Failed to persist queue: ${e}\n`);
      });
    return requestedVersion;
  }

  /**
   * Wait for any scheduled persist to settle. Intended for tests; production
   * code should not depend on this — the queue survives process crashes via
   * atomic writes and `loadQueue()`.
   */
  async flushPendingPersists(): Promise<void> {
    while (this.persistScheduled || this.persistNeeded) {
      await this.persistChain;
    }
  }

  enqueue(
    type: string,
    description: string,
    params: Record<string, unknown>,
    executor: OperationExecutor,
    walletAddress?: string,
    riskLevel?: PendingOperation["riskLevel"]
  ): { queued: boolean; id: string | null; summary: string } {
    if (!this.enabled) {
      return {
        queued: false,
        id: null,
        summary: `Confirmation bypassed: ${description}`,
      };
    }

    const id = randomUUID();
    const operation: PendingOperation = {
      id,
      type,
      description,
      params,
      executor,
      createdAt: new Date(),
      ttlMs: this.ttlMs,
      walletAddress,
      riskLevel,
    };

    this.queue.set(id, operation);
    this.schedulePersist();

    return {
      queued: true,
      id,
      summary: `Queued [${type}]: ${description} — confirm with ID: ${id}`,
    };
  }

  private executing = new Set<string>();

  /**
   * Confirm a pending operation by ID. Does not verify caller identity —
   * this is not an authorization boundary. Any caller with the operation ID can confirm.
   */
  confirm(id: string): { operation: PendingOperation; stale: boolean } | null {
    const operation = this.queue.get(id);
    if (!operation) return null;
    if (this.executing.has(id)) return null;

    this.executing.add(id);

    const elapsed = Date.now() - operation.createdAt.getTime();
    const stale = elapsed > operation.ttlMs;

    return { operation, stale };
  }

  async claimForExecution(
    id: string
  ): Promise<{ operation: PendingOperation; stale: boolean } | null> {
    const confirmed = this.confirm(id);
    if (!confirmed) return null;
    const claimVersion = this.schedulePersist();
    await this.flushPendingPersists();
    if (this.persistedVersion < claimVersion || this.failedPersistVersion >= claimVersion) {
      this.executing.delete(id);
      throw new Error("Failed to persist execution claim");
    }
    return confirmed;
  }

  complete(id: string, metadata?: Readonly<Record<string, unknown>>): void {
    this.executing.delete(id);
    const op = this.queue.get(id);
    this.queue.delete(id);
    this.schedulePersist();
    if (op) this.audit("CONFIRMED", op, metadata);
  }

  async releaseExecuting(id: string): Promise<void> {
    if (!this.executing.delete(id)) return;
    const releaseVersion = this.schedulePersist();
    await this.flushPendingPersists();
    if (this.persistedVersion < releaseVersion || this.failedPersistVersion >= releaseVersion) {
      this.executing.add(id);
      throw new Error("Failed to persist execution claim release");
    }
  }

  fail(id: string): void {
    this.executing.delete(id);
    const op = this.queue.get(id);
    this.queue.delete(id);
    this.schedulePersist();
    if (op) this.audit("EXECUTION_FAILED", op);
  }

  expire(id: string): void {
    this.executing.delete(id);
    const op = this.queue.get(id);
    this.queue.delete(id);
    this.schedulePersist();
    if (op) this.audit("EXPIRED", op);
  }

  deny(id: string): boolean {
    this.executing.delete(id);
    const op = this.queue.get(id);
    const removed = this.queue.delete(id);
    if (removed) {
      this.schedulePersist();
      if (op) this.audit("DENIED", op);
    }
    return removed;
  }

  list(): PendingOperation[] {
    return [...this.queue.values()];
  }

  pruneExpired(): void {
    const now = Date.now();
    const expired: PendingOperation[] = [];
    for (const [id, op] of this.queue) {
      if (now - op.createdAt.getTime() > op.ttlMs) {
        expired.push(op);
        this.queue.delete(id);
      }
    }
    if (expired.length > 0) {
      this.schedulePersist();
      for (const op of expired) {
        this.audit("EXPIRED", op);
      }
    }
  }

  flushAll(): number {
    const count = this.queue.size;
    this.queue.clear();
    this.executing.clear();
    this.schedulePersist();
    return count;
  }

  private audit(
    action: AuditAction,
    op: PendingOperation,
    metadata?: Readonly<Record<string, unknown>>
  ): void {
    appendAuditLog({
      action,
      operationType: op.type,
      operationId: op.id,
      walletAddress: op.walletAddress,
      description: op.description,
      ...(metadata ? { metadata } : {}),
    }).catch((e: unknown) => {
      process.stderr.write(`[confirmation] Failed to write audit log: ${e}\n`);
    });
  }

  private async persistQueue(): Promise<void> {
    await writePendingOperations(this.queue.values(), this.executing);
  }

  async loadQueue(): Promise<number> {
    try {
      const restored = await restorePendingOperations(getExecutor);
      if (!restored) return 0;
      for (const operation of restored.operations) this.queue.set(operation.id, operation);
      if (restored.droppedEntries) this.schedulePersist();

      if (this.queue.size > 0) {
        process.stderr.write(
          `[confirmation] Restored ${this.queue.size} pending operation(s) from disk\n`
        );
      }
      return this.queue.size;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      process.stderr.write(
        `[confirmation] Failed to load persisted queue (starting fresh): ${message}\n`
      );
      return 0;
    }
  }
}

export const confirmationQueue = new ConfirmationQueueManager(true);
