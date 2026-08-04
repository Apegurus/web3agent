import type { PendingOperation } from "../types/wallet.js";
import type { AuditAction, AuditLogEntry } from "../wallet/audit.js";
import type { SwapHistoryEntry } from "./types.js";

type SwapProvider = SwapHistoryEntry["provider"];
type AdapterSource = NonNullable<SwapHistoryEntry["adapterSource"]>;
type FallbackReason = NonNullable<SwapHistoryEntry["fallbackReason"]>;

function isSwapProvider(value: unknown): value is SwapProvider {
  return value === "0x" || value === "orbs" || value === "lifi";
}

function isAdapterSource(value: unknown): value is AdapterSource {
  return value === "goat" || value === "native" || value === "lifi" || value === "orbs";
}

function isFallbackReason(value: unknown): value is FallbackReason {
  return value === "no-route" || value === "provider-unavailable";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function providerForOperation(operationType: string): SwapProvider | undefined {
  if (operationType === "zeroex_swap" || operationType === "0x_swap") return "0x";
  if (operationType === "zeroex_lifi_fallback") return "lifi";
  if (operationType === "orbs_swap") return "orbs";
  if (operationType === "lifi_execute_bridge") return "lifi";
  return undefined;
}

function statusForAuditAction(action: AuditAction): SwapHistoryEntry["status"] {
  switch (action) {
    case "CONFIRMED":
      return "confirmed";
    case "DENIED":
      return "denied";
    case "EXPIRED":
      return "expired";
    case "EXECUTION_FAILED":
    case "EXECUTION_UNCERTAIN":
      return "failed";
  }
}

function actualSwapProvenance(metadata: unknown): {
  readonly provider?: SwapProvider;
  readonly adapterSource?: AdapterSource;
  readonly capabilityDecisionId?: string;
  readonly capabilityReason?: string;
  readonly fallbackReason?: FallbackReason;
} {
  if (!isRecord(metadata)) return {};
  return {
    ...(isSwapProvider(metadata.provider) ? { provider: metadata.provider } : {}),
    ...(isAdapterSource(metadata.adapterSource) ? { adapterSource: metadata.adapterSource } : {}),
    ...(typeof metadata.capabilityDecisionId === "string"
      ? { capabilityDecisionId: metadata.capabilityDecisionId }
      : {}),
    ...(typeof metadata.capabilityReason === "string"
      ? { capabilityReason: metadata.capabilityReason }
      : {}),
    ...(isFallbackReason(metadata.fallbackReason)
      ? { fallbackReason: metadata.fallbackReason }
      : {}),
  };
}

export function isSwapOperation(operationType: string): boolean {
  return providerForOperation(operationType) !== undefined;
}

export function normalizePendingSwapHistory(
  operation: PendingOperation
): SwapHistoryEntry | undefined {
  const provider = providerForOperation(operation.type);
  if (!provider) return undefined;
  return {
    id: operation.id,
    provider,
    status: "pending_confirmation",
    walletAddress: operation.walletAddress,
    description: operation.description,
    timestamp: operation.createdAt.toISOString(),
    ...(typeof operation.params.chainId === "number" ? { chainId: operation.params.chainId } : {}),
  };
}

export function normalizeAuditSwapHistory(entry: AuditLogEntry): SwapHistoryEntry | undefined {
  const defaultProvider = providerForOperation(entry.operationType);
  if (!defaultProvider) return undefined;
  const provenance = actualSwapProvenance(entry.metadata);
  return {
    id: entry.operationId,
    provider: provenance.provider ?? defaultProvider,
    status: statusForAuditAction(entry.action),
    walletAddress: entry.walletAddress,
    description: entry.description,
    timestamp: entry.timestamp,
    ...(provenance.adapterSource ? { adapterSource: provenance.adapterSource } : {}),
    ...(provenance.capabilityDecisionId
      ? { capabilityDecisionId: provenance.capabilityDecisionId }
      : {}),
    ...(provenance.capabilityReason ? { capabilityReason: provenance.capabilityReason } : {}),
    ...(provenance.fallbackReason ? { fallbackReason: provenance.fallbackReason } : {}),
  };
}
