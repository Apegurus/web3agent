import { describe, expect, it } from "vitest";

import { ZERO_ADDRESS, createFixtureReader, poolKey, sourceBlock } from "./state-fixtures.js";

describe("Uniswap v4 state fixture driver", () => {
  it("Given a fixture client at one block, when the manual driver runs, then emits snapshot and mismatch evidence", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });
    let mismatchCode = "UNEXPECTED_SUCCESS";
    try {
      await reader.readPositionSnapshot({
        poolKey: { ...poolKey, hooks: ZERO_ADDRESS },
        sourceBlock,
        tokenId: "42",
      });
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "POOL_KEY_MISMATCH")
        mismatchCode = error.code;
      else throw error;
    }
    process.stderr.write(`${JSON.stringify({ mismatchCode, pool, position })}\n`);
    expect(mismatchCode).toBe("POOL_KEY_MISMATCH");
  });
});
