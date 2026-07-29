import { Web3AgentError } from "../api/errors.js";
import type { UniswapV4MulticallResult, UniswapV4ReadCall } from "./client-transport-types.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown viem error";
}

export function readFailure(
  call: UniswapV4ReadCall,
  blockNumber: bigint,
  error: unknown
): Web3AgentError {
  return new Web3AgentError({
    cause: error,
    code: "UNISWAP_V4_READ_REVERTED",
    details: { ...call, blockNumber, error: errorMessage(error) },
    message: `${call.contract}.${call.functionName} reverted at block ${blockNumber}`,
  });
}

function malformedMulticallResult(input: {
  readonly blockNumber: bigint;
  readonly call?: UniswapV4ReadCall;
  readonly chainId: number;
  readonly index?: number;
  readonly reason: string;
}): Web3AgentError {
  return new Web3AgentError({
    code: "UNISWAP_V4_MULTICALL_MALFORMED_RESULT",
    details: input,
    message: `Uniswap v4 multicall returned malformed data: ${input.reason}`,
  });
}

export function parseMulticallResult(input: {
  readonly blockNumber: bigint;
  readonly call: UniswapV4ReadCall;
  readonly chainId: number;
  readonly index: number;
  readonly value: unknown;
}): UniswapV4MulticallResult {
  if (!input.value || typeof input.value !== "object" || !("status" in input.value)) {
    throw malformedMulticallResult({ ...input, reason: "result entry must include a status" });
  }
  if (input.value.status === "success") {
    if (!("result" in input.value)) {
      throw malformedMulticallResult({ ...input, reason: "success result must include a result" });
    }
    return { result: input.value.result, status: "success" };
  }
  if (input.value.status === "failure") {
    if (!("error" in input.value) || !(input.value.error instanceof Error)) {
      throw malformedMulticallResult({
        ...input,
        reason: "failure result must include an Error instance",
      });
    }
    return { error: input.value.error, status: "failure" };
  }
  throw malformedMulticallResult({ ...input, reason: "result status must be success or failure" });
}

export function malformedMulticall(input: {
  readonly blockNumber: bigint;
  readonly chainId: number;
  readonly index?: number;
  readonly reason: string;
}): Web3AgentError {
  return malformedMulticallResult(input);
}
