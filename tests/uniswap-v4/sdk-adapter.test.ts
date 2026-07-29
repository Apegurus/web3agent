import { describe, expect, it } from "vitest";

import type { UniswapV4PoolKey } from "../../src/api/types.js";
import {
  buildPermit2Batch,
  buildPositionManagerCalldata,
  getPoolIdentity,
  getPositionAmounts,
  validatePositionTicks,
} from "../../src/uniswap-v4/sdk-adapter-api.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MALFORMED_HOOKS: `0x${string}` = "0x1234";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const RECIPIENT = "0x0000000000000000000000000000000000000003";
const poolKey = {
  currency0: {
    kind: "erc20" as const,
    chainId: 1,
    address: DAI,
    symbol: "DAI",
    name: "DAI Stablecoin",
    decimals: 18,
  },
  currency1: {
    kind: "erc20" as const,
    chainId: 1,
    address: USDC,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  fee: 100,
  tickSpacing: 10,
  hooks: ZERO_ADDRESS,
} satisfies UniswapV4PoolKey;

const positionInput = {
  poolKey,
  sqrtPriceX96: 79228162514264337593543950336n,
  liquidity: 100000000000000000000000n,
  tickCurrent: 0,
  tickLower: -120,
  tickUpper: 120,
};

describe("Uniswap v4 SDK adapter", () => {
  it("returns the pinned 2.3.0 canonical PoolKey and PoolId without SDK classes", () => {
    // Given: the PoolId vector in sdks/v4-sdk/src/entities/pool.test.ts at ab3a18a.
    // When: a schema-native key is adapted.
    const identity = getPoolIdentity(poolKey);

    // Then: currencies are canonical and the PoolId is the pinned release vector.
    expect(identity).toEqual({
      poolKey,
      poolId: "0x503fb8d73fd2351c645ae9fea85381bac6b16ea0c2038e14dc1e96d447c8ffbb",
    });
  });

  it("uses official SDK position amounts and slippage rounding as bigint records", () => {
    // Given: the pinned position.test.ts zero-slippage in-range vector.
    const amounts = getPositionAmounts({
      poolKey: { ...poolKey, fee: 500 },
      sqrtPriceX96: 79228162514264337593543n,
      liquidity: 99999999999999999976n,
      tickCurrent: -276325,
      tickLower: -276340,
      tickUpper: -276300,
      slippageBps: 0,
    });

    // Then: the values are bigint-only and agree with the official slippage semantics.
    expect(amounts.mintMaximum).toEqual({
      amount0: 120054069145287995740584n,
      amount1: 79831926243n,
    });
  });

  it("rejects invalid hooks, unordered currencies, ticks, zero liquidity, partial burns, and native-value mismatches before calldata", () => {
    // Given: malformed lifecycle and PoolKey inputs.
    const malformedHooks = { ...poolKey, hooks: MALFORMED_HOOKS };

    // When / Then: boundary guards fail before an SDK transaction is returned.
    expect(() => getPoolIdentity(malformedHooks)).toThrow("hooks must be a 20-byte address");
    expect(() =>
      getPoolIdentity({ ...poolKey, currency0: poolKey.currency1, currency1: poolKey.currency0 })
    ).toThrow("currency0 must sort strictly before currency1");
    expect(() => validatePositionTicks({ ...positionInput, tickLower: -119 })).toThrow(
      "position ticks must be ordered"
    );
    expect(() => getPositionAmounts({ ...positionInput, liquidity: 0n, slippageBps: 0 })).toThrow(
      "position liquidity must be positive"
    );
    expect(() =>
      buildPositionManagerCalldata({
        kind: "burn",
        ...positionInput,
        deadline: 123n,
        recipient: RECIPIENT,
        slippageBps: 100,
        tokenId: 1n,
        liquidityBps: 9999,
      })
    ).toThrow("burn requires 100% liquidity removal");
    expect(() =>
      buildPositionManagerCalldata({
        kind: "mint",
        ...positionInput,
        deadline: 123n,
        recipient: RECIPIENT,
        slippageBps: 100,
        nativeValue: 1n,
      })
    ).toThrow("native value must exactly match");
  });

  it("rejects malformed Permit2 spenders, cross-chain currencies, and out-of-range slippage before SDK construction", () => {
    const common = {
      ...positionInput,
      slippageBps: 100,
      spender: RECIPIENT,
      nonce: 7n,
      deadline: 123n,
    };

    expect(() => buildPermit2Batch({ ...common, spender: MALFORMED_HOOKS })).toThrow(
      "spender must be a 20-byte address"
    );
    expect(() =>
      getPositionAmounts({
        ...positionInput,
        poolKey: { ...poolKey, currency1: { ...poolKey.currency1, chainId: 4663 } },
        slippageBps: 100,
      })
    ).toThrow("pool currencies must share a chain ID");
    expect(() => getPositionAmounts({ ...positionInput, slippageBps: 10_001 })).toThrow(
      "slippageBps must be between zero and 10000"
    );
  });
});
