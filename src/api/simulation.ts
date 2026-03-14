import { type Hex, decodeErrorResult, decodeFunctionData, numberToHex, parseAbi } from "viem";
import { ChainAccess } from "../operations/chain-access.js";
import { assertAddress, assertChainSupported, assertHex } from "../operations/validation.js";
import { lookupTokenByAddress } from "../tokens/registry.js";
import { Web3AgentError } from "./errors.js";
import { transactionSimulateSchema } from "./schemas.js";
import type { BalanceChange, SimulateTransactionInput, SimulationResult } from "./types.js";
import { parseInput } from "./validation.js";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const NATIVE_ASSET_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;
const TRACE_SUPPORT_TTL_MS = 5 * 60 * 1000;

const traceSupportCache = new Map<number, { supported: boolean; checkedAt: number }>();

const fallbackSimulationAbi = parseAbi([
  "function transfer(address to, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
  "function approve(address spender, uint256 amount)",
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function permit(address owner, ((address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline) permitSingle, bytes signature)",
  "function permitTransferFrom(((address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, (address to, uint256 requestedAmount) transferDetails, address owner, bytes signature)",
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params)",
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params)",
  "function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params)",
  "function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params)",
]);

const revertAbi = parseAbi(["error Error(string)", "error Panic(uint256)"]);

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

