import type { Address } from "viem";
import { describe, expect, it, vi } from "vitest";
import { RADARDEX_ARC } from "../../../src/providers/radardex/manifest.js";

const FROM_TOKEN = "0x1111111111111111111111111111111111111111";
const TO_TOKEN = "0x2222222222222222222222222222222222222222";

describe("RadarDEX runtime quote dependencies", () => {
  it("loads direct and native-USDC hub-leg V4 pools before quoting", async () => {
    // Given: metadata has one V4 pool for each executable pair.
    const listV4Pools = vi.fn(async (tokenA: Address, tokenB: Address) => [
      {
        tokenA,
        tokenB,
        feeTier: 500,
        tickSpacing: 10,
        hooks: "0x0000000000000000000000000000000000000000" as const,
        nativeQuote: false,
      },
    ]);
    const quote = vi.fn().mockResolvedValue({
      request: {},
      routes: [],
      health: [],
    });
    const { createRadarDexQuoteService } = await import(
      "../../../src/tools/radardex/runtime-dependencies.js"
    );
    const getQuote = createRadarDexQuoteService({
      metadataClient: { listV4Pools },
      readClient: { getBytecode: vi.fn(), readContract: vi.fn() },
      quote,
    });

    // When: an Arc token-to-token quote is requested.
    await getQuote({
      chainId: 5042,
      fromToken: FROM_TOKEN,
      toToken: TO_TOKEN,
      fromAmount: "1000000",
      slippageBps: 50,
    });

    // Then: direct, input-to-USDC, and USDC-to-output pools feed the route probe.
    expect(listV4Pools.mock.calls).toEqual([
      [FROM_TOKEN, TO_TOKEN],
      [FROM_TOKEN, RADARDEX_ARC.usdc],
      [RADARDEX_ARC.usdc, TO_TOKEN],
    ]);
    expect(quote).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 5042 }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          v4Pools: expect.arrayContaining([
            expect.objectContaining({ tokenA: FROM_TOKEN, tokenB: TO_TOKEN }),
            expect.objectContaining({ tokenA: FROM_TOKEN, tokenB: RADARDEX_ARC.usdc }),
            expect.objectContaining({ tokenA: RADARDEX_ARC.usdc, tokenB: TO_TOKEN }),
          ]),
          hubs: [RADARDEX_ARC.usdc],
        }),
      })
    );
  });

  it("keeps V2 and V3 quoting available when V4 metadata fails", async () => {
    const listV4Pools = vi.fn().mockRejectedValue(new Error("RadarDEX metadata unavailable"));
    const quote = vi.fn().mockResolvedValue({ request: {}, routes: [], health: [] });
    const { createRadarDexQuoteService } = await import(
      "../../../src/tools/radardex/runtime-dependencies.js"
    );
    const getQuote = createRadarDexQuoteService({
      metadataClient: { listV4Pools },
      readClient: { getBytecode: vi.fn(), readContract: vi.fn() },
      quote,
    });

    await expect(
      getQuote({
        chainId: 5042,
        fromToken: FROM_TOKEN,
        toToken: TO_TOKEN,
        fromAmount: "1000000",
        slippageBps: 50,
      })
    ).resolves.toEqual({ request: {}, routes: [], health: [] });
    expect(quote).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 5042 }),
      expect.objectContaining({
        metadata: expect.objectContaining({ v4Pools: [] }),
      })
    );
  });
});
