import { type Hex, decodeErrorResult, numberToHex, parseAbi } from "viem";
import { createPublicClientForRuntimeChain } from "../operations/chain-access.js";
import {
  assertAddress,
  assertChainSupported,
  assertHex,
  parseBigIntString,
} from "../operations/validation.js";
import { lookupTokenByAddress } from "../tokens/registry.js";
import { normalizeAddress } from "../utils/address.js";
import { Web3AgentError } from "./errors.js";
import { transactionSimulateSchema } from "./schemas.js";
import {
  NATIVE_ASSET_ADDRESS,
  decodeFallbackBalanceChanges,
} from "./simulation/fallback-decoder.js";
import type { BalanceChange, SimulateTransactionInput, SimulationResult } from "./types.js";
import { parseInput } from "./validation.js";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRACE_SUPPORT_TTL_MS = 5 * 60 * 1000;

const traceSupportCache = new Map<number, { supported: boolean; checkedAt: number }>();

const revertAbi = parseAbi(["error Error(string)", "error Panic(uint256)"]);
const decodeViemErrorResult = decodeErrorResult;

interface TraceLog {
  address?: string;
  topics?: string[];
  data?: string;
}

interface TraceCallNode {
  from?: string;
  to?: string;
  value?: string;
  logs?: TraceLog[];
  calls?: TraceCallNode[];
}

function getCachedTraceSupport(chainId: number): boolean | undefined {
  const cached = traceSupportCache.get(chainId);
  if (!cached) return undefined;

  if (Date.now() - cached.checkedAt > TRACE_SUPPORT_TTL_MS) {
    traceSupportCache.delete(chainId);
    return undefined;
  }

  return cached.supported;
}

function setCachedTraceSupport(chainId: number, supported: boolean): void {
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

function isDebugTraceUnsupported(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes("method not found") ||
    message.includes("not available") ||
    message.includes("does not exist") ||
    message.includes("unsupported") ||
    message.includes("forbidden") ||
    message.includes("403")
  );
}

function getErrorData(error: unknown): Hex | null {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const data = (current as { data?: unknown }).data;
    if (typeof data === "string" && data.startsWith("0x")) {
      return data as Hex;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

function decodeRevertData(data: Hex | null): string | null {
  if (!data) return null;

  try {
    const decoded = decodeViemErrorResult({
      abi: revertAbi,
      data,
    });

    if (decoded.errorName === "Error") {
      const [reason] = decoded.args;
      return String(reason);
    }

    if (decoded.errorName === "Panic") {
      const [code] = decoded.args;
      return `Panic(${String(code)})`;
    }
  } catch (_error: unknown) {
    return null;
  }

  return null;
}

function extractErrorMessage(error: unknown): string {
  const decodedRevert = decodeRevertData(getErrorData(error));
  if (decodedRevert) return decodedRevert;

  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const shortMessage = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof shortMessage === "string") return shortMessage;
    const details = (error as { details?: unknown }).details;
    if (typeof details === "string") return details;
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }

  return "Unknown error";
}

function addAggregatedChange(
  changes: Map<string, bigint>,
  token: Hex,
  direction: BalanceChange["direction"],
  amount: bigint
): void {
  if (amount <= 0n) return;
  const key = `${token.toLowerCase()}:${direction}`;
  changes.set(key, (changes.get(key) ?? 0n) + amount);
}

function collectTraceChanges(
  node: TraceCallNode,
  monitoredAddress: string,
  changes: Map<string, bigint>
): void {
  if (node.logs) {
    for (const log of node.logs) {
      if (!log.address || !log.topics || log.topics.length < 3 || !log.data) continue;
      if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;

      const token = assertAddress(log.address, "trace.log.address");
      const from = normalizeAddress(getAddressFromTopic(log.topics[1]));
      const to = normalizeAddress(getAddressFromTopic(log.topics[2]));
      const amount = parseNumericValue(log.data);

      if (from === monitoredAddress) {
        addAggregatedChange(changes, token, "out", amount);
      }
      if (to === monitoredAddress) {
        addAggregatedChange(changes, token, "in", amount);
      }
    }
  }

  const value = parseNumericValue(node.value);
  if (value > 0n) {
    const from = typeof node.from === "string" ? normalizeAddress(node.from) : null;
    const to = typeof node.to === "string" ? normalizeAddress(node.to) : null;
    if (from === monitoredAddress) {
      addAggregatedChange(changes, NATIVE_ASSET_ADDRESS, "out", value);
    }
    if (to === monitoredAddress) {
      addAggregatedChange(changes, NATIVE_ASSET_ADDRESS, "in", value);
    }
  }

  for (const child of node.calls ?? []) {
    collectTraceChanges(child, monitoredAddress, changes);
  }
}

