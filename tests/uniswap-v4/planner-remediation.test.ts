import { describe, expect, it } from "vitest";

import type { UniswapV4MintOperation } from "../../src/api/types.js";
import { planUniswapV4Add } from "../../src/uniswap-v4/index.js";
import { buildPositionManagerCalldata } from "../../src/uniswap-v4/sdk-adapter-api.js";
import { createFixtureReader, deployment, poolKey, sourceBlock } from "./state-fixtures.js";

const ACCOUNT = "0x5555555555555555555555555555555555555555" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;
const INITIAL_SQRT_PRICE_X96_AT_TICK_60 = "79466191966197645195421774833";

describe("Uniswap v4 add planner remediation", () => {
  it("Given a caller-supplied deployment substitution, when planning a native/ERC-20 mint, then rejects every noncanonical contract before creating a Permit2 signature", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });

    for (const contract of ["poolManager", "positionManager", "stateView", "permit2"] as const) {
      expect(() =>
        planUniswapV4Add({
          account: ACCOUNT,
          allowances: [
            {
              erc20Amount: 0n,
              permit2: { amount: 0n, expiration: 0n, nonce: 7n },
              sourceBlock,
              token: TOKEN,
            },
          ],
          deployment: { ...deployment, [contract]: ACCOUNT },
          operation: mintOperation({ createPool: false }),
          pool,
        })
      ).toThrow(`canonical ${contract}`);
    }
  });

  it("Given an uninitialized pool with a nonzero caller tick, when explicitly creating it, then rejects the inconsistent snapshot", async () => {
    const reader = createFixtureReader({ sqrtPriceX96: 0n });
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });

    expect(() =>
      planUniswapV4Add({
        account: ACCOUNT,
        allowances: [
          {
            erc20Amount: 100n,
            permit2: { amount: 100n, expiration: 2000000000n, nonce: 7n },
            sourceBlock,
            token: TOKEN,
          },
        ],
        deployment,
        operation: mintOperation({ createPool: true }),
        pool: { ...pool, tick: 1 },
      })
    ).toThrow(/uninitialized pool snapshot/);
  });

  it("Given a non-tick-zero initial price and an uninitialized pool, when explicitly creating a native/ERC-20 pool, then derives tick 60 for final calldata and deltas", async () => {
    const reader = createFixtureReader({ sqrtPriceX96: 0n });
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });

    const plan = planUniswapV4Add({
      account: ACCOUNT,
      allowances: [
        {
          erc20Amount: 100n,
          permit2: { amount: 100n, expiration: 2000000000n, nonce: 7n },
          sourceBlock,
          token: TOKEN,
        },
      ],
      deployment,
      operation: mintOperation({ createPool: true }),
      pool,
    });
    const finalAction = plan.actions[1];
    if (finalAction?.kind !== "positionManager") {
      throw new Error("Expected final PositionManager action");
    }

    expect(finalAction).toMatchObject({
      data: buildPositionManagerCalldata({
        deadline: 2000000000n,
        hookData: "0x",
        kind: "mint",
        liquidity: 10n,
        nativeValue: 1n,
        poolKey,
        recipient: ACCOUNT,
        slippageBps: 100,
        sqrtPriceX96: BigInt(INITIAL_SQRT_PRICE_X96_AT_TICK_60),
        tickCurrent: 60,
        tickLower: -120,
        tickUpper: 120,
      }).calldata,
    });
    expect(plan.expectedDeltas.liquidityDelta).toBe("10");
  });
});

function mintOperation(input: { readonly createPool: boolean }): UniswapV4MintOperation {
  return {
    account: ACCOUNT,
    amount0Max: "100",
    amount1Max: "100",
    chainId: 4663,
    createPool: input.createPool,
    deadline: "2000000000",
    hookData: "0x" as const,
    ...(input.createPool ? { initializeSqrtPriceX96: INITIAL_SQRT_PRICE_X96_AT_TICK_60 } : {}),
    kind: "mint" as const,
    liquidity: "10",
    poolKey,
    slippageBps: 100,
    sourceBlock,
    tickLower: -120,
    tickUpper: 120,
  };
}
