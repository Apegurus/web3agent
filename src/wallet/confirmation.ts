import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OperationExecutor, PendingOperation } from "../types/wallet.js";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

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
  public enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  enqueue(
    type: string,
    description: string,
    params: Record<string, unknown>,
    executor: OperationExecutor,
    walletAddress?: string
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
      ttlMs: THIRTY_MINUTES_MS,
      walletAddress,
    };

    this.queue.set(id, operation);
    this.persistQueue().catch((e: unknown) => {
      process.stderr.write(`[confirmation] Failed to persist queue: ${e}\n`);
    });

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
    this.queue.delete(id);
    this.persistQueue().catch((e: unknown) => {
      process.stderr.write(`[confirmation] Failed to persist queue: ${e}\n`);
    });
  }

  deny(id: string): boolean {
    const removed = this.queue.delete(id);
    if (removed)
      this.persistQueue().catch((e: unknown) => {
        process.stderr.write(`[confirmation] Failed to persist queue: ${e}\n`);
      });
    return removed;
  }

  list(): PendingOperation[] {
    return [...this.queue.values()];
  }

  pruneExpired(): void {
    const now = Date.now();
    let pruned = false;
    for (const [id, op] of this.queue) {
      if (now - op.createdAt.getTime() > op.ttlMs) {
        this.queue.delete(id);
        pruned = true;
      }
    }
    if (pruned)
      this.persistQueue().catch((e: unknown) => {
        process.stderr.write(`[confirmation] Failed to persist queue: ${e}\n`);
      });
  }

  flushAll(): number {
    const count = this.queue.size;
    this.queue.clear();
    this.persistQueue().catch((e: unknown) => {
      process.stderr.write(`[confirmation] Failed to persist queue: ${e}\n`);
    });
    return count;
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

    const filePath = getPendingOpsPath();
    const dir = join(homedir(), ".web3agent");
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const tmpPath = `${filePath}.tmp`;
    const fd = await open(tmpPath, "w", 0o600);
    try {
      await fd.writeFile(JSON.stringify(ops, null, 2));
      await fd.sync();
    } finally {
      await fd.close();
    }
    await rename(tmpPath, filePath);
  }

  async loadQueue(): Promise<void> {
    const filePath = getPendingOpsPath();
    if (!existsSync(filePath)) return;

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
    } catch (e: unknown) {
      process.stderr.write(
        `[confirmation] Failed to load persisted queue (starting fresh): ${e}\n`
      );
    }
  }
}

export const confirmationQueue = new ConfirmationQueueManager(true);
