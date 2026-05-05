import { afterEach, describe, expect, it, vi } from "vitest";
import { resetCoinGeckoTopTokensCacheForTests } from "../../src/tokens/coingecko.js";
import {
  listTokens,
  resolveCanonicalToken,
  resolveCanonicalTokenSync,
  resolveToken,
  resolveTokenSync,
} from "../../src/tokens/resolver.js";

// Keep a reference to the real fetch so we can restore it
const originalFetch = globalThis.fetch;

interface MockDexPair {
  chainId: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  liquidity?: { usd?: number };
}

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

function bytes32Hex(value: string): string {
  return `0x${Buffer.from(value, "utf8").toString("hex").padEnd(64, "0")}`;
}

function createDiscoveryFetchMock(options: {
  pairs: MockDexPair[];
  coinGeckoMarkets?: Array<{ id: string; symbol: string; name?: string }>;
  coinGeckoCoinList?: Array<{ id: string; platforms: Record<string, string> }>;
  coinGeckoAssetPlatforms?: Array<{ id: string; chain_identifier: number }>;
  coinListOk?: boolean;
  assetPlatformsOk?: boolean;
  decimalsResult?: string | null;
  symbolResult?: string | null;
  nameResult?: string | null;
}) {
  const {
    pairs,
    coinGeckoMarkets = [
      { id: "bitcoin", symbol: "btc" },
      { id: "ethereum", symbol: "eth" },
      { id: "usd-coin", symbol: "usdc" },
    ],
    coinGeckoCoinList = [
      { id: "usd-coin", platforms: { ethereum: "0xusdc" } },
      { id: "ethereum", platforms: {} },
    ],
    coinGeckoAssetPlatforms = [{ id: "ethereum", chain_identifier: 1 }],
    coinListOk = true,
    assetPlatformsOk = true,
    decimalsResult = "0x0000000000000000000000000000000000000000000000000000000000000012",
    symbolResult = bytes32Hex("NEWTKN"),
    nameResult = bytes32Hex("New Token"),
  } = options;

  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;

    if (url.includes("api.dexscreener.com")) {
      return jsonResponse({ pairs });
    }

    if (url.includes("/coins/markets")) {
      return jsonResponse(coinGeckoMarkets);
    }

    if (url.includes("/coins/list")) {
      return jsonResponse(coinGeckoCoinList, coinListOk, coinListOk ? 200 : 503);
    }

    if (url.includes("/asset_platforms")) {
      return jsonResponse(coinGeckoAssetPlatforms, assetPlatformsOk, assetPlatformsOk ? 200 : 503);
    }

    const body = typeof init?.body === "string" ? init.body : "";
    if (body.includes("0x313ce567")) {
      return jsonResponse({ result: decimalsResult ?? "0x" }, decimalsResult !== null);
    }

    if (body.includes("0x95d89b41")) {
      return jsonResponse({ result: symbolResult ?? "0x" }, symbolResult !== null);
    }

    if (body.includes("0x06fdde03")) {
      return jsonResponse({ result: nameResult ?? "0x" }, nameResult !== null);
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  }) as typeof fetch;
}

