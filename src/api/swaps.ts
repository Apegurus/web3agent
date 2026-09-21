import { getConfig } from "../config/env.js";
import { lifiExecuteBridgeSchema, lifiGetQuoteSchema } from "../tools/lifi/schemas.js";
import { orbsSwapSchema, orbsSwapStatusSchema } from "../tools/orbs/schemas.js";
import { readAuditLog } from "../wallet/audit.js";
import { confirmationQueue } from "../wallet/confirmation.js";
import { getWalletState } from "../wallet/persistence.js";
import {
  radardexChainSchema,
  radardexQuoteSchema,
  radardexSwapSchema,
} from "./schemas/radardex.js";
import { getRuntime, invokeAndRequireData } from "./shared.js";
import type {
  CrossChainSwapQuoteResult,
  ExecuteBridgeInput,
  ExecuteSameChainSwapInput,
  LifiQuoteInput,
  RadarDexQuoteInput,
  RadarDexQuoteResult,
  RadarDexRouteHealthResult,
  RadarDexSwapInput,
  RadarDexTokenListResult,
  RuntimeBoundOptions,
  SameChainSwapQuoteInput,
  SwapHistoryEntry,
  SwapHistoryResult,
  SwapQuoteResult,
  SwapStatusInput,
  SwapStatusResult,
  TokenSwappableResult,
  WriteOperationResult,
} from "./types.js";
import { parseInput } from "./validation.js";
import { normalizeWriteResult } from "./write-results.js";

export async function getSwapQuote(
  params: LifiQuoteInput | SameChainSwapQuoteInput,
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

  if (params.provider === "radardex") {
    const { provider: _provider, ...candidate } = params;
    const input = parseInput(radardexQuoteSchema, candidate);
    const quote = await invokeAndRequireData<RadarDexQuoteResult>(
      runtime,
      "radardex_get_quote",
      input
    );
    return {
      kind: "same-chain",
      provider: "radardex",
      chainId: 5042,
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
    chainId: input.chainId ?? getConfig().chainId,
    quote,
  };
}

export async function isTokenSwappable(
  params: LifiQuoteInput | SameChainSwapQuoteInput,
  options?: RuntimeBoundOptions
): Promise<TokenSwappableResult> {
  try {
    const quote = await getSwapQuote(params, options);
    if (quote.provider === "radardex" && quote.quote.best === undefined) {
      return {
        swappable: false,
        provider: "radardex",
        kind: "same-chain",
        reason: "RadarDEX returned no executable routes",
      };
    }
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

    const provider = params.provider === "radardex" ? "radardex" : "orbs";
    return {
      swappable: false,
      provider,
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
  if (params.provider === "radardex") {
    const { provider: _provider, ...candidate } = params;
    const input = parseInput(radardexSwapSchema, candidate);
    const data = await invokeAndRequireData<unknown>(runtime, "radardex_swap", input);
    return normalizeWriteResult(data);
  }
  const input = parseInput(orbsSwapSchema, params);
  const data = await invokeAndRequireData<unknown>(runtime, "orbs_swap", input);
  return normalizeWriteResult(data);
}

export async function listRadarDexTokens(
  options?: RuntimeBoundOptions
): Promise<RadarDexTokenListResult> {
  const runtime = await getRuntime(options);
  const input = parseInput(radardexChainSchema, { chainId: 5042 });
  return invokeAndRequireData<RadarDexTokenListResult>(runtime, "radardex_list_tokens", input);
}

export async function getRadarDexQuote(
  params: RadarDexQuoteInput,
  options?: RuntimeBoundOptions
): Promise<RadarDexQuoteResult> {
  const runtime = await getRuntime(options);
  const input = parseInput(radardexQuoteSchema, params);
  return invokeAndRequireData<RadarDexQuoteResult>(runtime, "radardex_get_quote", input);
}

export async function getRadarDexRouteHealth(
  options?: RuntimeBoundOptions
): Promise<RadarDexRouteHealthResult> {
  const runtime = await getRuntime(options);
  const input = parseInput(radardexChainSchema, { chainId: 5042 });
  return invokeAndRequireData<RadarDexRouteHealthResult>(
    runtime,
    "radardex_get_route_health",
    input
  );
}

export async function executeRadarDexSwap(
  params: RadarDexSwapInput,
  options?: RuntimeBoundOptions
): Promise<WriteOperationResult> {
  const runtime = await getRuntime(options);
  const input = parseInput(radardexSwapSchema, params);
  const data = await invokeAndRequireData<unknown>(runtime, "radardex_swap", input);
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

function mapOperationType(operationType: string): "orbs" | "lifi" | "radardex" | null {
  if (operationType === "orbs_swap") return "orbs";
  if (operationType === "radardex_swap") return "radardex";
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
