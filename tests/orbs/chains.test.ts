import { describe, expect, it, vi } from "vitest";
import {
  LIQUIDITY_HUB_CHAINS,
  getLiquidityHubError,
  getSpotError,
  getTwapError,
  isLiquidityHubSupported,
  isSpotSupported,
  isTwapSupported,
} from "../../src/orbs/chains.js";

vi.mock("@orbs-network/twap-sdk", () => ({
  Configs: {
    Dex1: { chainId: 1, partner: "sushiswap" },
    Dex137: { chainId: 137, partner: "quick" },
    Dex56: { chainId: 56, partner: "thena" },
    Dex42161: { chainId: 42161, partner: "sushiswap" },
    Dex8453: { chainId: 8453, partner: "quick" },
    Dex59144: { chainId: 59144, partner: "lynex" },
    Dex324: { chainId: 324, partner: "pancake" },
    Dex250: { chainId: 250, partner: "spooky" },
    Dex43114: { chainId: 43114, partner: "sushiswap" },
    Dex81457: { chainId: 81457, partner: "quick" },
    Dex146: { chainId: 146, partner: "spooky" },
    Dex534352: { chainId: 534352, partner: "sushiswap" },
  },
}));

describe("orbs chain support utilities", () => {
  it("exports expected liquidity hub chain IDs", () => {
    expect(LIQUIDITY_HUB_CHAINS).toEqual([137, 56, 146, 8453, 59144, 81457, 42161]);
  });

  it("returns true for known liquidity hub supported chains", () => {
    for (const chainId of LIQUIDITY_HUB_CHAINS) {
      expect(isLiquidityHubSupported(chainId)).toBe(true);
    }
  });

  it("returns false for unsupported liquidity hub chains", () => {
    expect(isLiquidityHubSupported(1)).toBe(false);
    expect(isLiquidityHubSupported(10)).toBe(false);
    expect(isLiquidityHubSupported(2147483647)).toBe(false);
  });

  it("isTwapSupported delegates to SDK getConfig", () => {
    expect(isTwapSupported(137)).toBe(true);
    expect(isTwapSupported(2147483647)).toBe(false);
  });

  it("formats liquidity hub unsupported-chain error with chain names", () => {
    const message = getLiquidityHubError(1);

    expect(message).toContain("Orbs Liquidity Hub is not available on chain 1");
    expect(message).toContain("Polygon (137)");
    expect(message).toContain("(56)");
    expect(message).toContain("Base (8453)");
    expect(message).toContain("(59144)");
    expect(message).toContain("Blast (81457)");
    expect(message).toContain("(42161)");
  });

  it("formats twap unsupported-chain error", () => {
    const message = getTwapError(10);
    expect(message).toContain("Orbs dTWAP/dLIMIT is not available on chain 10");
  });
});

describe("isSpotSupported", () => {
  it("returns true for Spot-supported chains", () => {
    expect(isSpotSupported(42161)).toBe(true);
    expect(isSpotSupported(1)).toBe(true);
  });
  it("returns false for unsupported chains", () => {
    expect(isSpotSupported(999999)).toBe(false);
  });
});

describe("getSpotError", () => {
  it("returns error message with chain ID", () => {
    const msg = getSpotError(999999);
    expect(msg).toContain("999999");
    expect(msg).toContain("Spot");
  });
});
