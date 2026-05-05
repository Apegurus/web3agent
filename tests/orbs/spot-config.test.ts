import { describe, expect, it } from "vitest";
import {
  SPOT_SKELETON,
  getSpotAdapter,
  getSpotApiUrl,
  getSpotContracts,
  getSupportedSpotChainIds,
  isSpotChainSupported,
} from "../../src/orbs/spot-config.js";

describe("spot-config", () => {
  describe("getSpotContracts", () => {
    it("returns correct contract addresses", () => {
      const contracts = getSpotContracts();
      expect(contracts.zero).toBe("0x0000000000000000000000000000000000000000");
      expect(contracts.repermit).toBe("0x00002a9C4D9497df5Bd31768eC5d30eEf5405000");
      expect(contracts.reactor).toBe("0x000000b33fE4fB9d999Dd684F79b110731c3d000");
      expect(contracts.executor).toBe("0x000642A0966d9bd49870D9519f76b5cf823f3000");
    });
  });

  describe("isSpotChainSupported", () => {
    it("returns true for supported chains", () => {
      expect(isSpotChainSupported(42161)).toBe(true);
      expect(isSpotChainSupported(137)).toBe(true);
      expect(isSpotChainSupported(1)).toBe(true);
    });

    it("returns false for unsupported chains", () => {
      expect(isSpotChainSupported(999999)).toBe(false);
    });
  });

  describe("getSpotAdapter", () => {
    it("returns correct adapter for Arbitrum (42161)", () => {
      expect(getSpotAdapter(42161)).toBe("0x026B8977319F67078e932a08feAcB59182B5380f");
    });

    it("throws for unsupported chain", () => {
      expect(() => getSpotAdapter(999999)).toThrow();
    });
  });

  describe("getSupportedSpotChainIds", () => {
    it("returns a sorted array with at least 8 entries", () => {
      const ids = getSupportedSpotChainIds();
      expect(ids.length).toBeGreaterThanOrEqual(8);

      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i - 1]);
      }
    });
  });

  describe("getSpotApiUrl", () => {
    it("returns the production URL without -dev suffix", () => {
      const url = getSpotApiUrl();
      expect(url).toMatch(/^https:\/\//);
      expect(url).toContain("agents-sink");
      expect(url).not.toContain("-dev");
      expect(url).toBe("https://agents-sink.orbs.network");
    });
  });

  describe("SPOT_SKELETON", () => {
    it("has primaryType RePermitWitnessTransferFrom", () => {
      expect(SPOT_SKELETON.primaryType).toBe("RePermitWitnessTransferFrom");
    });

    it("has all 6 type definitions", () => {
      const typeNames = Object.keys(SPOT_SKELETON.types);
      expect(typeNames).toContain("RePermitWitnessTransferFrom");
      expect(typeNames).toContain("Exchange");
      expect(typeNames).toContain("Input");
      expect(typeNames).toContain("Order");
      expect(typeNames).toContain("Output");
      expect(typeNames).toContain("TokenPermissions");
      expect(typeNames).toHaveLength(6);
    });

    it("Order type has expected fields", () => {
      const orderFields = SPOT_SKELETON.types.Order.map((f: { name: string }) => f.name);
      expect(orderFields).toContain("reactor");
      expect(orderFields).toContain("executor");
      expect(orderFields).toContain("exchange");
      expect(orderFields).toContain("swapper");
      expect(orderFields).toContain("epoch");
      expect(orderFields).toContain("slippage");
      expect(orderFields).toContain("input");
      expect(orderFields).toContain("output");
    });
  });
});
