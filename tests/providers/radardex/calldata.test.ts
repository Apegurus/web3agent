import { type Address, decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { RADARDEX_ABIS, RADARDEX_ARC } from "../../../src/providers/radardex/manifest.js";
import type { RadarRoute, V4Key } from "../../../src/providers/radardex/schemas.js";
import { buildSwapTransaction } from "../../../src/providers/radardex/transactions.js";

const TOKEN_A = "0x1111111111111111111111111111111111111111" satisfies Address;
const TOKEN_B = "0x2222222222222222222222222222222222222222" satisfies Address;
const ACCOUNT = "0x3333333333333333333333333333333333333333" satisfies Address;

function baseRoute(execution: RadarRoute["execution"]): RadarRoute {
  return {
    id: "route",
    family: execution.kind === "v3_direct" ? "v3_direct" : execution.kind,
    label: "route",
    fromToken: TOKEN_A,
    toToken: TOKEN_B,
    grossInput: 1_000n,
    netInput: 997n,
    expectedOutput: 2_000n,
    spender: RADARDEX_ARC.routers.v3Fee,
    feeBps: 30,
    executable: true,
    path: [TOKEN_A, TOKEN_B],
    execution,
  };
}

describe("RadarDEX calldata", () => {
  it.each([
    {
      execution: { kind: "v3_direct" as const, poolFee: 500 },
      abi: RADARDEX_ABIS.v3FeeRouter,
      functionName: "swapExactInput",
      target: RADARDEX_ARC.routers.v3Fee,
    },
    {
      execution: { kind: "v3_multihop" as const, encodedPath: "0x1234" as const },
      abi: RADARDEX_ABIS.v3MultihopRouter,
      functionName: "swapExactInputPath",
      target: RADARDEX_ARC.routers.v3MultihopFee,
    },
    {
      execution: { kind: "v2" as const, router: RADARDEX_ARC.v2Routers.dyor },
      abi: RADARDEX_ABIS.v2FeeRouter,
      functionName: "swapExactInputV2",
      target: RADARDEX_ARC.routers.v2Fee,
    },
    {
      execution: {
        kind: "v4_direct" as const,
        poolFee: 500,
        tickSpacing: 10,
        hooks: RADARDEX_ARC.zeroAddress,
      },
      abi: RADARDEX_ABIS.v4FeeRouter,
      functionName: "swapExactInputV4",
      target: RADARDEX_ARC.routers.v4Fee,
    },
    {
      execution: { kind: "synthra" as const, poolFee: 500, encodedPath: "0x1234" as const },
      abi: RADARDEX_ABIS.synthraRouter,
      functionName: "exactInput",
      target: RADARDEX_ARC.routers.synthra,
    },
  ])(
    "builds $functionName calldata for an independently executable route",
    ({ execution, abi, functionName, target }) => {
      // Given
      const route = baseRoute(execution);

      // When
      const transaction = buildSwapTransaction(route, ACCOUNT, 1_900n);
      const decoded = decodeFunctionData({ abi, data: transaction.data });

      // Then
      expect(transaction.to).toBe(target);
      expect(transaction.value).toBe(0n);
      expect(decoded.functionName).toBe(functionName);
    }
  );

  it("builds atomic V4 multihop calldata", () => {
    // Given
    const key = {
      currency0: TOKEN_A,
      currency1: RADARDEX_ARC.usdc,
      fee: 500,
      tickSpacing: 10,
      hooks: RADARDEX_ARC.zeroAddress,
    } satisfies V4Key;
    const route = baseRoute({
      kind: "v4_multihop",
      hub: RADARDEX_ARC.usdc,
      key1: key,
      zeroForOne1: true,
      key2: { ...key, currency0: RADARDEX_ARC.usdc, currency1: TOKEN_B },
      zeroForOne2: true,
    });

    // When
    const transaction = buildSwapTransaction(route, ACCOUNT, 1_900n);
    const decoded = decodeFunctionData({
      abi: RADARDEX_ABIS.v4MultihopRouter,
      data: transaction.data,
    });

    // Then
    expect(transaction.to).toBe(RADARDEX_ARC.routers.v4MultihopFee);
    expect(decoded.functionName).toBe("swapV4Multihop");
  });

  it.each([
    {
      direction: "native_to_token" as const,
      functionName: "swapNativeForToken",
      value: 1_000_000_000_000_000n,
    },
    { direction: "token_to_native" as const, functionName: "swapTokenForNative", value: 0n },
  ])("builds $direction V4 native calldata and value", ({ direction, functionName, value }) => {
    // Given
    const route = baseRoute({
      kind: "v4_native",
      direction,
      token: TOKEN_A,
      poolFee: 500,
      tickSpacing: 10,
      hooks: RADARDEX_ARC.zeroAddress,
      nativeValue: value,
    });

    // When
    const transaction = buildSwapTransaction(route, ACCOUNT, 1_900n);
    const decoded = decodeFunctionData({
      abi: RADARDEX_ABIS.v4NativeRouter,
      data: transaction.data,
    });

    // Then
    expect(decoded.functionName).toBe(functionName);
    expect(transaction.value).toBe(value);
  });
});