describe("token resolver", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetCoinGeckoTopTokensCacheForTests();
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

    it("resolveCanonicalToken returns a known token from the registry", async () => {
      const result = await resolveCanonicalToken("USDC", 1);
      expect(result).not.toBeNull();
      expect(result?.symbol).toBe("USDC");
      expect(result?.source).toBe("registry");
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
      globalThis.fetch = createDiscoveryFetchMock({
        pairs: [
          {
            chainId: "ethereum",
            baseToken: {
              address: "0xNewTokenAddress",
              name: "New Token",
              symbol: "NEWTKN",
            },
            quoteToken: {
              address: "0xUsdc",
              name: "USD Coin",
              symbol: "USDC",
            },
            liquidity: { usd: 1_000_000 },
          },
        ],
        coinGeckoCoinList: [{ id: "usd-coin", platforms: { ethereum: "0xUsdc" } }],
      });

      const result = await resolveToken("NEWTKN", 1);
      expect(result).not.toBeNull();
      expect(result?.address).toBe("0xNewTokenAddress");
      expect(result?.decimals).toBe(18);
      expect(result?.source).toBe("dexscreener");
      expect(result?.chainId).toBe(1);
      expect(result?.warnings).toBeUndefined();
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

    it("resolveCanonicalToken does not use DexScreener fallback", async () => {
      globalThis.fetch = vi.fn();

      const result = await resolveCanonicalToken("NEWTKN", 1);

      expect(result).toBeNull();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("adds a warning when the selected pair lacks a reputable quote token", async () => {
      globalThis.fetch = createDiscoveryFetchMock({
        pairs: [
          {
            chainId: "ethereum",
            baseToken: {
              address: "0xWarnToken",
              name: "Warn Token",
              symbol: "WARN",
            },
            quoteToken: {
              address: "0xQuote",
              name: "Random Quote",
              symbol: "RUGQUOTE",
            },
            liquidity: { usd: 200_000 },
          },
        ],
      });

      const result = await resolveToken("WARN", 1);

      expect(result?.warnings).toContain(
        "Selected DexScreener pair is not quoted against a CoinGecko top-100 token (quote token: RUGQUOTE)."
      );
    });

    it("prefers a reputable quote-token pair over a less reputable one", async () => {
      globalThis.fetch = createDiscoveryFetchMock({
        pairs: [
          {
            chainId: "ethereum",
            baseToken: {
              address: "0xReputable",
              name: "Signal Token",
              symbol: "SIGNAL",
            },
            quoteToken: {
              address: "0xUsdc",
              name: "USD Coin",
              symbol: "USDC",
            },
            liquidity: { usd: 250_000 },
          },
          {
            chainId: "ethereum",
            baseToken: {
              address: "0xLessTrusted",
              name: "Signal Token",
              symbol: "SIGNAL",
            },
            quoteToken: {
              address: "0xQuote",
              name: "Random Quote",
              symbol: "RUGQUOTE",
            },
            liquidity: { usd: 500_000 },
          },
        ],
        coinGeckoCoinList: [{ id: "usd-coin", platforms: { ethereum: "0xUsdc" } }],
        symbolResult: bytes32Hex("SIGNAL"),
        nameResult: bytes32Hex("Signal Token"),
      });

      const result = await resolveToken("SIGNAL", 1);

      expect(result?.address).toBe("0xReputable");
    });

    it("adds warnings when onchain metadata does not match DexScreener metadata", async () => {
      globalThis.fetch = createDiscoveryFetchMock({
        pairs: [
          {
            chainId: "ethereum",
            baseToken: {
              address: "0xMetaMismatch",
              name: "Dex Name",
              symbol: "DEXSYM",
            },
            quoteToken: {
              address: "0xUsdc",
              name: "USD Coin",
              symbol: "USDC",
            },
            liquidity: { usd: 300_000 },
          },
        ],
        coinGeckoCoinList: [{ id: "usd-coin", platforms: { ethereum: "0xUsdc" } }],
        symbolResult: bytes32Hex("REALSYM"),
        nameResult: bytes32Hex("Real Name"),
      });

      const result = await resolveToken("DEXSYM", 1);

      expect(result?.warnings).toContain(
        "Onchain symbol (REALSYM) does not match DexScreener metadata (DEXSYM)."
      );
      expect(result?.warnings).toContain(
        "Onchain name (Real Name) does not match DexScreener metadata (Dex Name)."
      );
    });
  });

  // ── 4. Null decimals ────────────────────────────────────────────────
  describe("null decimals", () => {
    it("returns null when fetchDecimals returns null (no RPC URL)", async () => {
      globalThis.fetch = createDiscoveryFetchMock({
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
        decimalsResult: null,
      });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const result = await resolveToken("BADTKN", 1);
      expect(result).toBeNull();
      stderrSpy.mockRestore();
    });

    it("returns null when RPC returns empty result for decimals", async () => {
      globalThis.fetch = createDiscoveryFetchMock({
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
        decimalsResult: "0x",
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

    it("resolveCanonicalTokenSync returns a known registry token", () => {
      const result = resolveCanonicalTokenSync("USDT", 1);
      expect(result).not.toBeNull();
      expect(result?.symbol).toBe("USDT");
      expect(result?.source).toBe("registry");
    });
  });
});
