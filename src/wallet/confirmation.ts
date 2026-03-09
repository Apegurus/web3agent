import { randomUUID } from "node:crypto";
import type { OperationExecutor, PendingOperation } from "../types/wallet.js";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

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
    executor: OperationExecutor
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
    };

    this.queue.set(id, operation);

    return {
      queued: true,
      id,
      summary: `Queued [${type}]: ${description} — confirm with ID: ${id}`,
    };
  }

  confirm(id: string): { operation: PendingOperation; stale: boolean } | null {
    const operation = this.queue.get(id);
    if (!operation) return null;

    this.queue.delete(id);

    const elapsed = Date.now() - operation.createdAt.getTime();
    const stale = elapsed > operation.ttlMs;

    return { operation, stale };
  }

  deny(id: string): boolean {
    return this.queue.delete(id);
  }

  list(): PendingOperation[] {
    return [...this.queue.values()];
  }

  pruneExpired(): void {
    const now = Date.now();
    for (const [id, op] of this.queue) {
      if (now - op.createdAt.getTime() > op.ttlMs) {
        this.queue.delete(id);
      }
    }
  }
}

export const confirmationQueue = new ConfirmationQueueManager(true);
