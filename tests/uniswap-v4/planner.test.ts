import { describe, expect, it } from "vitest";

import type { UniswapV4PoolKey } from "../../src/api/types.js";
import { planUniswapV4Add } from "../../src/uniswap-v4/index.js";
import {
  buildPositionManagerCalldata,
  getPoolIdentity,
} from "../../src/uniswap-v4/sdk-adapter-api.js";
import { createFixtureReader, deployment, poolKey, sourceBlock } from "./state-fixtures.js";

const ACCOUNT = "0x5555555555555555555555555555555555555555" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;
const TOKEN_TWO = "0x6666666666666666666666666666666666666666" as const;
describe("Uniswap v4 add planner", () => {
  it("Given an ERC-20/ERC-20 increase with insufficient allowances, when planning, then emits two exact Permit2 approvals and zero native value", async () => {
    const reader = createFixtureReader();
    const nativePool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const nativePosition = await reader.readPositionSnapshot({
      poolKey,
      sourceBlock,
      tokenId: "42",
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
    const pool = { ...nativePool, dynamicFee: false, pool: identity };
    const position = { ...nativePosition, pool: identity };

    const plan = planUniswapV4Add({
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
          permit2: { amount: 0n, expiration: 0n, nonce: 8n },
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
      pool,
      position,
    });

    expect(plan.actions.map((action) => action.kind)).toEqual([
      "erc20Approval",
      "erc20Approval",
      "permit2Signature",
      "positionManager",
    ]);
    expect(plan.actions[3]).toMatchObject({ kind: "positionManager", value: 0n });
    expect(plan.actions[2]).toMatchObject({
      kind: "permit2Signature",
      message: {
        details: expect.arrayContaining([
          expect.objectContaining({ nonce: 7n, token: TOKEN }),
          expect.objectContaining({ nonce: 8n, token: TOKEN_TWO }),
        ]),
      },
    });
  });

  it("Given an ERC-20/ERC-20 increase with sufficient pinned approvals, when planning, then emits only exact Permit2 and PositionManager prerequisites", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });

    const plan = planUniswapV4Add({
      account: ACCOUNT,
      allowances: [
        {
          erc20Amount: 100n,
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
        deadline: "2000000000",
        hookData: "0x1234",
        kind: "increase",
        liquidity: "10",
        poolKey,
        slippageBps: 100,
        sourceBlock,
        tickLower: -120,
        tickUpper: 120,
        tokenId: "42",
      },
      pool,
      position,
    });

    expect(plan.actions.map((action) => action.kind)).toEqual([
      "permit2Signature",
      "positionManager",
    ]);
    const finalAction = plan.actions[1];
    expect(finalAction).toMatchObject({ kind: "positionManager", value: 1n });
    expect(finalAction).toMatchObject({
      data: buildPositionManagerCalldata({
        deadline: 2000000000n,
        hookData: "0x1234",
        kind: "increase",
        liquidity: 10n,
        nativeValue: 1n,
        poolKey,
        recipient: ACCOUNT,
        slippageBps: 100,
        sqrtPriceX96: BigInt(pool.sqrtPriceX96),
        tickCurrent: pool.tick,
        tickLower: -120,
        tickUpper: 120,
        tokenId: 42n,
      }).calldata,
    });
  });

  it("Given already-satisfied ERC-20 and Permit2 allowances, when planning, then removes no-op prerequisites", async () => {
    const reader = createFixtureReader();
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
      pool,
    });

    expect(plan.actions.map((action) => action.kind)).toEqual(["positionManager"]);
  });

  it("Given an explicitly requested uninitialized pool, when minting, then places official initialization before PositionManager calldata", async () => {
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
      operation: {
        account: ACCOUNT,
        amount0Max: "100",
        amount1Max: "100",
        chainId: 4663,
        createPool: true,
        deadline: "2000000000",
        hookData: "0x",
        initializeSqrtPriceX96: "79228162514264337593543950336",
        kind: "mint",
        liquidity: "10",
        poolKey,
        slippageBps: 100,
        sourceBlock,
        tickLower: -120,
        tickUpper: 120,
      },
      pool,
    });

    expect(plan.actions.map((action) => action.kind)).toEqual([
      "poolInitialization",
      "positionManager",
    ]);
    expect(plan.actions[0]).toMatchObject({
      kind: "poolInitialization",
      to: deployment.positionManager,
    });
  });
});
