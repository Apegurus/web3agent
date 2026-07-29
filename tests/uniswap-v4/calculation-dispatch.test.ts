import { describe, expect, it } from "vitest";
import type { Web3AgentError } from "../../src/api/errors.js";
import { calculateUniswapV4 } from "../../src/uniswap-v4/calculation-dispatch.js";
import { createFixtureReader, poolKey, sourceBlock } from "./state-fixtures.js";

function mintOperation() {
  return {
    account: "0x3333333333333333333333333333333333333333",
    amount0Max: "100",
    amount1Max: "100",
    chainId: 4663,
    createPool: false,
    deadline: "4102444800",
    hookData: "0x",
    kind: "mint" as const,
    liquidity: "1",
    poolKey,
    slippageBps: 0,
    sourceBlock,
    tickLower: -120,
    tickUpper: 120,
  } as const;
}

describe("Uniswap v4 calculation dispatcher", () => {
  it("returns exact results for all six public calculation kinds", async () => {
    // Given: normalized pool and position facts
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });

    // When: every public calculation kind is dispatched
    const results = [
      calculateUniswapV4({ kind: "tickToPrice", poolKey, tick: 0 }),
      calculateUniswapV4({
        kind: "priceToTick",
        poolKey,
        price: { denominator: "1", numerator: "1", rounding: "exact" },
      }),
      calculateUniswapV4({
        kind: "liquidityAmounts",
        liquidity: position.liquidity,
        pool,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
      }),
      calculateUniswapV4({ kind: "feeEstimate", position }),
      calculateUniswapV4({
        kind: "quotePriceImpact",
        quoteKind: "exactInput",
        quotedInputAmount: "100",
        quotedOutputAmount: "90",
        referenceInputAmount: "100",
        referenceOutputAmount: "100",
      }),
      calculateUniswapV4({ kind: "expectedDeltas", operation: mintOperation(), pool }),
    ];

    // Then: each result retains its discriminator and exact rounding facts
    expect(results.map((result) => result.kind)).toEqual([
      "tickToPrice",
      "priceToTick",
      "liquidityAmounts",
      "feeEstimate",
      "quotePriceImpact",
      "expectedDeltas",
    ]);
    expect(results[0]).toMatchObject({ price: { rounding: "exact" } });
    expect(results[2]).toMatchObject({ rounding: "floor" });
    expect(results[4]).toMatchObject({ priceImpactBps: { rounding: "exact" } });
    expect(results[5]).toMatchObject({ deltas: { kind: "mint", rounding: "floor" } });
  });

  it("rejects lifecycle calculations whose pinned source block does not match the pool", async () => {
    // Given: a mint operation pinned to a different block than the supplied pool
    const pool = await createFixtureReader().readPoolSnapshot({ poolKey, sourceBlock });
    const operation = {
      ...mintOperation(),
      sourceBlock: { ...sourceBlock, blockNumber: "2" },
    };

    // When: lifecycle deltas are requested from incoherent state
    const calculate = () => calculateUniswapV4({ kind: "expectedDeltas", operation, pool });

    // Then: the dispatcher rejects before calculating a plausible but stale result
    expect(calculate).toThrowError(
      expect.objectContaining({
        code: "UNISWAP_V4_ANALYSIS_STATE_MISMATCH",
      }) satisfies Partial<Web3AgentError>
    );
  });
});
