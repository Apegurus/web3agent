import { getConfig } from "../config/env.js";
import { lifiExecuteBridgeSchema, lifiGetQuoteSchema } from "../tools/lifi/schemas.js";
import { orbsSwapSchema, orbsSwapStatusSchema } from "../tools/orbs/schemas.js";
import { readAuditLog } from "../wallet/audit.js";
import { confirmationQueue } from "../wallet/confirmation.js";
import { getWalletState } from "../wallet/persistence.js";
import { getZeroExAdapterDecision } from "../zerox/capability.js";
import { type ZeroExQuote, classifyZeroExError } from "../zerox/client.js";
import { getRuntime, invokeAndRequireData } from "./shared.js";
import { percentageToBasisPoints } from "./slippage.js";
import {
  isSwapOperation,
  normalizeAuditSwapHistory,
  normalizePendingSwapHistory,
} from "./swap-history.js";
import { selectSameChainSwapProvider } from "./swap-routing.js";
import type {
  CrossChainSwapQuoteResult,
  ExecuteBridgeInput,
  ExecuteSameChainSwapInput,
  LifiQuoteInput,
  OrbsQuoteInput,
  RuntimeBoundOptions,
  SwapHistoryEntry,
  SwapHistoryResult,
  SwapQuoteResult,
  SwapStatusInput,
  SwapStatusResult,
  TokenSwappableResult,
  WriteOperationResult,
} from "./types.js";
import { parseInput } from "./validation.js";
import { isPendingConfirmation, normalizeWriteResult } from "./write-results.js";
import {
  requireZeroExAdapterProvenance,
  requireZeroExExecutionProvenance,
} from "./zeroex-provenance.js";

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
  const chainId = input.chainId ?? getConfig().chainId;
  const selection = selectSameChainSwapProvider({
    chainId,
    adapterDecision: getZeroExAdapterDecision(),
  });
  if (selection.provider === "orbs") {
    const quote = await invokeAndRequireData<Record<string, unknown>>(
      runtime,
      "orbs_get_quote",
      input
    );
    return {
      kind: "same-chain",
      provider: "orbs",
      chainId,
      quote,
    };
  }

  const toolName = selection.adapterSource === "goat" ? "0x_get_price" : "zeroex_get_quote";
  const { slippagePct, ...swapInput } = input;
  const zeroExInput = {
    ...swapInput,
    ...(slippagePct === undefined ? {} : { slippageBps: percentageToBasisPoints(slippagePct) }),
  };
  try {
    const zeroExQuote = await invokeAndRequireData<ZeroExQuote>(runtime, toolName, zeroExInput);
    const provenance = requireZeroExAdapterProvenance(zeroExQuote, selection);
    const { priceImpactBps, ...quote } = zeroExQuote;
    return {
      kind: "same-chain",
      provider: "0x",
      chainId,
      quote: { ...quote },
      adapterSource: provenance.adapterSource,
      capabilityDecisionId: provenance.capabilityDecisionId,
      capabilityReason: provenance.capabilityReason,
      ...(priceImpactBps ? { priceImpactBps } : {}),
    };
  } catch (error: unknown) {
    const classification = classifyZeroExError(error);
    if (!classification.fallbackAllowed) throw error;
    const quote = await invokeAndRequireData<Record<string, unknown>>(runtime, "lifi_get_quote", {
      fromChainId: chainId,
      toChainId: chainId,
      fromToken: input.fromToken,
      toToken: input.toToken,
      fromAmount: input.fromAmount,
      ...(slippagePct === undefined ? {} : { slippagePct }),
    });
    return {
      kind: "same-chain",
      provider: "lifi",
      chainId,
      quote,
      adapterSource: "lifi",
      fallbackReason: classification.kind,
      fallbackHistory: [{ provider: "0x", reason: classification.kind }],
    };
  }
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

    const input = parseInput(orbsSwapSchema, params);
    const chainId = input.chainId ?? getConfig().chainId;
    const selection = selectSameChainSwapProvider({
      chainId,
      adapterDecision: getZeroExAdapterDecision(),
    });
    return {
      swappable: false,
      provider: selection.provider,
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
  const chainId = input.chainId ?? getConfig().chainId;
  const selection = selectSameChainSwapProvider({
    chainId,
    adapterDecision: getZeroExAdapterDecision(),
  });
  if (selection.provider === "orbs") {
    const data = await invokeAndRequireData<unknown>(runtime, "orbs_swap", input);
    return normalizeWriteResult(data);
  }
  const toolName = selection.adapterSource === "goat" ? "0x_swap" : "zeroex_swap";
  const { slippagePct, ...swapInput } = input;
  const zeroExInput = {
    ...swapInput,
    ...(slippagePct === undefined ? {} : { slippageBps: percentageToBasisPoints(slippagePct) }),
  };
  try {
    const data = await invokeAndRequireData<unknown>(runtime, toolName, zeroExInput);
    const result = normalizeWriteResult(data);
    if (!isPendingConfirmation(result)) requireZeroExExecutionProvenance(result, selection);
    return result;
  } catch (error: unknown) {
    const classification = classifyZeroExError(error);
    if (!classification.fallbackAllowed) throw error;
    const data = await invokeAndRequireData<unknown>(runtime, "lifi_execute_bridge", {
      fromChainId: chainId,
      toChainId: chainId,
      fromToken: input.fromToken,
      toToken: input.toToken,
      fromAmount: input.fromAmount,
      ...(slippagePct === undefined ? {} : { slippagePct }),
    });
    return normalizeWriteResult(data);
  }
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

export async function getSwapHistory(
  _params: { walletAddress?: string } = {}
): Promise<SwapHistoryResult> {
  const walletAddress = _params.walletAddress ?? getWalletState().address;
  const pendingEntries: SwapHistoryEntry[] = confirmationQueue
    .list()
    .filter((operation) => isSwapOperation(operation.type))
    .filter((operation) =>
      walletAddress ? operation.walletAddress?.toLowerCase() === walletAddress.toLowerCase() : true
    )
    .flatMap((operation) => {
      const entry = normalizePendingSwapHistory(operation);
      return entry ? [entry] : [];
    });

  const auditEntries = await readAuditLog();
  const historyEntries: SwapHistoryEntry[] = auditEntries
    .filter((entry) => isSwapOperation(entry.operationType))
    .filter((entry) =>
      walletAddress ? entry.walletAddress?.toLowerCase() === walletAddress.toLowerCase() : true
    )
    .flatMap((entry) => {
      const history = normalizeAuditSwapHistory(entry);
      return history ? [history] : [];
    });

  return {
    walletAddress,
    entries: [...pendingEntries, ...historyEntries].sort((a, b) =>
      a.timestamp < b.timestamp ? 1 : -1
    ),
  };
}
