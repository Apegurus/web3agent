import { describe, expect, it } from "vitest";
import { getChainById, getChainByName, isSupported } from "../../src/chains/registry.js";

describe("chain registry", () => {
  it("looks up well-known chains by ID", () => {
    const base = getChainById(8453);
    expect(base).toBeDefined();
    expect(base?.id).toBe(8453);
    expect(base?.name).toBe("Base");

    const ethereum = getChainById(1);
    expect(ethereum).toBeDefined();
    expect(ethereum?.id).toBe(1);
  });

  it("returns undefined for non-existent chain ID", () => {
    expect(getChainById(2147483647)).toBeUndefined();
  });

  it("looks up chain by name case-insensitively", () => {
    const chain = getChainByName("base");
    expect(chain).toBeDefined();
    expect(chain?.id).toBe(8453);

    const upper = getChainByName("Base");
    expect(upper).toBeDefined();
    expect(upper?.id).toBe(8453);
  });

  it("returns undefined for unknown chain name", () => {
    expect(getChainByName("nonexistent-chain-xyz")).toBeUndefined();
  });

  it("isSupported returns true for well-known chains", () => {
    expect(isSupported(1)).toBe(true); // Ethereum
    expect(isSupported(8453)).toBe(true); // Base
    expect(isSupported(137)).toBe(true); // Polygon
    expect(isSupported(42161)).toBe(true); // Arbitrum
  });

  it("isSupported returns false for non-existent chains", () => {
    expect(isSupported(2147483647)).toBe(false);
  });

  it("includes all viem chains (not a hardcoded subset)", () => {
    // Spot-check chains that were NOT in the old 17-chain whitelist
    // to verify we're using the full viem registry
    expect(isSupported(250)).toBe(true); // Fantom
    expect(isSupported(1284)).toBe(true); // Moonbeam
    expect(isSupported(43114)).toBe(true); // Avalanche
  });
});
