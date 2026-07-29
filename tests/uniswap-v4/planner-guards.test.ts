import { describe, expect, it } from "vitest";

import type { UniswapV4MintOperation } from "../../src/api/types.js";
import { planUniswapV4Add } from "../../src/uniswap-v4/planner.js";
import { createFixtureReader, deployment, poolKey, sourceBlock } from "./state-fixtures.js";

const ACCOUNT = "0x5555555555555555555555555555555555555555" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;

function mintOperation(overrides: Partial<UniswapV4MintOperation> = {}): UniswapV4MintOperation {
  return {
    account: ACCOUNT,
    amount0Max: "100",
    amount1Max: "100",
    chainId: 4663,
    createPool: false,
    deadline: "2000000000",
    hookData: "0x",
    kind: "mint" as const,
    liquidity: "10",
    poolKey,
    slippageBps: 100,
    sourceBlock,
    tickLower: -120,
    tickUpper: 120,
    ...overrides,
  };
}

describe("Uniswap v4 add planner guards", () => {
  it("Given a stale deadline, when planning, then rejects before emitting actions", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });

    expect(() =>
      planUniswapV4Add({
        account: ACCOUNT,
        allowances: [],
        deployment,
        now: 2000000000n,
        operation: mintOperation(),
        pool,
      })
    ).toThrow(/deadline/i);
  });

  it("Given non-empty hook data without a hook, when planning, then rejects before emitting actions", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });

    expect(() =>
      planUniswapV4Add({
        account: ACCOUNT,
        allowances: [],
        deployment,
        operation: mintOperation({
          hookData: "0x01",
          poolKey: { ...poolKey, hooks: "0x0000000000000000000000000000000000000000" },
        }),
        pool,
      })
    ).toThrow(/Hook data/i);
  });

  it("Given an uninitialized pool without explicit creation, when planning, then rejects before emitting actions", async () => {
    const reader = createFixtureReader({ sqrtPriceX96: 0n });
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });

    expect(() =>
      planUniswapV4Add({
        account: ACCOUNT,
        allowances: [],
        deployment,
        operation: mintOperation(),
        pool,
      })
    ).toThrow(/initialization/i);
  });

  it("Given insufficient native maxima, when planning, then rejects before emitting actions", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });

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
        deployment,
        operation: mintOperation({ amount0Max: "0" }),
        pool,
      })
    ).toThrow(/amount limits/i);
  });

  it("Given a non-canonical Permit2 deployment, when planning, then rejects before emitting actions", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });

    expect(() =>
      planUniswapV4Add({
        account: ACCOUNT,
        allowances: [],
        deployment: { ...deployment, permit2: ACCOUNT },
        operation: mintOperation(),
        pool,
      })
    ).toThrow(/canonical Permit2/i);
  });

  it("Given an expired Permit2 allowance, when planning, then retains the Permit2 signature prerequisite", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });

    const plan = planUniswapV4Add({
      account: ACCOUNT,
      allowances: [
        {
          erc20Amount: 100n,
          permit2: { amount: 100n, expiration: 1n, nonce: 7n },
          sourceBlock,
          token: TOKEN,
        },
      ],
      deployment,
      operation: mintOperation(),
      pool,
    });

    expect(plan.actions.map((action) => action.kind)).toEqual([
      "permit2Signature",
      "positionManager",
    ]);
  });
});
