import { describe, expect, it } from "vitest";

import type { UniswapV4BurnOperation, UniswapV4DecreaseOperation } from "../../src/api/types.js";
import { planUniswapV4Remove } from "../../src/uniswap-v4/index.js";
import { buildPositionManagerCalldata } from "../../src/uniswap-v4/sdk-adapter-api.js";
import { OWNER, createFixtureReader, deployment, poolKey, sourceBlock } from "./state-fixtures.js";

const ACCOUNT = "0x5555555555555555555555555555555555555555" as const;

describe("Uniswap v4 remove planner", () => {
  it("Given a pinned owned position, when decreasing 25%, then emits official calldata with explicit recipient, minimums, hook data, and partial deltas", async () => {
    const { pool, position } = await fixture();

    const plan = planUniswapV4Remove({
      account: OWNER,
      deployment,
      operation: removal({ kind: "decrease", liquidityBps: 2500, recipient: OWNER }),
      pool,
      position,
    });

    expect(plan.actions.map((action) => action.kind)).toEqual(["positionManager"]);
    expect(plan.recipient).toBe(OWNER);
    expect(plan.minimums).toEqual({ amount0: 0n, amount1: 0n });
    expect(plan.expectedDeltas).toMatchObject({
      kind: "decrease",
      liquidityDelta: "-19",
      positionLiquidityAfter: "58",
      positionLiquidityBefore: "77",
      rounding: "floor",
    });
    expect(plan.actions[0]).toMatchObject({
      data: buildPositionManagerCalldata({
        deadline: 2000000000n,
        hookData: "0x1234",
        kind: "decrease",
        liquidity: 77n,
        liquidityBps: 2500,
        nativeValue: 0n,
        poolKey,
        recipient: OWNER,
        slippageBps: 100,
        sqrtPriceX96: BigInt(pool.sqrtPriceX96),
        tickCurrent: pool.tick,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        tokenId: 42n,
      }).calldata,
      to: deployment.positionManager,
      value: 0n,
    });
  });

  it("Given an owned zero-liquidity position, when collecting, then emits collect calldata to the explicit recipient and preserves zero liquidity", async () => {
    const { pool, position } = await fixture({ liquidity: 0n, positionManagerLiquidity: 0n });

    const plan = planUniswapV4Remove({
      account: OWNER,
      deployment,
      operation: {
        account: OWNER,
        chainId: 4663,
        deadline: "2000000000",
        hookData: "0x1234",
        kind: "collect",
        poolKey,
        recipient: ACCOUNT,
        slippageBps: 100,
        sourceBlock,
        tokenId: "42",
      },
      pool,
      position,
    });

    expect(plan.actions.map((action) => action.kind)).toEqual(["positionManager"]);
    expect(plan.recipient).toBe(ACCOUNT);
    expect(plan.expectedDeltas).toMatchObject({
      kind: "collect",
      liquidityDelta: "0",
      positionLiquidityAfter: "0",
    });
  });

  it("Given a full owned exit without burn, when planning, then keeps the NFT and reaches zero post-plan liquidity", async () => {
    const { pool, position } = await fixture();

    const plan = planUniswapV4Remove({
      account: OWNER,
      deployment,
      operation: removal({ kind: "decrease", liquidityBps: 10_000, recipient: OWNER }),
      pool,
      position,
    });

    expect(plan.nftPermit).toBeUndefined();
    expect(plan.expectedDeltas).toMatchObject({
      kind: "decrease",
      positionLiquidityAfter: "0",
      positionLiquidityBefore: "77",
    });
  });

  it("Given removal liquidity inconsistent with its percentage, when planning, then rejects the ambiguous request", async () => {
    const { pool, position } = await fixture();

    expect(() =>
      planUniswapV4Remove({
        account: OWNER,
        deployment,
        operation: {
          ...removal({ kind: "decrease", liquidityBps: 2500, recipient: OWNER }),
          liquidity: "77",
        },
        pool,
        position,
      })
    ).toThrow("liquidity must equal");
  });

  it("Given an owner full exit, when burning, then emits official burn calldata and reports the NFT as removed", async () => {
    const { pool, position } = await fixture();

    const plan = planUniswapV4Remove({
      account: OWNER,
      deployment,
      operation: removal({ kind: "burn", liquidityBps: 10_000, recipient: OWNER }),
      pool,
      position,
    });

    expect(plan.expectedNftState).toBe("burned");
    expect(plan.expectedDeltas).toMatchObject({ kind: "burn", positionLiquidityAfter: "0" });
  });
});

async function fixture(
  options: { readonly liquidity?: bigint; readonly positionManagerLiquidity?: bigint } = {}
) {
  const reader = createFixtureReader(options);
  return {
    pool: await reader.readPoolSnapshot({ poolKey, sourceBlock }),
    position: await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" }),
  };
}

function removal(input: {
  readonly account?: typeof ACCOUNT | typeof OWNER;
  readonly kind: "decrease";
  readonly liquidityBps: number;
  readonly recipient: typeof ACCOUNT | typeof OWNER;
}): UniswapV4DecreaseOperation;

function removal(input: {
  readonly account?: typeof ACCOUNT | typeof OWNER;
  readonly kind: "burn";
  readonly liquidityBps: number;
  readonly recipient: typeof ACCOUNT | typeof OWNER;
}): UniswapV4BurnOperation;
function removal(input: {
  readonly account?: typeof ACCOUNT | typeof OWNER;
  readonly kind: "burn" | "decrease";
  readonly liquidityBps: number;
  readonly recipient: typeof ACCOUNT | typeof OWNER;
}): UniswapV4DecreaseOperation | UniswapV4BurnOperation {
  if (input.kind === "decrease") {
    return {
      account: input.account ?? OWNER,
      amount0Min: "0",
      amount1Min: "0",
      chainId: 4663,
      deadline: "2000000000",
      hookData: "0x1234",
      kind: "decrease",
      liquidity: ((77n * BigInt(input.liquidityBps)) / 10_000n).toString(),
      liquidityBps: input.liquidityBps,
      poolKey,
      recipient: input.recipient,
      slippageBps: 100,
      sourceBlock,
      tokenId: "42",
    };
  }
  return {
    account: input.account ?? OWNER,
    amount0Min: "0",
    amount1Min: "0",
    chainId: 4663,
    deadline: "2000000000",
    hookData: "0x1234",
    kind: "burn",
    liquidity: ((77n * BigInt(input.liquidityBps)) / 10_000n).toString(),
    liquidityBps: input.liquidityBps,
    poolKey,
    recipient: input.recipient,
    slippageBps: 100,
    sourceBlock,
    tokenId: "42",
  };
}