function normalizeAddress(value: string): string {
  return value.toLowerCase();
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

function getAddressFromTopic(topic: string): `0x${string}` {
  return `0x${topic.slice(-40)}` as `0x${string}`;
}

function parseNumericValue(value: string | undefined): bigint {
  if (!value || value === "0x" || value === "0") return 0n;
  return value.startsWith("0x") ? BigInt(value) : BigInt(value);
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
    const decoded = decodeErrorResult({
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
  token: `0x${string}`,
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

function isUsableTrace(trace: TraceCallNode): boolean {
  return (
    Array.isArray(trace.logs) ||
    Array.isArray(trace.calls) ||
    typeof trace.value === "string" ||
    typeof trace.from === "string" ||
    typeof trace.to === "string"
  );
}

function readRecordField<T>(value: unknown, field: string): T | undefined {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[field] as T | undefined;
}

function readPathEndpoints(path: Hex): { tokenIn: `0x${string}`; tokenOut: `0x${string}` } | null {
  const raw = path.slice(2);
  if (raw.length < 40) return null;

  const tokenIn = `0x${raw.slice(0, 40)}` as `0x${string}`;
  const tokenOut = `0x${raw.slice(raw.length - 40)}` as `0x${string}`;
  return { tokenIn, tokenOut };
}

function decodeFallbackBalanceChanges(
  input: {
    from: `0x${string}`;
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
  },
  changes: Map<string, bigint>
): void {
  let decoded: { functionName: string; args: readonly unknown[] } | null = null;

  try {
    const result = decodeFunctionData({
      abi: fallbackSimulationAbi,
      data: input.data,
    });
    decoded = {
      functionName: result.functionName,
      args: result.args,
    };
  } catch (_error: unknown) {
    return;
  }

  if (input.value > 0n) {
    addAggregatedChange(changes, NATIVE_ASSET_ADDRESS, "out", input.value);
  }

  switch (decoded.functionName) {
    case "transfer": {
      const [recipient, amount] = decoded.args as readonly [`0x${string}`, bigint];
      addAggregatedChange(changes, input.to, "out", amount);
      if (normalizeAddress(recipient) === normalizeAddress(input.from)) {
        addAggregatedChange(changes, input.to, "in", amount);
      }
      break;
    }
    case "transferFrom": {
      const [sender, recipient, amount] = decoded.args as readonly [
        `0x${string}`,
        `0x${string}`,
        bigint,
      ];
      if (normalizeAddress(sender) === normalizeAddress(input.from)) {
        addAggregatedChange(changes, input.to, "out", amount);
      }
      if (normalizeAddress(recipient) === normalizeAddress(input.from)) {
        addAggregatedChange(changes, input.to, "in", amount);
      }
      break;
    }
    case "approve":
    case "permit":
      break;
    case "permitTransferFrom": {
      const [permitValue, transferDetails, owner] = decoded.args as readonly [
        unknown,
        unknown,
        `0x${string}`,
        Hex,
      ];
      const permitted = readRecordField<Record<string, unknown>>(permitValue, "permitted");
      const token = readRecordField<string>(permitted, "token");
      const requestedAmount = readRecordField<bigint>(transferDetails, "requestedAmount");
      const recipient = readRecordField<string>(transferDetails, "to");

      if (token && requestedAmount !== undefined) {
        if (normalizeAddress(owner) === normalizeAddress(input.from)) {
          addAggregatedChange(
            changes,
            assertAddress(token, "permit.permitted.token"),
            "out",
            requestedAmount
          );
        }
        if (recipient && normalizeAddress(recipient) === normalizeAddress(input.from)) {
          addAggregatedChange(
            changes,
            assertAddress(token, "permit.permitted.token"),
            "in",
            requestedAmount
          );
        }
      }
      break;
    }
    case "deposit": {
      if (input.value > 0n) {
        addAggregatedChange(changes, input.to, "in", input.value);
      }
      break;
    }
    case "withdraw": {
      const [amount] = decoded.args as readonly [bigint];
      addAggregatedChange(changes, input.to, "out", amount);
      addAggregatedChange(changes, NATIVE_ASSET_ADDRESS, "in", amount);
      break;
    }
    case "exactInputSingle": {
      const [params] = decoded.args as readonly [unknown];
      const tokenIn = readRecordField<string>(params, "tokenIn");
      const tokenOut = readRecordField<string>(params, "tokenOut");
      const amountIn = readRecordField<bigint>(params, "amountIn");
      const amountOutMinimum = readRecordField<bigint>(params, "amountOutMinimum");
      const recipient = readRecordField<string>(params, "recipient");

      if (tokenIn && amountIn !== undefined) {
        addAggregatedChange(changes, assertAddress(tokenIn, "params.tokenIn"), "out", amountIn);
      }
      if (
        tokenOut &&
        amountOutMinimum !== undefined &&
        recipient &&
        normalizeAddress(recipient) === normalizeAddress(input.from)
      ) {
        addAggregatedChange(
          changes,
          assertAddress(tokenOut, "params.tokenOut"),
          "in",
          amountOutMinimum
        );
      }
      break;
    }
    case "exactInput": {
      const [params] = decoded.args as readonly [unknown];
      const path = readRecordField<Hex>(params, "path");
      const amountIn = readRecordField<bigint>(params, "amountIn");
      const amountOutMinimum = readRecordField<bigint>(params, "amountOutMinimum");
      const recipient = readRecordField<string>(params, "recipient");
      const tokens = path ? readPathEndpoints(path) : null;

      if (tokens && amountIn !== undefined) {
        addAggregatedChange(changes, tokens.tokenIn, "out", amountIn);
      }
      if (
        tokens &&
        amountOutMinimum !== undefined &&
        recipient &&
        normalizeAddress(recipient) === normalizeAddress(input.from)
      ) {
        addAggregatedChange(changes, tokens.tokenOut, "in", amountOutMinimum);
      }
      break;
    }
  }
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
      token: (token?.address ?? tokenAddress) as `0x${string}`,
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

  const chainAccess = new ChainAccess();
  const publicClient = chainAccess.createPublicClient(input.chainId);
  const tx = {
    account: assertAddress(input.from, "from"),
    to: assertAddress(input.to, "to"),
    data: assertHex(input.data, "data"),
    value: input.value ? BigInt(input.value) : 0n,
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
      setCachedTraceSupport(input.chainId, true);

      if (isUsableTrace(trace)) {
        collectTraceChanges(trace, normalizeAddress(tx.account), changes);
        return {
          success: true,
          gasEstimate: gasEstimate.toString(),
          balanceChanges: await resolveBalanceChanges(input.chainId, changes),
        };
      }
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
    decodeFallbackBalanceChanges(decodedTx, changes);
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
