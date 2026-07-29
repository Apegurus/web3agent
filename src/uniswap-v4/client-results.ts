import type { Address } from "viem";
import { isAddress } from "viem";

import { Web3AgentError } from "../api/errors.js";
import type { UniswapV4ReadCall } from "./client-transport.js";

export function requireTuple(value: unknown, call: UniswapV4ReadCall): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === "object") return Object.values(value);
  throw new Web3AgentError({
    code: "UNISWAP_V4_READ_INVALID_RESULT",
    details: call,
    message: `${call.functionName} returned a non-tuple result`,
  });
}

export function tupleValue(
  tuple: readonly unknown[],
  index: number,
  call: UniswapV4ReadCall
): unknown {
  const value = tuple[index];
  if (value === undefined) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_READ_INVALID_RESULT",
      details: { ...call, index },
      message: `${call.functionName} omitted result index ${index}`,
    });
  }
  return value;
}

export function requireBigint(value: unknown, call: UniswapV4ReadCall): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  throw new Web3AgentError({
    code: "UNISWAP_V4_READ_INVALID_RESULT",
    details: call,
    message: `${call.functionName} returned a non-bigint integer`,
  });
}

export function requireNumber(value: unknown, call: UniswapV4ReadCall): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_READ_INVALID_RESULT",
      details: call,
      message: `${call.functionName} returned an unsafe numeric value`,
    });
  }
  return value;
}

export function requireString(value: unknown, call: UniswapV4ReadCall): string {
  if (typeof value !== "string") {
    throw new Web3AgentError({
      code: "UNISWAP_V4_READ_INVALID_RESULT",
      details: call,
      message: `${call.functionName} returned a non-string result`,
    });
  }
  return value;
}

export function requireAddress(value: unknown, call: UniswapV4ReadCall): Address {
  const address = requireString(value, call);
  if (!isAddress(address)) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_READ_INVALID_RESULT",
      details: call,
      message: `${call.functionName} returned an invalid address`,
    });
  }
  return address;
}
