import { V4PositionManager } from "@uniswap/v4-sdk";
import { describe, expect, it } from "vitest";

import type { UniswapV4BurnOperation, UniswapV4DecreaseOperation } from "../../src/api/types.js";
import { planUniswapV4Remove } from "../../src/uniswap-v4/index.js";
import { OWNER, createFixtureReader, deployment, poolKey, sourceBlock } from "./state-fixtures.js";

const DELEGATE = "0x4444444444444444444444444444444444444444" as const;
const SIGNATURE = `0x${"11".repeat(65)}` as const;

describe("Uniswap v4 remove planner fixture driver", () => {
  it("Given fixture-backed remove requests, when planning partial, collect, full, and permit burn transactions, then emits serialized protocol facts", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });
    const partial = planUniswapV4Remove({
      account: OWNER,
      deployment,
      operation: removal("decrease", OWNER, 2500),
      pool,
      position,
    });
    const collectReader = createFixtureReader({ liquidity: 0n, positionManagerLiquidity: 0n });
    const collect = planUniswapV4Remove({
      account: OWNER,
      deployment,
      operation: {
        account: OWNER,
        chainId: 4663,
        deadline: "2000000000",
        hookData: "0x1234",
        kind: "collect",
        poolKey,
        recipient: DELEGATE,
        slippageBps: 100,
        sourceBlock,
        tokenId: "42",
      },
      pool: await collectReader.readPoolSnapshot({ poolKey, sourceBlock }),
      position: await collectReader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" }),
    });
    const full = planUniswapV4Remove({
      account: OWNER,
      deployment,
      operation: removal("decrease", OWNER, 10_000),
      pool,
      position,
    });
    const burn = planUniswapV4Remove({
      account: DELEGATE,
      deployment,
      nftPermit: {
        deadline: 2000000000n,
        domain: {
          chainId: 4663,
          name: "Uniswap V4 Positions NFT",
          verifyingContract: deployment.positionManager,
        },
        nonce: 9n,
        signature: SIGNATURE,
        spender: DELEGATE,
        tokenId: 42n,
      },
      nftPermitNonce: 9n,
      operation: removal("burn", DELEGATE, 10_000),
      pool,
      position,
    });

    process.stderr.write(
      `[uniswap-v4-remove-driver] ${serialize({ partial, collect, full, burn })}\n`
    );
    expect(partial.expectedDeltas.liquidityDelta).toBe("-19");
    expect(collect.expectedDeltas.liquidityDelta).toBe("0");
    expect(full.expectedDeltas.liquidityDelta).toBe("-77");
    expect(burn.expectedNftState).toBe("burned");
  });

  it("Given a delegated collector and matching NFT permit, when collecting fees, then emits the official permit before modifyLiquidities", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });
    const plan = planUniswapV4Remove({
      account: DELEGATE,
      deployment,
      nftPermit: {
        deadline: 2000000000n,
        domain: {
          chainId: 4663,
          name: "Uniswap V4 Positions NFT",
          verifyingContract: deployment.positionManager,
        },
        nonce: 9n,
        signature: SIGNATURE,
        spender: DELEGATE,
        tokenId: 42n,
      },
      nftPermitNonce: 9n,
      operation: {
        account: DELEGATE,
        chainId: 4663,
        deadline: "2000000000",
        hookData: "0x1234",
        kind: "collect",
        poolKey,
        recipient: DELEGATE,
        slippageBps: 100,
        sourceBlock,
        tokenId: "42",
      },
      pool,
      position,
    });
    const positionManagerAction = plan.actions[0];
    if (positionManagerAction === undefined) throw new Error("Expected PositionManager action");
    const outer = V4PositionManager.INTERFACE.parseTransaction({
      data: positionManagerAction.data,
    });
    if (outer === null || outer.name !== "multicall") {
      throw new Error("Expected official PositionManager multicall");
    }
    const calls = outer.args[0];
    if (!Array.isArray(calls) || calls.length !== 2) {
      throw new Error("Expected permit and modifyLiquidities calls");
    }

    expect(V4PositionManager.INTERFACE.parseTransaction({ data: calls[0] })?.name).toBe("permit");
    expect(V4PositionManager.INTERFACE.parseTransaction({ data: calls[1] })?.name).toBe(
      "modifyLiquidities"
    );
    expect(plan.nftPermit).toMatchObject({
      domain: {
        chainId: 4663,
        name: "Uniswap V4 Positions NFT",
        verifyingContract: deployment.positionManager,
      },
      message: { deadline: "2000000000", nonce: "9", spender: DELEGATE, tokenId: "42" },
      primaryType: "Permit",
      types: {
        Permit: [
          { name: "spender", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
    });
  });
});

function removal(
  kind: "decrease",
  account: typeof OWNER | typeof DELEGATE,
  liquidityBps: number
): UniswapV4DecreaseOperation;
function removal(
  kind: "burn",
  account: typeof OWNER | typeof DELEGATE,
  liquidityBps: number
): UniswapV4BurnOperation;
function removal(
  kind: "burn" | "decrease",
  account: typeof OWNER | typeof DELEGATE,
  liquidityBps: number
): UniswapV4DecreaseOperation | UniswapV4BurnOperation {
  if (kind === "decrease") {
    return {
      account,
      amount0Min: "0",
      amount1Min: "0",
      chainId: 4663,
      deadline: "2000000000",
      hookData: "0x1234",
      kind: "decrease",
      liquidity: "77",
      liquidityBps,
      poolKey,
      recipient: account,
      slippageBps: 100,
      sourceBlock,
      tokenId: "42",
    };
  }
  return {
    account,
    amount0Min: "0",
    amount1Min: "0",
    chainId: 4663,
    deadline: "2000000000",
    hookData: "0x1234",
    kind: "burn",
    liquidity: "77",
    liquidityBps,
    poolKey,
    recipient: account,
    slippageBps: 100,
    sourceBlock,
    tokenId: "42",
  };
}

function serialize(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item
  );
}
