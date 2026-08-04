import { type Hex, decodeErrorResult, parseAbi } from "viem";
import { assertAddress, assertChainSupported } from "../../operations/validation.js";
import { lookupTokenByAddress } from "../../tokens/registry.js";
import { normalizeAddress } from "../../utils/address.js";
import type { BalanceChange } from "../types.js";
import { NATIVE_ASSET_ADDRESS } from "./fallback-decoder.js";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRACE_SUPPORT_TTL_MS = 5 * 60 * 1000;
const traceSupportCache = new Map<number, { supported: boolean; checkedAt: number }>();
const revertAbi = parseAbi(["error Error(string)", "error Panic(uint256)"]);

type TraceLog = {
  readonly address?: string;
  readonly topics?: readonly string[];
  readonly data?: string;
};

export type TraceCallNode = {
  readonly from?: string;
  readonly to?: string;
  readonly value?: string;
  readonly logs?: readonly TraceLog[];
  readonly calls?: readonly TraceCallNode[];
};

export function getCachedTraceSupport(chainId: number): boolean | undefined {
  const cached = traceSupportCache.get(chainId);
  if (!cached) return undefined;
  if (Date.now() - cached.checkedAt > TRACE_SUPPORT_TTL_MS) {
    traceSupportCache.delete(chainId);
    return undefined;
  }
  return cached.supported;
}

export function setCachedTraceSupport(chainId: number, supported: boolean): void {
  traceSupportCache.set(chainId, { supported, checkedAt: Date.now() });
}

export function clearTraceSupportCache(): void {
  traceSupportCache.clear();
}

function getAddressFromTopic(topic: string): Hex {
  return `0x${topic.slice(-40)}` as Hex;
}

export function parseNumericValue(value: string | undefined): bigint {
  if (!value || value === "0x" || value === "0") return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function getErrorData(error: unknown): Hex | null {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const data = (current as { data?: unknown }).data;
    if (typeof data === "string" && data.startsWith("0x")) return data as Hex;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

function decodeRevertData(data: Hex | null): string | null {
  if (!data) return null;
  try {
    const decoded = decodeErrorResult({ abi: revertAbi, data });
    if (decoded.errorName === "Error") return String(decoded.args[0]);
    if (decoded.errorName === "Panic") return `Panic(${String(decoded.args[0])})`;
  } catch (_error: unknown) {
    return null;
  }
  return null;
}

export function extractErrorMessage(error: unknown): string {
  const decodedRevert = decodeRevertData(getErrorData(error));
  if (decodedRevert) return decodedRevert;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as { shortMessage?: unknown; details?: unknown; message?: unknown };
    if (typeof record.shortMessage === "string") return record.shortMessage;
    if (typeof record.details === "string") return record.details;
    if (typeof record.message === "string") return record.message;
  }
  return "Unknown error";
}

export function isDebugTraceUnsupported(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return [
    "method not found",
    "not available",
    "does not exist",
    "unsupported",
    "forbidden",
    "403",
  ].some((fragment) => message.includes(fragment));
}

export function addAggregatedChange(
  changes: Map<string, bigint>,
  token: Hex,
  direction: BalanceChange["direction"],
  amount: bigint
): void {
  if (amount <= 0n) return;
  const key = `${token.toLowerCase()}:${direction}`;
  changes.set(key, (changes.get(key) ?? 0n) + amount);
}

export function collectTraceChanges(
  node: TraceCallNode,
  monitoredAddress: string,
  changes: Map<string, bigint>
): void {
  for (const log of node.logs ?? []) {
    if (!log.address || !log.topics || log.topics.length < 3 || !log.data) continue;
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    const token = assertAddress(log.address, "trace.log.address");
    const fromTopic = log.topics[1];
    const toTopic = log.topics[2];
    if (!fromTopic || !toTopic) continue;
    const from = normalizeAddress(getAddressFromTopic(fromTopic));
    const to = normalizeAddress(getAddressFromTopic(toTopic));
    const amount = parseNumericValue(log.data);
    if (from === monitoredAddress) addAggregatedChange(changes, token, "out", amount);
    if (to === monitoredAddress) addAggregatedChange(changes, token, "in", amount);
  }

  const value = parseNumericValue(node.value);
  if (value > 0n) {
    const from = typeof node.from === "string" ? normalizeAddress(node.from) : null;
    const to = typeof node.to === "string" ? normalizeAddress(node.to) : null;
    if (from === monitoredAddress) addAggregatedChange(changes, NATIVE_ASSET_ADDRESS, "out", value);
    if (to === monitoredAddress) addAggregatedChange(changes, NATIVE_ASSET_ADDRESS, "in", value);
  }
  for (const child of node.calls ?? []) collectTraceChanges(child, monitoredAddress, changes);
}

export function isUsableTrace(trace: TraceCallNode): boolean {
  const hasLogs = Boolean(trace.logs?.length);
  const hasCalls = Boolean(trace.calls?.length);
  const hasValue = typeof trace.value === "string" && trace.value !== "0x" && trace.value !== "0x0";
  return hasLogs || hasCalls || hasValue;
}

export function resolveBalanceChanges(
  chainId: number,
  changes: Map<string, bigint>
): BalanceChange[] {
  const chain = assertChainSupported(chainId);
  return [...changes.entries()].map(([key, amount]) => {
    const [tokenAddress, direction] = key.split(":");
    if (tokenAddress === NATIVE_ASSET_ADDRESS.toLowerCase()) {
      return {
        token: NATIVE_ASSET_ADDRESS,
        symbol: chain.nativeCurrency.symbol,
        decimals: chain.nativeCurrency.decimals,
        amount: amount.toString(),
        direction: direction as BalanceChange["direction"],
      };
    }
    const token = lookupTokenByAddress(tokenAddress ?? "", chainId);
    return {
      token: (token?.address ?? tokenAddress) as Hex,
      symbol: token?.symbol ?? null,
      decimals: token?.decimals ?? null,
      amount: amount.toString(),
      direction: direction as BalanceChange["direction"],
    };
  });
}
