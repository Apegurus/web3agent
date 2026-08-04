import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PendingOperation } from "../types/wallet.js";
import { atomicWriteJson } from "../utils/atomic-write.js";

export interface SerializedPendingOperation {
  id: string;
  type: string;
  description: string;
  params: Record<string, unknown>;
  createdAt: string;
  ttlMs: number;
  walletAddress?: string;
  riskLevel?: PendingOperation["riskLevel"];
  executionState?: "claimed";
}

function getPendingOpsPath(): string {
  return join(homedir(), ".web3agent", "pending-ops.json");
}

export async function readPendingOperations(): Promise<SerializedPendingOperation[] | null> {
  const filePath = getPendingOpsPath();
  if (!existsSync(filePath)) return null;
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as SerializedPendingOperation[];
}

export async function writePendingOperations(
  operations: Iterable<PendingOperation>,
  claimedIds: ReadonlySet<string>
): Promise<void> {
  const serialized: SerializedPendingOperation[] = [...operations].map((operation) => ({
    id: operation.id,
    type: operation.type,
    description: operation.description,
    params: operation.params,
    createdAt: operation.createdAt.toISOString(),
    ttlMs: operation.ttlMs,
    walletAddress: operation.walletAddress,
    riskLevel: operation.riskLevel,
    ...(claimedIds.has(operation.id) ? { executionState: "claimed" as const } : {}),
  }));
  await atomicWriteJson(getPendingOpsPath(), serialized);
}
