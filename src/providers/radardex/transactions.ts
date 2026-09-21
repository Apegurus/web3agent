import { type Abi, type Address, type Hex, encodeFunctionData } from "viem";
import { RADARDEX_ABIS, RADARDEX_ARC } from "./manifest.js";
import type { RadarRoute } from "./schemas.js";

export type RadarContractCall = {
  readonly address: Address;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly value?: bigint;
};

export type RadarTransaction = {
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
};

export function buildSwapCall(
  route: RadarRoute,
  account: Address,
  minimumOutput: bigint
): RadarContractCall {
  switch (route.execution.kind) {
    case "v3_direct":
      return {
        address: RADARDEX_ARC.routers.v3Fee,
        abi: RADARDEX_ABIS.v3FeeRouter,
        functionName: "swapExactInput",
        args: [
          RADARDEX_ARC.routers.v3,
          route.fromToken,
          route.toToken,
          route.execution.poolFee,
          route.grossInput,
          minimumOutput,
        ],
      };
    case "v3_multihop":
      return {
        address: RADARDEX_ARC.routers.v3MultihopFee,
        abi: RADARDEX_ABIS.v3MultihopRouter,
        functionName: "swapExactInputPath",
        args: [
          RADARDEX_ARC.routers.v3,
          route.execution.encodedPath,
          route.grossInput,
          minimumOutput,
        ],
      };
    case "v2":
      return {
        address: RADARDEX_ARC.routers.v2Fee,
        abi: RADARDEX_ABIS.v2FeeRouter,
        functionName: "swapExactInputV2",
        args: [
          route.execution.router,
          route.fromToken,
          route.toToken,
          route.grossInput,
          minimumOutput,
        ],
      };
    case "v4_direct":
      return {
        address: RADARDEX_ARC.routers.v4Fee,
        abi: RADARDEX_ABIS.v4FeeRouter,
        functionName: "swapExactInputV4",
        args: [
          RADARDEX_ARC.routers.v4,
          route.fromToken,
          route.toToken,
          route.execution.poolFee,
          route.execution.tickSpacing,
          route.execution.hooks,
          route.grossInput,
          minimumOutput,
        ],
      };
    case "v4_native":
      if (route.execution.direction === "native_to_token") {
        return {
          address: RADARDEX_ARC.routers.v4NativeFee,
          abi: RADARDEX_ABIS.v4NativeRouter,
          functionName: "swapNativeForToken",
          args: [
            route.execution.token,
            route.execution.poolFee,
            route.execution.tickSpacing,
            route.execution.hooks,
            minimumOutput,
          ],
          value: route.execution.nativeValue,
        };
      }
      return {
        address: RADARDEX_ARC.routers.v4NativeFee,
        abi: RADARDEX_ABIS.v4NativeRouter,
        functionName: "swapTokenForNative",
        args: [
          route.execution.token,
          route.execution.poolFee,
          route.execution.tickSpacing,
          route.execution.hooks,
          route.grossInput,
          minimumOutput * 1_000_000_000_000n,
        ],
      };
    case "v4_multihop":
      return {
        address: RADARDEX_ARC.routers.v4MultihopFee,
        abi: RADARDEX_ABIS.v4MultihopRouter,
        functionName: "swapV4Multihop",
        args: [
          route.fromToken,
          route.execution.hub,
          route.toToken,
          route.grossInput,
          minimumOutput,
          route.execution.key1,
          route.execution.zeroForOne1,
          route.execution.key2,
          route.execution.zeroForOne2,
        ],
      };
    case "synthra":
      return {
        address: RADARDEX_ARC.routers.synthra,
        abi: RADARDEX_ABIS.synthraRouter,
        functionName: "exactInput",
        args: [
          {
            path: route.execution.encodedPath,
            recipient: account,
            amountIn: route.grossInput,
            amountOutMinimum: minimumOutput,
          },
        ],
      };
    default:
      return assertNever(route.execution);
  }
}

export function buildSwapTransaction(
  route: RadarRoute,
  account: Address,
  minimumOutput: bigint
): RadarTransaction {
  const call = buildSwapCall(route, account, minimumOutput);
  return {
    to: call.address,
    data: encodeFunctionData({
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
    }),
    value: call.value ?? 0n,
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported RadarDEX execution variant: ${String(value)}`);
}
