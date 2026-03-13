import { lifiExecuteBridgeSchema, lifiGetQuoteSchema } from "../tools/lifi/schemas.js";
import { orbsSwapSchema, orbsSwapStatusSchema } from "../tools/orbs/schemas.js";
import { readAuditLog } from "../wallet/audit.js";
import { confirmationQueue } from "../wallet/confirmation.js";
import { getWalletState } from "../wallet/persistence.js";
import { getRuntime, invokeAndRequireData, parseInput } from "./shared.js";
import type {
  CrossChainSwapQuoteResult,
  ExecuteBridgeInput,
  ExecuteSameChainSwapInput,
  LifiQuoteInput,
  OrbsQuoteInput,
  PendingConfirmationResult,
  RuntimeBoundOptions,
  SameChainSwapQuoteResult,
  SwapHistoryEntry,
  SwapHistoryResult,
  SwapQuoteResult,
  SwapStatusInput,
  SwapStatusResult,
  TokenSwappableResult,
  WriteOperationResult,
} from "./types.js";
import { normalizeWriteResult } from "./write-results.js";

export async function getSwapQuote(
  params: LifiQuoteInput | OrbsQuoteInput,
  options?: RuntimeBoundOptions
): Promise<SwapQuoteResult> {
  const runtime = await getRuntime(options);

  if ("fromChainId" in params) {
    const input = parseInput(lifiGetQuoteSchema, params);
    const quote = await invokeAndRequireData<CrossChainSwapQuoteResult["quote"]>(
      runtime,
      "lifi_get_quote",
      input
    );
    return {
      kind: "cross-chain",
      provider: "lifi",
      quote,
    };
  }

  const input = parseInput(orbsSwapSchema, params);
  const quote = await invokeAndRequireData<Record<string, unknown>>(
    runtime,
    "orbs_get_quote",
    input
  );
  return {
    kind: "same-chain",
    provider: "orbs",
    chainId: input.chainId,
    quote,
  };
}

export async function isTokenSwappable(
  params: LifiQuoteInput | OrbsQuoteInput,
  options?: RuntimeBoundOptions
): Promise<TokenSwappableResult> {
  try {
    const quote = await getSwapQuote(params, options);
    return {
      swappable: true,
      provider: quote.provider,
      kind: quote.kind,
    };
  } catch (error: unknown) {
    if ("fromChainId" in params) {
      return {
        swappable: false,
        provider: "lifi",
        kind: "cross-chain",
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      swappable: false,
      provider: "orbs",
      kind: "same-chain",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function executeSameChainSwap(
  params: ExecuteSameChainSwapInput,
  options?: RuntimeBoundOptions
): Promise<WriteOperationResult> {
  const runtime = await getRuntime(options);
  const input = parseInput(orbsSwapSchema, params);
  const data = await invokeAndRequireData<unknown>(runtime, "orbs_swap", input);
  return normalizeWriteResult(data);
}

export async function executeBridge(
  params: ExecuteBridgeInput,
  options?: RuntimeBoundOptions
): Promise<WriteOperationResult> {
  const runtime = await getRuntime(options);
  const input = parseInput(lifiExecuteBridgeSchema, params);
  const data = await invokeAndRequireData<unknown>(runtime, "lifi_execute_bridge", input);
  return normalizeWriteResult(data);
}

export async function getSwapStatus(
  params: SwapStatusInput,
  options?: RuntimeBoundOptions
): Promise<SwapStatusResult> {
  const runtime = await getRuntime(options);
  const input = parseInput(orbsSwapStatusSchema, params);
  const status = await invokeAndRequireData<Record<string, unknown>>(
    runtime,
    "orbs_swap_status",
    input
  );

  return {
    provider: "orbs",
    status,
  };
}

function mapOperationType(operationType: string): "orbs" | "lifi" | null {
  if (operationType === "orbs_swap") return "orbs";
  if (operationType === "lifi_execute_bridge") return "lifi";
  return null;
}

export async function getSwapHistory(
  _params: { walletAddress?: string } = {}
): Promise<SwapHistoryResult> {
  const walletAddress = _params.walletAddress ?? getWalletState().address;
  const pendingEntries: SwapHistoryEntry[] = confirmationQueue
    .list()
    .filter((operation) => mapOperationType(operation.type) !== null)
    .filter((operation) =>
      walletAddress ? operation.walletAddress?.toLowerCase() === walletAddress.toLowerCase() : true
    )
    .map((operation) => ({
      id: operation.id,
      provider: mapOperationType(operation.type) ?? "orbs",
      status: "pending_confirmation",
      walletAddress: operation.walletAddress,
      description: operation.description,
      timestamp: operation.createdAt.toISOString(),
    }));

  const auditEntries = await readAuditLog();
  const historyEntries: SwapHistoryEntry[] = auditEntries
    .filter((entry) => mapOperationType(entry.operationType) !== null)
    .filter((entry) =>
      walletAddress ? entry.walletAddress?.toLowerCase() === walletAddress.toLowerCase() : true
    )
    .map((entry) => ({
      id: entry.operationId,
      provider: mapOperationType(entry.operationType) ?? "orbs",
      status:
        entry.action === "CONFIRMED"
          ? "confirmed"
          : (entry.action.toLowerCase() as "denied" | "expired"),
      walletAddress: entry.walletAddress,
      description: entry.description,
      timestamp: entry.timestamp,
    }));

  return {
    walletAddress,
    entries: [...pendingEntries, ...historyEntries].sort((a, b) =>
      a.timestamp < b.timestamp ? 1 : -1
    ),
  };
}
