import { describe, expect, it } from "vitest";

import {
  OWNER,
  ZERO_ADDRESS,
  createFixtureReader,
  poolKey,
  sourceBlock,
} from "./state-fixtures.js";

describe("Uniswap v4 normalized state snapshots", () => {
  it("Given a historical hooked native pool and owned position, when read, then returns one coherent normalized snapshot", async () => {
    const snapshot = await createFixtureReader({ tick: 0 }).readPositionSnapshot({
      expectedOwner: OWNER,
      poolKey,
      sourceBlock,
      tokenId: "42",
    });

    expect(snapshot).toMatchObject({
      owner: OWNER,
      pool: { poolKey },
      positionId: "0x75a9e8ea337d7729a9a96679454010f694320609a13c347070cdaa7f0f7e0345",
      sourceBlock,
      tokenId: "42",
      tickLower: -120,
      tickUpper: 120,
    });
    expect(snapshot.amount0).toMatch(/^\d+$/);
    expect(snapshot.amount1).toMatch(/^\d+$/);
  });

  it("Given initialized, uninitialized, in-range, out-of-range, and empty positions, when read, then serializes coherent decimal amounts", async () => {
    const cases = [
      { liquidity: 77n, sqrtPriceX96: 79228162514264337593543950336n, tick: 0 },
      {
        liquidity: 77n,
        sqrtPriceX96: 79228162514264337593543950336n,
        tick: 0,
        tickLower: 120,
        tickUpper: 240,
      },
      { liquidity: 0n, sqrtPriceX96: 79228162514264337593543950336n, tick: 0 },
      { liquidity: 0n, sqrtPriceX96: 0n, tick: 0 },
    ] as const;

    for (const options of cases) {
      const snapshot = await createFixtureReader(options).readPositionSnapshot({
        poolKey,
        sourceBlock,
        tokenId: "42",
      });

      expect(snapshot.amount0).toMatch(/^\d+$/);
      expect(snapshot.amount1).toMatch(/^\d+$/);
    }
  });

  it("Given an owner mismatch, when read, then rejects instead of returning an unauthorized position", async () => {
    await expect(
      createFixtureReader().readPositionSnapshot({
        expectedOwner: ZERO_ADDRESS,
        poolKey,
        sourceBlock,
        tokenId: "42",
      })
    ).rejects.toMatchObject({ code: "UNISWAP_V4_POSITION_OWNER_MISMATCH" });
  });

  it("Given a caller PoolKey that differs from the stored position PoolKey, when read, then rejects deterministically", async () => {
    await expect(
      createFixtureReader().readPositionSnapshot({
        poolKey: { ...poolKey, hooks: ZERO_ADDRESS },
        sourceBlock,
        tokenId: "42",
      })
    ).rejects.toMatchObject({ code: "POOL_KEY_MISMATCH" });
  });

  it("Given a fixture client at one block, when the manual driver runs, then emits normalized data and mismatch evidence", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({
      expectedOwner: OWNER,
      poolKey,
      sourceBlock,
      tokenId: "42",
    });
    let mismatchCode = "UNEXPECTED_SUCCESS";
    try {
      await reader.readPositionSnapshot({
        poolKey: { ...poolKey, hooks: ZERO_ADDRESS },
        sourceBlock,
        tokenId: "42",
      });
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "POOL_KEY_MISMATCH") {
        mismatchCode = error.code;
      } else {
        throw error;
      }
    }

    process.stderr.write(`${JSON.stringify({ mismatchCode, pool, position })}\n`);
    expect(mismatchCode).toBe("POOL_KEY_MISMATCH");
  });
});
