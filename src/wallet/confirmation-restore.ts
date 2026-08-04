import type { OperationExecutor, PendingOperation } from "../types/wallet.js";
import { appendAuditLog } from "./audit.js";
import { readPendingOperations } from "./confirmation-persistence.js";

type RestoredPendingOperations = {
  readonly operations: PendingOperation[];
  readonly droppedEntries: boolean;
};

export async function restorePendingOperations(
  resolveExecutor: (type: string) => OperationExecutor | undefined
): Promise<RestoredPendingOperations | null> {
  const serializedOperations = await readPendingOperations();
  if (!serializedOperations) return null;

  const now = Date.now();
  const operations: PendingOperation[] = [];
  let droppedEntries = false;

  for (const serialized of serializedOperations) {
    if (serialized.executionState === "claimed") {
      droppedEntries = true;
      appendAuditLog({
        action: "EXECUTION_UNCERTAIN",
        operationType: serialized.type,
        operationId: serialized.id,
        walletAddress: serialized.walletAddress,
        description: serialized.description,
      }).catch((error: unknown) => {
        process.stderr.write(
          `[confirmation] Failed to audit uncertain persisted op ${serialized.id}: ${error}\n`
        );
      });
      continue;
    }

    const createdAt = new Date(serialized.createdAt);
    if (now - createdAt.getTime() > serialized.ttlMs) {
      droppedEntries = true;
      appendAuditLog({
        action: "EXPIRED",
        operationType: serialized.type,
        operationId: serialized.id,
        walletAddress: serialized.walletAddress,
        description: serialized.description,
      }).catch((error: unknown) => {
        process.stderr.write(
          `[confirmation] Failed to audit expired persisted op ${serialized.id}: ${error}\n`
        );
      });
      continue;
    }

    const executor = resolveExecutor(serialized.type);
    if (!executor) {
      droppedEntries = true;
      process.stderr.write(
        `[confirmation] Skipping persisted op ${serialized.id}: no executor for type '${serialized.type}'\n`
      );
      continue;
    }

    operations.push({
      id: serialized.id,
      type: serialized.type,
      description: serialized.description,
      params: serialized.params,
      executor,
      createdAt,
      ttlMs: serialized.ttlMs,
      walletAddress: serialized.walletAddress,
      riskLevel: serialized.riskLevel,
    });
  }

  return { operations, droppedEntries };
}
