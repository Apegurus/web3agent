import { type Hex, decodeFunctionData, parseAbi } from "viem";
import { assertAddress } from "../../operations/validation.js";
import { normalizeAddress } from "../../utils/address.js";
import type { BalanceChange } from "../types.js";

export const NATIVE_ASSET_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

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

interface FallbackDecodeInput {
  from: Hex;
  to: Hex;
  data: Hex;
  value: bigint;
}

interface FallbackChange {
  token: Hex;
  direction: BalanceChange["direction"];
  amount: bigint;
}

function readRecordField<T>(value: unknown, field: string): T | undefined {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[field] as T | undefined;
}

function readPathEndpoints(path: Hex): { tokenIn: Hex; tokenOut: Hex } | null {
  const raw = path.slice(2);
  if (raw.length < 40) return null;

  const tokenIn = `0x${raw.slice(0, 40)}` as Hex;
  const tokenOut = `0x${raw.slice(raw.length - 40)}` as Hex;
  return { tokenIn, tokenOut };
}

function pushChange(
  changes: FallbackChange[],
  token: Hex,
  direction: BalanceChange["direction"],
  amount: bigint
): void {
  if (amount <= 0n) return;
  changes.push({ token, direction, amount });
}

// Best-effort preview path for RPCs that do not support debug_traceCall.
export function decodeFallbackBalanceChanges(input: FallbackDecodeInput): FallbackChange[] {
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
  } catch {
    // Unrecognized selector — no balance changes can be inferred.
    return [];
  }

  const changes: FallbackChange[] = [];

  if (input.value > 0n) {
    pushChange(changes, NATIVE_ASSET_ADDRESS, "out", input.value);
  }

  switch (decoded.functionName) {
    case "transfer": {
      const [recipient, amount] = decoded.args as readonly [Hex, bigint];
      pushChange(changes, input.to, "out", amount);
      if (normalizeAddress(recipient) === normalizeAddress(input.from)) {
        pushChange(changes, input.to, "in", amount);
      }
      break;
    }
    case "transferFrom": {
      const [sender, recipient, amount] = decoded.args as readonly [Hex, Hex, bigint];
      if (normalizeAddress(sender) === normalizeAddress(input.from)) {
        pushChange(changes, input.to, "out", amount);
      }
      if (normalizeAddress(recipient) === normalizeAddress(input.from)) {
        pushChange(changes, input.to, "in", amount);
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
        Hex,
        Hex,
      ];
      const permitted = readRecordField<Record<string, unknown>>(permitValue, "permitted");
      const token = readRecordField<string>(permitted, "token");
      const requestedAmount = readRecordField<bigint>(transferDetails, "requestedAmount");
      const recipient = readRecordField<string>(transferDetails, "to");

      if (token && requestedAmount !== undefined) {
        if (normalizeAddress(owner) === normalizeAddress(input.from)) {
          pushChange(
            changes,
            assertAddress(token, "permit.permitted.token"),
            "out",
            requestedAmount
          );
        }
        if (recipient && normalizeAddress(recipient) === normalizeAddress(input.from)) {
          pushChange(
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
        pushChange(changes, input.to, "in", input.value);
      }
      break;
    }
    case "withdraw": {
      const [amount] = decoded.args as readonly [bigint];
      pushChange(changes, input.to, "out", amount);
      pushChange(changes, NATIVE_ASSET_ADDRESS, "in", amount);
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
        pushChange(changes, assertAddress(tokenIn, "params.tokenIn"), "out", amountIn);
      }
      if (
        tokenOut &&
        amountOutMinimum !== undefined &&
        recipient &&
        normalizeAddress(recipient) === normalizeAddress(input.from)
      ) {
        pushChange(changes, assertAddress(tokenOut, "params.tokenOut"), "in", amountOutMinimum);
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
        pushChange(changes, tokens.tokenIn, "out", amountIn);
      }
      if (
        tokens &&
        amountOutMinimum !== undefined &&
        recipient &&
        normalizeAddress(recipient) === normalizeAddress(input.from)
      ) {
        pushChange(changes, tokens.tokenOut, "in", amountOutMinimum);
      }
      break;
    }
  }

  return changes;
}