export function isUsableTrace(trace: TraceCallNode): boolean {
  const hasLogs = Array.isArray(trace.logs) && trace.logs.length > 0;
  const hasCalls = Array.isArray(trace.calls) && trace.calls.length > 0;
  const hasValue = typeof trace.value === "string" && trace.value !== "0x" && trace.value !== "0x0";
  return hasLogs || hasCalls || hasValue;
}

async function resolveBalanceChanges(
  chainId: number,
  changes: Map<string, bigint>
): Promise<BalanceChange[]> {
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

    const token = lookupTokenByAddress(tokenAddress, chainId);
    return {
      token: (token?.address ?? tokenAddress) as Hex,
      symbol: token?.symbol ?? null,
      decimals: token?.decimals ?? null,
      amount: amount.toString(),
      direction: direction as BalanceChange["direction"],
    };
  });
}

export async function simulateTransaction(
  params: SimulateTransactionInput
): Promise<SimulationResult> {
  const input = parseInput(transactionSimulateSchema, params);
  assertChainSupported(input.chainId);

  const publicClient = createPublicClientForRuntimeChain(input.chainId);
  const tx = {
    account: assertAddress(input.from, "from"),
    to: assertAddress(input.to, "to"),
    data: assertHex(input.data, "data"),
    value: input.value ? parseBigIntString(input.value, "value") : 0n,
  };
  const decodedTx = {
    from: tx.account,
    to: tx.to,
    data: tx.data,
    value: tx.value,
  };

  let gasEstimate: bigint;
  try {
    gasEstimate = await publicClient.estimateGas(tx);
  } catch (error: unknown) {
    throw new Web3AgentError({
      code: "SIMULATION_REVERT",
      message: extractErrorMessage(error),
      cause: error,
    });
  }

  const changes = new Map<string, bigint>();
  const traceSupported = getCachedTraceSupport(input.chainId);

  if (traceSupported !== false) {
    try {
      const debugClient = publicClient as unknown as {
        request: (args: { method: string; params: unknown[] }) => Promise<unknown>;
      };
      const trace = (await debugClient.request({
        method: "debug_traceCall",
        params: [
          {
            from: tx.account,
            to: tx.to,
            data: tx.data,
            ...(tx.value > 0n ? { value: numberToHex(tx.value) } : {}),
          },
          "latest",
          { tracer: "callTracer", tracerConfig: { withLog: true } },
        ],
      })) as TraceCallNode;

      if (isUsableTrace(trace)) {
        setCachedTraceSupport(input.chainId, true);
        collectTraceChanges(trace, normalizeAddress(tx.account), changes);
        return {
          success: true,
          gasEstimate: gasEstimate.toString(),
          balanceChanges: await resolveBalanceChanges(input.chainId, changes),
        };
      }

      setCachedTraceSupport(input.chainId, false);
    } catch (error: unknown) {
      if (isDebugTraceUnsupported(error)) {
        setCachedTraceSupport(input.chainId, false);
      } else {
        throw new Web3AgentError({
          code: "SIMULATION_ERROR",
          message: extractErrorMessage(error),
          cause: error,
        });
      }
    }
  }

  try {
    await publicClient.call(tx);
  } catch (error: unknown) {
    throw new Web3AgentError({
      code: "SIMULATION_REVERT",
      message: extractErrorMessage(error),
      cause: error,
    });
  }

  try {
    for (const change of decodeFallbackBalanceChanges(decodedTx)) {
      addAggregatedChange(changes, change.token, change.direction, change.amount);
    }
  } catch (error: unknown) {
    throw new Web3AgentError({
      code: "SIMULATION_ERROR",
      message: extractErrorMessage(error),
      cause: error,
    });
  }

  return {
    success: true,
    gasEstimate: gasEstimate.toString(),
    balanceChanges: await resolveBalanceChanges(input.chainId, changes),
  };
}
