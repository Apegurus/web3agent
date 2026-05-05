import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getTopCoinGeckoSignals,
  getTopCoinGeckoSymbols,
  resetCoinGeckoTopTokensCacheForTests,
} from "../../src/tokens/coingecko.js";

const originalFetch = globalThis.fetch;

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

describe("CoinGecko top-token lookup", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetCoinGeckoTopTokensCacheForTests();
    vi.restoreAllMocks();
  });

  it("returns top token symbols and chain-aware address signals", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes("/coins/markets")) {
        return jsonResponse([
          { id: "bitcoin", symbol: "btc", name: "Bitcoin" },
          { id: "usd-coin", symbol: "usdc", name: "USD Coin" },
        ]);
      }

      if (url.includes("/coins/list")) {
        return jsonResponse([
          { id: "bitcoin", platforms: {} },
          {
            id: "usd-coin",
            platforms: {
              ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
              "polygon-pos": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
            },
          },
        ]);
      }

      if (url.includes("/asset_platforms")) {
        return jsonResponse([
          { id: "ethereum", chain_identifier: 1 },
          { id: "polygon-pos", chain_identifier: 137 },
        ]);
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await getTopCoinGeckoSignals();

    expect(result).not.toBeNull();
    expect(result?.symbols.has("BTC")).toBe(true);
    expect(result?.symbols.has("USDC")).toBe(true);
    expect(result?.addressesByChain.get(1)?.has("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48")).toBe(
      true
    );
    expect(
      result?.addressesByChain.get(137)?.has("0x2791bca1f2de4661ed88a30c99a7a9449aa84174")
    ).toBe(true);
  });

  it("caches signals across repeated calls", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes("/coins/markets")) {
        return jsonResponse([{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }]);
      }

      if (url.includes("/coins/list")) {
        return jsonResponse([{ id: "bitcoin", platforms: {} }]);
      }

      if (url.includes("/asset_platforms")) {
        return jsonResponse([{ id: "ethereum", chain_identifier: 1 }]);
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    await getTopCoinGeckoSignals();
    await getTopCoinGeckoSignals();

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("falls back to symbol-only signals when address lookups fail", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    globalThis.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes("/coins/markets")) {
        return jsonResponse([{ id: "usd-coin", symbol: "usdc", name: "USD Coin" }]);
      }

      if (url.includes("/coins/list")) {
        return jsonResponse({}, false, 503);
      }

      if (url.includes("/asset_platforms")) {
        return jsonResponse({}, false, 503);
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await getTopCoinGeckoSignals();

    expect(result).not.toBeNull();
    expect(result?.symbols.has("USDC")).toBe(true);
    expect(result?.addressesByChain.size).toBe(0);
    expect(stderrSpy).toHaveBeenCalled();
  });

  it("returns symbol view from the richer signal cache", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes("/coins/markets")) {
        return jsonResponse([{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }]);
      }

      if (url.includes("/coins/list")) {
        return jsonResponse([{ id: "bitcoin", platforms: {} }]);
      }

      if (url.includes("/asset_platforms")) {
        return jsonResponse([{ id: "ethereum", chain_identifier: 1 }]);
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await getTopCoinGeckoSymbols();

    expect(result?.has("BTC")).toBe(true);
  });

  it("returns null when the top-token request fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const result = await getTopCoinGeckoSignals();

    expect(result).toBeNull();
    expect(stderrSpy).toHaveBeenCalled();
  });
});
