import { describe, expect, it } from "vitest";

import type { UniswapV4BurnOperation } from "../../src/api/types.js";
import { type UniswapV4RemovePlanInput, planUniswapV4Remove } from "../../src/uniswap-v4/index.js";
import { OWNER, createFixtureReader, deployment, poolKey, sourceBlock } from "./state-fixtures.js";

const ACCOUNT = "0x5555555555555555555555555555555555555555" as const;
const DELEGATE = "0x4444444444444444444444444444444444444444" as const;
const SIGNATURE = `0x${"11".repeat(65)}` as const;

describe("Uniswap v4 remove planner guards", () => {
  it("Given invalid burn inputs, when planning, then rejects them before emitting actions", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });
    const input: UniswapV4RemovePlanInput = {
      account: OWNER,
      deployment,
      operation: burn(OWNER),
      pool,
      position,
    };

    expect(() => planUniswapV4Remove({ ...input, operation: burn(OWNER, 9999) })).toThrow(/100%/i);
    expect(() =>
      planUniswapV4Remove({ ...input, position: { ...position, tokenId: "43" } })
    ).toThrow(/token/i);
    expect(() =>
      planUniswapV4Remove({ ...input, account: ACCOUNT, operation: burn(ACCOUNT) })
    ).toThrow(/owner|operator|permit/i);
    expect(() => planUniswapV4Remove({ ...input, now: 2000000000n })).toThrow(/deadline/i);
    expect(() =>
      planUniswapV4Remove({ ...input, deployment: { ...deployment, positionManager: ACCOUNT } })
    ).toThrow(/canonical/i);
  });

  it("Given a delegated burner with an invalid NFT permit, when planning, then rejects stale nonce and wrong domain", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });
    const input: UniswapV4RemovePlanInput = {
      account: DELEGATE,
      deployment,
      nftPermit: permit(),
      nftPermitNonce: 9n,
      operation: burn(DELEGATE),
      pool,
      position,
    };

    expect(() => planUniswapV4Remove({ ...input, nftPermit: permit(8n) })).toThrow(/nonce/i);
    expect(() => planUniswapV4Remove({ ...input, nftPermit: permit(9n, 1) })).toThrow(/domain/i);
  });

  it("Given an external delegate whose owner permit will be prepended When planning the unsigned final call Then authorization is deferred to that canonical permit stage", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });

    expect(() =>
      planUniswapV4Remove({
        account: ACCOUNT,
        deployment,
        nftPermitWillBeAppended: true,
        operation: burn(ACCOUNT),
        pool,
        position,
      })
    ).not.toThrow();
  });
});

function burn(
  account: typeof ACCOUNT | typeof DELEGATE | typeof OWNER,
  liquidityBps = 10_000
): UniswapV4BurnOperation {
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

function permit(nonce = 9n, chainId = 4663) {
  return {
    deadline: 2000000000n,
    domain: {
      chainId,
      name: "Uniswap V4 Positions NFT" as const,
      verifyingContract: deployment.positionManager,
    },
    nonce,
    signature: SIGNATURE,
    spender: DELEGATE,
    tokenId: 42n,
  };
}
