import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OperationExecutor, PendingOperation } from "../types/wallet.js";
import { atomicWriteJson } from "../utils/atomic-write.js";
import { type AuditAction, appendAuditLog } from "./audit.js";

const DEFAULT_TTL_MS = 30 * 60 * 1000;

interface SerializedPendingOperation {
  id: string;
  type: string;
  description: string;
  params: Record<string, unknown>;
  createdAt: string;
  ttlMs: number;
  walletAddress?: string;
}

const executorRegistry = new Map<string, OperationExecutor>();

export function registerExecutor(type: string, fn: OperationExecutor): void {
  executorRegistry.set(type, fn);
}

export function getExecutor(type: string): OperationExecutor | undefined {
  return executorRegistry.get(type);
}

function getPendingOpsPath(): string {
  return join(homedir(), ".web3agent", "pending-ops.json");
}

export class ConfirmationQueueManager {
  private queue: Map<string, PendingOperation> = new Map();
  private persistChain: Promise<void> = Promise.resolve();
  public enabled: boolean;
  public ttlMs: number;

  constructor(enabled: boolean, ttlMs: number = DEFAULT_TTL_MS) {
    this.enabled = enabled;
    this.ttlMs = ttlMs;
  }

  private schedulePersist(): void {
    this.persistChain = this.persistChain
      .catch((e: unknown) => {
        process.stderr.write(`[confirmation] Prior persist failed: ${e}\n`);
      })
      .then(() => this.persistQueue())
      .catch((e: unknown) => {
        process.stderr.write(`[confirmation] Failed to persist queue: ${e}\n`);
      });
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

  confirm(id: string): { operation: PendingOperation; stale: boolean } | null {
    const operation = this.queue.get(id);
    if (!operation) return null;

    const elapsed = Date.now() - operation.createdAt.getTime();
    const stale = elapsed > operation.ttlMs;

    // Remove from queue only after caller has the reference.
    // Caller must call complete(id) after successful execution.
    return { operation, stale };
  }

  complete(id: string): void {
    const op = this.queue.get(id);
    this.queue.delete(id);
    this.schedulePersist();
    if (op) this.audit("CONFIRMED", op);
  }

  deny(id: string): boolean {
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
    this.schedulePersist();
    return count;
  }

  private audit(action: AuditAction, op: PendingOperation): void {
    appendAuditLog({
      action,
      operationType: op.type,
      operationId: op.id,
      walletAddress: op.walletAddress,
      description: op.description,
    }).catch((e: unknown) => {
      process.stderr.write(`[confirmation] Failed to write audit log: ${e}\n`);
    });
  }

  private async persistQueue(): Promise<void> {
    const ops: SerializedPendingOperation[] = [...this.queue.values()].map((op) => ({
      id: op.id,
      type: op.type,
      description: op.description,
      params: op.params,
      createdAt: op.createdAt.toISOString(),
      ttlMs: op.ttlMs,
      walletAddress: op.walletAddress,
    }));

    await atomicWriteJson(getPendingOpsPath(), ops);
  }

  async loadQueue(): Promise<number> {
    const filePath = getPendingOpsPath();
    if (!existsSync(filePath)) return 0;

    try {
      const raw = await readFile(filePath, "utf-8");
      const ops = JSON.parse(raw) as SerializedPendingOperation[];
      const now = Date.now();

      for (const serialized of ops) {
        const createdAt = new Date(serialized.createdAt);
        const elapsed = now - createdAt.getTime();
        if (elapsed > serialized.ttlMs) continue;

        const executor = executorRegistry.get(serialized.type);
        if (!executor) {
          process.stderr.write(
            `[confirmation] Skipping persisted op ${serialized.id}: no executor for type '${serialized.type}'\n`
          );
          continue;
        }

        this.queue.set(serialized.id, {
          id: serialized.id,
          type: serialized.type,
          description: serialized.description,
          params: serialized.params,
          executor,
          createdAt,
          ttlMs: serialized.ttlMs,
          walletAddress: serialized.walletAddress,
        });
      }

      if (this.queue.size > 0) {
        process.stderr.write(
          `[confirmation] Restored ${this.queue.size} pending operation(s) from disk\n`
        );
      }
      return this.queue.size;
    } catch (e: unknown) {
      process.stderr.write(
        `[confirmation] Failed to load persisted queue (starting fresh): ${e}\n`
      );
      return 0;
    }
  }
}

export const confirmationQueue = new ConfirmationQueueManager(true);
