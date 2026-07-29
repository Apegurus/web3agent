import { describe, expect, it } from "vitest";

import type { UniswapV4PoolKey } from "../../src/api/types.js";
import {
  calculateCurrentPositionAmounts,
  calculateLifecycleDeltas,
  calculateQuotePriceImpact,
  calculateTickPrice,
  estimatePositionFees,
  snapPositionTicks,
} from "../../src/uniswap-v4/analysis.js";
import { createFixtureReader, poolKey, sourceBlock } from "./state-fixtures.js";

const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const asymmetricPoolKey = {
  currency0: {
    address: DAI,
    chainId: 1,
    decimals: 18,
    kind: "erc20",
    name: "Dai Stablecoin",
    symbol: "DAI",
  },
  currency1: {
    address: USDC,
    chainId: 1,
    decimals: 6,
    kind: "erc20",
    name: "USD Coin",
    symbol: "USDC",
  },
  fee: 500,
  hooks: ZERO_ADDRESS,
  tickSpacing: 60,
} satisfies UniswapV4PoolKey;

describe("Uniswap v4 analysis fixture driver", () => {
  it("Given a 6/18-decimal fixture, when analysis runs, then emits deterministic JSON facts", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });
    const position = await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" });
    const sample = {
      currentAmounts: calculateCurrentPositionAmounts({ pool, position }),
      expectedDecrease: calculateLifecycleDeltas({
        operation: {
          account: "0x5555555555555555555555555555555555555555",
          amount0Min: "0",
          amount1Min: "0",
          chainId: 4663,
          deadline: "2000000000",
          hookData: "0x",
          kind: "decrease",
          liquidity: "77",
          liquidityBps: 2500,
          poolKey,
          sourceBlock,
          tokenId: "42",
        },
        pool,
        position,
      }),
      expectedCollectAll: calculateLifecycleDeltas({
        operation: {
          account: "0x5555555555555555555555555555555555555555",
          chainId: 4663,
          deadline: "2000000000",
          hookData: "0x",
          kind: "collect",
          poolKey,
          recipient: "0x5555555555555555555555555555555555555555",
          sourceBlock,
          tokenId: "42",
        },
        pool,
        position,
      }),
      fees: estimatePositionFees({ position }),
      priceAtZero: calculateTickPrice({ poolKey: asymmetricPoolKey, tick: 0 }),
      quoteImpact: calculateQuotePriceImpact({
        kind: "exactInput",
        quotedInputAmount: "100",
        quotedOutputAmount: "90",
        referenceInputAmount: "100",
        referenceOutputAmount: "100",
      }),
      snappedRange: snapPositionTicks({ tickLower: -119, tickSpacing: 60, tickUpper: 119 }),
    };

    process.stderr.write(`${JSON.stringify(sample)}\n`);
    expect(sample.priceAtZero.price).toEqual({
      denominator: "1",
      numerator: "1000000000000",
      rounding: "exact",
    });
  });
});
