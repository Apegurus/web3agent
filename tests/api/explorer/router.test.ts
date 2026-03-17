import { beforeEach, describe, expect, it } from "vitest";
import { ExplorerRouter } from "../../../src/api/explorer/router.js";

describe("ExplorerRouter", () => {
  let router: ExplorerRouter;

  beforeEach(() => {
    router = new ExplorerRouter(
      [1, 137, 42161, 8453, 10, 100, 324, 534352],
      [1, 10, 56, 137, 324, 8453, 42161, 43114, 59144, 534352, 81457, 34443, 5000]
    );
  });

  describe("resolve", () => {
    it("returns blockscout as primary for shared chains", () => {
      expect(router.resolve(1, "transactions")).toBe("blockscout");
    });

    it("returns etherscan for etherscan-only chains", () => {
      expect(router.resolve(56, "transactions")).toBe("etherscan");
    });

    it("returns etherscan for etherscan-only capabilities on shared chains", () => {
      expect(router.resolve(1, "internal_txs")).toBe("etherscan");
    });

    it("throws for unsupported chain", () => {
      expect(() => router.resolve(999999, "transactions")).toThrow(/not available/);
    });

    it("returns etherscan for capability on etherscan-only chain", () => {
      expect(router.resolve(56, "contract_source")).toBe("etherscan");
    });
  });

  describe("getFallback", () => {
    it("returns etherscan as fallback for shared chains", () => {
      expect(router.getFallback(1, "transactions")).toBe("etherscan");
    });

    it("returns undefined for etherscan-only chains", () => {
      expect(router.getFallback(56, "transactions")).toBeUndefined();
    });

    it("returns undefined for etherscan-only capabilities", () => {
      expect(router.getFallback(1, "internal_txs")).toBeUndefined();
    });
  });

  describe("isChainSupported", () => {
    it("returns true for chains with any backend", () => {
      expect(router.isChainSupported(1)).toBe(true);
      expect(router.isChainSupported(56)).toBe(true);
    });

    it("returns false for unknown chains", () => {
      expect(router.isChainSupported(999999)).toBe(false);
    });
  });
});
