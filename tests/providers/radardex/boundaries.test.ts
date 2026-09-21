import { describe, expect, it, vi } from "vitest";
import { RadarMetadataClient, parseTokenList } from "../../../src/providers/radardex/client.js";
import {
  quoteRequestSchema,
  v4PoolsResponseSchema,
} from "../../../src/providers/radardex/schemas.js";

const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";

describe("RadarDEX boundaries", () => {
  it("normalizes tokens and removes duplicate addresses", () => {
    // Given
    const payload = {
      tokens: [
        { address: TOKEN_A, symbol: " aaa ", name: " Alpha ", decimals: 18 },
        {
          address: TOKEN_A.toUpperCase().replace("0X", "0x"),
          symbol: "AAA",
          name: "Alpha",
          decimals: 18,
        },
        { address: TOKEN_B, symbol: "BBB", name: "Beta", decimals: 6 },
      ],
    };

    // When
    const tokens = parseTokenList(payload);

    // Then
    expect(tokens).toEqual([
      { address: TOKEN_A, symbol: "AAA", name: "Alpha", decimals: 18 },
      { address: TOKEN_B, symbol: "BBB", name: "Beta", decimals: 6 },
    ]);
  });

  it("rejects malformed token payloads", () => {
    // Given
    const payload = { tokens: [{ address: "nope", symbol: "AAA", name: "Alpha", decimals: -1 }] };

    // When / Then
    expect(() => parseTokenList(payload)).toThrow();
  });

  it.each([
    { chainId: 1, fromAmount: "1", slippageBps: 50, toToken: TOKEN_B },
    { chainId: 5042, fromAmount: "0", slippageBps: 50, toToken: TOKEN_B },
    { chainId: 5042, fromAmount: "1", slippageBps: 501, toToken: TOKEN_B },
    { chainId: 5042, fromAmount: "1", slippageBps: 50, toToken: TOKEN_A },
  ])("rejects an unsafe quote request %#", (fields) => {
    // Given
    const request = { ...fields, fromToken: TOKEN_A };

    // When
    const parsed = quoteRequestSchema.safeParse(request);

    // Then
    expect(parsed.success).toBe(false);
  });

  it("rejects incomplete V4 pool metadata", () => {
    // Given
    const payload = { pools: [{ feeTier: 500, hooks: TOKEN_A, nativeQuote: false }] };

    // When
    const parsed = v4PoolsResponseSchema.safeParse(payload);

    // Then
    expect(parsed.success).toBe(false);
  });

  it("uses a bounded request and rejects an API failure without caching it", async () => {
    // Given
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          tokens: [{ address: TOKEN_A, symbol: "AAA", name: "Alpha", decimals: 18 }],
        })
      );
    const client = new RadarMetadataClient({ fetcher, cacheNamespace: "boundary-retry" });

    // When
    await expect(client.listTokens()).rejects.toThrow();
    const tokens = await client.listTokens();

    // Then
    expect(tokens).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
