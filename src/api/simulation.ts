import { numberToHex } from "viem";
import { createPublicClientForRuntimeChain } from "../operations/chain-access.js";
import {
  assertAddress,
  assertChainSupported,
  assertHex,
  parseBigIntString,
} from "../operations/validation.js";
import { normalizeAddress } from "../utils/address.js";
import { Web3AgentError } from "./errors.js";
import { transactionSimulateSchema } from "./schemas.js";
import { decodeFallbackBalanceChanges } from "./simulation/fallback-decoder.js";
import {
  type TraceCallNode,
  addAggregatedChange,
  collectTraceChanges,
  extractErrorMessage,
  getCachedTraceSupport,
  isDebugTraceUnsupported,
  isUsableTrace,
  resolveBalanceChanges,
  setCachedTraceSupport,
} from "./simulation/trace-support.js";
import type { SimulateTransactionInput, SimulationResult } from "./types.js";
import { parseInput } from "./validation.js";

export {
  clearTraceSupportCache,
  isUsableTrace,
  parseNumericValue,
} from "./simulation/trace-support.js";

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
          balanceChanges: resolveBalanceChanges(input.chainId, changes),
          balanceChangesSource: "trace",
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
    balanceChanges: resolveBalanceChanges(input.chainId, changes),
    balanceChangesSource: "fallback",
  };
}
