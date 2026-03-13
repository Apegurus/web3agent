import type { PendingConfirmationResult, WriteOperationResult } from "./types.js";

export function isPendingConfirmation(value: unknown): value is PendingConfirmationResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { status?: unknown; id?: unknown; summary?: unknown };
  return (
    candidate.status === "pending_confirmation" &&
    typeof candidate.id === "string" &&
    typeof candidate.summary === "string"
  );
}

export function normalizeWriteResult(data: unknown): WriteOperationResult {
  if (isPendingConfirmation(data)) {
    return data;
  }
  return (data ?? {}) as WriteOperationResult;
}
