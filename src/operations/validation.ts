import { type Hex, isAddress, isHex } from "viem";
import { Web3AgentError } from "../api/errors.js";
import { getChainById } from "../chains/registry.js";

export function assertChainSupported(chainId: number) {
  const chain = getChainById(chainId);
  if (!chain) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: `Unsupported chain ID: ${chainId}`,
    });
  }
  return chain;
}

export function assertHex(value: string, field: string): Hex {
  if (!isHex(value)) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `${field} must be a valid 0x-prefixed hex string`,
    });
  }
  return value;
}

export function assertAddress(value: string, field: string): Hex {
  if (!isAddress(value)) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `${field} must be a valid EVM address`,
    });
  }
  return value;
}

export function assertRecord(
  value: unknown,
  field: string,
  code = "INVALID_PARAMS"
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Web3AgentError({
      code,
      message: `${field} must be an object`,
    });
  }
  return value as Record<string, unknown>;
}

export function assertInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `${field} must be an integer`,
    });
  }

  return value;
}

export function parseBigIntString(value: string, field: string): bigint {
  try {
    return BigInt(value);
  } catch (error: unknown) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `${field} must be a valid integer string`,
      cause: error,
    });
  }
}
