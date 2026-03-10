import { describe, expect, it } from "vitest";
import { getChainTokens, getRegisteredChainIds, lookupToken } from "../../src/tokens/registry.js";

describe("token registry", () => {
  describe("lookupToken", () => {
    it("returns correct entry for known token (USDT on Ethereum)", () => {
      const entry = lookupToken("USDT", 1);
      expect(entry).toBeDefined();
      expect(entry?.symbol).toBe("USDT");
      expect(entry?.name).toBe("Tether USD");
      expect(entry?.decimals).toBe(6);
      expect(entry?.address).toBe("0xdAC17F958D2ee523a2206206994597C13D831ec7");
    });

    it("is case insensitive", () => {
      const lower = lookupToken("usdt", 1);
      const upper = lookupToken("USDT", 1);
      const mixed = lookupToken("Usdt", 1);

      expect(lower).toBeDefined();
      expect(lower).toEqual(upper);
      expect(lower).toEqual(mixed);
    });

    it("returns undefined for unknown token", () => {
      expect(lookupToken("NONEXISTENT", 1)).toBeUndefined();
    });

    it("returns undefined for unknown chain", () => {
      expect(lookupToken("USDT", 999999)).toBeUndefined();
    });
  });

  describe("getChainTokens", () => {
    it("returns all tokens for a known chain", () => {
      const tokens = getChainTokens(1);
      expect(tokens).toBeDefined();
      const keys = Object.keys(tokens ?? {});
      expect(keys).toContain("USDT");
      expect(keys).toContain("USDC");
      expect(keys).toContain("WETH");
      expect(keys.length).toBeGreaterThan(0);
    });

    it("returns undefined for unknown chain", () => {
      expect(getChainTokens(999999)).toBeUndefined();
    });
  });

  describe("getRegisteredChainIds", () => {
    it("returns array of chain IDs that have entries", () => {
      const ids = getRegisteredChainIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain(1); // Ethereum
      expect(ids).toContain(56); // BSC
      expect(ids).toContain(137); // Polygon
      expect(ids).toContain(42161); // Arbitrum
      // Every returned ID should be a number
      for (const id of ids) {
        expect(typeof id).toBe("number");
      }
    });
  });
});
