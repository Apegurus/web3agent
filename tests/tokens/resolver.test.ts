import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listTokens, resolveToken, resolveTokenSync } from "../../src/tokens/resolver.js";

// Keep a reference to the real fetch so we can restore it
const originalFetch = globalThis.fetch;

describe("token resolver", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ── 1. Registry resolution ──────────────────────────────────────────
  describe("registry resolution", () => {
    it("resolveToken returns a known token from the registry", async () => {
      const result = await resolveToken("USDT", 1);
      expect(result).not.toBeNull();
      expect(result?.symbol).toBe("USDT");
      expect(result?.address).toBe("0xdAC17F958D2ee523a2206206994597C13D831ec7");
      expect(result?.decimals).toBe(6);
      expect(result?.chainId).toBe(1);
      expect(result?.source).toBe("registry");
    });

    it("returns null for a completely unknown token with no DexScreener match", async () => {
      // Mock fetch to return no pairs so DexScreener fallback also returns null
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ pairs: [] }),
      });
      const result = await resolveToken("ZZZZNOTREAL", 1);
      expect(result).toBeNull();
    });
  });

  // ── 2. Case insensitivity ──────────────────────────────────────────
  describe("case insensitivity", () => {
    it("resolves lowercase symbol the same as uppercase", async () => {
      const lower = await resolveToken("usdt", 1);
      const upper = await resolveToken("USDT", 1);
      expect(lower).not.toBeNull();
      expect(upper).not.toBeNull();
      expect(lower?.address).toBe(upper?.address);
      expect(lower?.decimals).toBe(upper?.decimals);
      expect(lower?.source).toBe("registry");
    });

    it("resolves mixed-case symbol", async () => {
      const result = await resolveToken("Usdt", 1);
      expect(result).not.toBeNull();
      expect(result?.symbol).toBe("USDT");
      expect(result?.source).toBe("registry");
    });
  });

  // ── 3. DexScreener fallback ─────────────────────────────────────────
  describe("DexScreener fallback", () => {
    it("resolves a token via DexScreener when not in registry", async () => {
      // First call: DexScreener search API
      // Second call: RPC eth_call for decimals
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            pairs: [
              {
                chainId: "ethereum",
                baseToken: {
                  address: "0xNewTokenAddress",
                  name: "New Token",
                  symbol: "NEWTKN",
                },
                quoteToken: {
                  address: "0xQuote",
                  name: "Quote",
                  symbol: "QT",
                },
                liquidity: { usd: 1_000_000 },
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            // 18 in hex = 0x12
            result: "0x0000000000000000000000000000000000000000000000000000000000000012",
          }),
        });

      const result = await resolveToken("NEWTKN", 1);
      expect(result).not.toBeNull();
      expect(result?.address).toBe("0xNewTokenAddress");
      expect(result?.decimals).toBe(18);
      expect(result?.source).toBe("dexscreener");
      expect(result?.chainId).toBe(1);
    });

    it("returns null when DexScreener API returns non-ok response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
      const result = await resolveToken("NEWTKN", 1);
      expect(result).toBeNull();
    });

    it("returns null for unsupported chain (no DexScreener slug)", async () => {
      // Chain 999999 has no DexScreener slug and no registry entries
      const result = await resolveToken("NEWTKN", 999999);
      expect(result).toBeNull();
    });
  });

  // ── 4. Null decimals ────────────────────────────────────────────────
  describe("null decimals", () => {
    it("returns null when fetchDecimals returns null (no RPC URL)", async () => {
      // DexScreener returns a match but the chain has no RPC URL
      // We use chain 999999 which won't have an RPC URL in the registry,
      // but it also has no DexScreener slug, so we need a valid slug chain
      // with a mock that makes the RPC call fail.
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            pairs: [
              {
                chainId: "ethereum",
                baseToken: {
                  address: "0xBadToken",
                  name: "Bad Token",
                  symbol: "BADTKN",
                },
                quoteToken: {
                  address: "0xQuote",
                  name: "Quote",
                  symbol: "QT",
                },
                liquidity: { usd: 500_000 },
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          // RPC call returns non-ok
          ok: false,
        });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const result = await resolveToken("BADTKN", 1);
      expect(result).toBeNull();
      stderrSpy.mockRestore();
    });

    it("returns null when RPC returns empty result for decimals", async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            pairs: [
              {
                chainId: "ethereum",
                baseToken: {
                  address: "0xNoDecimalsToken",
                  name: "No Decimals",
                  symbol: "NODEC",
                },
                quoteToken: {
                  address: "0xQuote",
                  name: "Quote",
                  symbol: "QT",
                },
                liquidity: { usd: 100_000 },
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: "0x" }),
        });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const result = await resolveToken("NODEC", 1);
      expect(result).toBeNull();
      stderrSpy.mockRestore();
    });
  });

  // ── 5. Native alias resolution ──────────────────────────────────────
  describe("native alias resolution", () => {
    it("resolves ETH on chain 1 to WETH with a note", async () => {
      const result = await resolveToken("ETH", 1);
      expect(result).not.toBeNull();
      expect(result?.symbol).toBe("WETH");
      expect(result?.address).toBe("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
      expect(result?.source).toBe("registry");
      expect(result?.note).toMatch(/native token/i);
      expect(result?.note).toMatch(/WETH/);
    });

    it("resolves BNB on chain 56 to WBNB with a note", async () => {
      const result = await resolveToken("BNB", 56);
      expect(result).not.toBeNull();
      expect(result?.symbol).toBe("WBNB");
      expect(result?.source).toBe("registry");
      expect(result?.note).toMatch(/WBNB/);
    });

    it("resolves MATIC on chain 137 to WMATIC", async () => {
      const result = await resolveToken("MATIC", 137);
      expect(result).not.toBeNull();
      expect(result?.symbol).toBe("WMATIC");
      expect(result?.source).toBe("registry");
      expect(result?.note).toMatch(/WMATIC/);
    });
  });

  // ── 6. listTokens ──────────────────────────────────────────────────
  describe("listTokens", () => {
    it("returns entries for known chains", () => {
      const tokens = listTokens(1);
      expect(tokens.length).toBeGreaterThan(0);
      const symbols = tokens.map((t) => t.symbol);
      expect(symbols).toContain("USDT");
      expect(symbols).toContain("USDC");
      expect(symbols).toContain("WETH");
    });

    it("returns empty array for unknown chains", () => {
      const tokens = listTokens(999999);
      expect(tokens).toEqual([]);
    });
  });

  // ── 7. resolveTokenSync ─────────────────────────────────────────────
  describe("resolveTokenSync", () => {
    it("returns a resolved token for known symbol", () => {
      const result = resolveTokenSync("USDC", 1);
      expect(result).not.toBeNull();
      expect(result?.symbol).toBe("USDC");
      expect(result?.address).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
      expect(result?.chainId).toBe(1);
      expect(result?.source).toBe("registry");
    });

    it("returns null for unknown tokens", () => {
      const result = resolveTokenSync("ZZZZNOTREAL", 1);
      expect(result).toBeNull();
    });

    it("returns null for unknown chain", () => {
      const result = resolveTokenSync("USDT", 999999);
      expect(result).toBeNull();
    });
  });
});
