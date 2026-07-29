import { describe, expect, it } from "vitest";

import type { UniswapV4PoolKey } from "../../src/api/types.js";
import { planUniswapV4Add } from "../../src/uniswap-v4/index.js";
import { getPoolIdentity } from "../../src/uniswap-v4/sdk-adapter-api.js";
import { createFixtureReader, deployment, poolKey, sourceBlock } from "./state-fixtures.js";

const ACCOUNT = "0x5555555555555555555555555555555555555555" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;
const TOKEN_TWO = "0x6666666666666666666666666666666666666666" as const;

function serialize(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item
  );
}

describe("Uniswap v4 add planner fixture driver", () => {
  it("Given fixture-backed native mint and ERC-20 increase requests, when preparing plans, then emits serialized ordered action facts", async () => {
    const reader = createFixtureReader();
    const nativePool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const nativePosition = await reader.readPositionSnapshot({
      poolKey,
      sourceBlock,
      tokenId: "42",
    });
    const nativeMint = planUniswapV4Add({
      account: ACCOUNT,
      allowances: [
        {
          erc20Amount: 0n,
          permit2: { amount: 0n, expiration: 0n, nonce: 7n },
          sourceBlock,
          token: TOKEN,
        },
      ],
      deployment,
      operation: {
        account: ACCOUNT,
        amount0Max: "100",
        amount1Max: "100",
        chainId: 4663,
        createPool: false,
        deadline: "2000000000",
        hookData: "0x",
        kind: "mint",
        liquidity: "10",
        poolKey,
        slippageBps: 100,
        sourceBlock,
        tickLower: -120,
        tickUpper: 120,
      },
      pool: nativePool,
    });
    const erc20PoolKey = {
      currency0: { ...poolKey.currency1 },
      currency1: {
        address: TOKEN_TWO,
        chainId: 4663,
        decimals: 18,
        kind: "erc20" as const,
        name: "Fixture Token Two",
        symbol: "FIX2",
      },
      fee: 500,
      hooks: "0x0000000000000000000000000000000000000000",
      tickSpacing: 60,
    } satisfies UniswapV4PoolKey;
    const identity = getPoolIdentity(erc20PoolKey);
    const erc20Increase = planUniswapV4Add({
      account: ACCOUNT,
      allowances: [
        {
          erc20Amount: 0n,
          permit2: { amount: 0n, expiration: 0n, nonce: 7n },
          sourceBlock,
          token: TOKEN,
        },
        {
          erc20Amount: 0n,
          permit2: { amount: 0n, expiration: 0n, nonce: 7n },
          sourceBlock,
          token: TOKEN_TWO,
        },
      ],
      deployment,
      operation: {
        account: ACCOUNT,
        amount0Max: "100",
        amount1Max: "100",
        chainId: 4663,
        deadline: "2000000000",
        hookData: "0x",
        kind: "increase",
        liquidity: "10",
        poolKey: erc20PoolKey,
        slippageBps: 100,
        sourceBlock,
        tickLower: -120,
        tickUpper: 120,
        tokenId: "42",
      },
      pool: { ...nativePool, dynamicFee: false, pool: identity },
      position: { ...nativePosition, pool: identity },
    });

    process.stderr.write(
      `[uniswap-v4-planner-driver] ${serialize({ nativeMint, erc20Increase })}\n`
    );
    expect(nativeMint.actions.map((action) => action.kind)).toEqual([
      "erc20Approval",
      "permit2Signature",
      "positionManager",
    ]);
    expect(erc20Increase.actions.map((action) => action.kind)).toEqual([
      "erc20Approval",
      "erc20Approval",
      "permit2Signature",
      "positionManager",
    ]);
  });
});
