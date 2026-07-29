import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { createFixtureReader, poolKey, sourceBlock } from "./state-fixtures.js";

describe("Uniswap v4 state snapshot boundaries", () => {
  it("Given a source block hash that does not match the canonical block, when read, then rejects before state reads", async () => {
    await expect(
      createFixtureReader().readPoolSnapshot({
        poolKey,
        sourceBlock: {
          ...sourceBlock,
          blockHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      })
    ).rejects.toMatchObject({ code: "UNISWAP_V4_BLOCK_HASH_MISMATCH" });
  });

  it("Given malformed, negative, or greater-than-uint256 token IDs, when read, then rejects at the Zod boundary", async () => {
    for (const tokenId of ["-1", "01", "not-a-number", (1n << 256n).toString()]) {
      await expect(
        createFixtureReader().readPositionSnapshot({ poolKey, sourceBlock, tokenId })
      ).rejects.toBeInstanceOf(ZodError);
    }
  });
});
