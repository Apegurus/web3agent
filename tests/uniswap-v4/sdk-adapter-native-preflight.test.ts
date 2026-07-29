import { describe, expect, it, vi } from "vitest";

import type { UniswapV4PoolKey } from "../../src/api/types.js";

const { addCallParameters } = vi.hoisted(() => ({ addCallParameters: vi.fn() }));

vi.mock("@uniswap/v4-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uniswap/v4-sdk")>();
  return {
    ...actual,
    V4PositionManager: {
      ...actual.V4PositionManager,
      addCallParameters,
    },
  };
});

const { buildPositionManagerCalldata } = await import("../../src/uniswap-v4/sdk-adapter-api.js");

const poolKey = {
  currency0: {
    kind: "erc20" as const,
    chainId: 1,
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    symbol: "DAI",
    name: "DAI Stablecoin",
    decimals: 18,
  },
  currency1: {
    kind: "erc20" as const,
    chainId: 1,
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  fee: 500,
  tickSpacing: 10,
  hooks: "0x0000000000000000000000000000000000000000",
} satisfies UniswapV4PoolKey;

describe("Uniswap v4 native-value preflight", () => {
  it("Given an impossible ERC-20 native value When planning a mint Then it rejects before PositionManager.addCallParameters", () => {
    addCallParameters.mockClear();

    expect(() =>
      buildPositionManagerCalldata({
        kind: "mint",
        poolKey,
        sqrtPriceX96: 79228162514264337593543n,
        liquidity: 99999999999999999976n,
        tickCurrent: -276325,
        tickLower: -276340,
        tickUpper: -276300,
        slippageBps: 100,
        deadline: 123n,
        recipient: "0x0000000000000000000000000000000000000003",
        nativeValue: 1n,
      })
    ).toThrow("native value must exactly match");
    expect(addCallParameters).not.toHaveBeenCalled();
  });
});
