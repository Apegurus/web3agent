import { Web3AgentError } from "../api/errors.js";
import type { UniswapV4PoolKey } from "../api/types.js";

export type SdkPoolState = {
  readonly poolKey: UniswapV4PoolKey;
  readonly sqrtPriceX96: bigint;
  readonly liquidity: bigint;
  readonly tickCurrent: number;
};

export type SdkPositionInput = SdkPoolState & {
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly slippageBps: number;
};

export type SdkPermit2Input = SdkPositionInput & {
  readonly spender: string;
  readonly nonce: bigint;
  readonly deadline: bigint;
};

export type SdkLifecycleCommon = SdkPositionInput & {
  readonly deadline: bigint;
  readonly hookData?: string;
  readonly recipient: string;
  readonly nativeValue?: bigint;
};

export type SdkNftPermit = {
  readonly deadline: string;
  readonly nonce: string;
  readonly signature: string;
  readonly spender: string;
  readonly tokenId: string;
};

export type SdkPositionManagerInput =
  | { readonly kind: "create"; readonly poolKey: UniswapV4PoolKey; readonly sqrtPriceX96: bigint }
  | (SdkLifecycleCommon & { readonly kind: "mint" })
  | (SdkLifecycleCommon & { readonly kind: "increase"; readonly tokenId: bigint })
  | (SdkLifecycleCommon & {
      readonly kind: "decrease";
      readonly tokenId: bigint;
      readonly liquidityBps: number;
      readonly permit?: SdkNftPermit;
    })
  | (SdkLifecycleCommon & {
      readonly kind: "collect";
      readonly tokenId: bigint;
      readonly permit?: SdkNftPermit;
    })
  | (SdkLifecycleCommon & {
      readonly kind: "burn";
      readonly tokenId: bigint;
      readonly liquidityBps: number;
      readonly permit?: SdkNftPermit;
    });

const addressPattern = /^0x[0-9a-fA-F]{40}$/;

function throwInput(message: string): never {
  throw new Web3AgentError({ code: "UNISWAP_V4_SDK_INPUT_INVALID", message });
}

export function assertAddress(value: string, field: string): void {
  if (!addressPattern.test(value)) {
    throwInput(`${field} must be a 20-byte address`);
  }
}

export function assertPoolKey(poolKey: UniswapV4PoolKey): void {
  assertAddress(poolKey.hooks, "hooks");
  if (poolKey.currency0.chainId !== poolKey.currency1.chainId) {
    throwInput("pool currencies must share a chain ID");
  }
  const currency0 =
    poolKey.currency0.kind === "native"
      ? "0x0000000000000000000000000000000000000000"
      : poolKey.currency0.address.toLowerCase();
  const currency1 =
    poolKey.currency1.kind === "native"
      ? "0x0000000000000000000000000000000000000000"
      : poolKey.currency1.address.toLowerCase();
  if (currency0 >= currency1) {
    throwInput("currency0 must sort strictly before currency1");
  }
}

export function assertPositionTicks(
  input: Pick<SdkPositionInput, "poolKey" | "tickLower" | "tickUpper">
): void {
  if (
    input.tickLower >= input.tickUpper ||
    input.tickLower % input.poolKey.tickSpacing !== 0 ||
    input.tickUpper % input.poolKey.tickSpacing !== 0
  ) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_TICK_INVALID",
      message: "position ticks must be ordered and divisible by the pool tick spacing",
    });
  }
}

export function assertPositionInput(input: SdkPositionInput): void {
  assertPoolKey(input.poolKey);
  assertPositionTicks(input);
  if (input.liquidity <= 0n) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_LIQUIDITY_INVALID",
      message: "position liquidity must be positive",
    });
  }
  if (!Number.isInteger(input.slippageBps) || input.slippageBps < 0 || input.slippageBps > 10_000) {
    throwInput("slippageBps must be between zero and 10000");
  }
}

export function assertNativeValue(input: SdkLifecycleCommon, value: bigint): void {
  const usesNative = input.poolKey.currency0.kind === "native";
  const supplied = input.nativeValue ?? value;
  if ((!usesNative && supplied !== 0n) || (usesNative && supplied !== value)) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_NATIVE_VALUE_MISMATCH",
      message: "native value must exactly match the official PositionManager transaction value",
    });
  }
}
