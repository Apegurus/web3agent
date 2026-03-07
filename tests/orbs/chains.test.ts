import { describe, expect, it } from "vitest";
import {
  LIQUIDITY_HUB_CHAINS,
  TWAP_CHAINS,
  getLiquidityHubError,
  getTwapError,
  isLiquidityHubSupported,
  isTwapSupported,
} from "../../src/orbs/chains.js";

describe("orbs chain support utilities", () => {
  it("exports expected liquidity hub and twap chain IDs", () => {
    expect(LIQUIDITY_HUB_CHAINS).toEqual([137, 56, 8453, 59144, 81457, 42161]);
    expect(TWAP_CHAINS).toEqual([
      1, 137, 56, 42161, 8453, 59144, 324, 250, 43114, 81457, 146, 534352,
    ]);
  });

  it("returns true for known liquidity hub supported chains", () => {
    for (const chainId of LIQUIDITY_HUB_CHAINS) {
      expect(isLiquidityHubSupported(chainId)).toBe(true);
    }
  });

  it("returns false for unsupported liquidity hub chains", () => {
    expect(isLiquidityHubSupported(1)).toBe(false);
    expect(isLiquidityHubSupported(10)).toBe(false);
    expect(isLiquidityHubSupported(9999999)).toBe(false);
  });

  it("returns true for known twap supported chains", () => {
    for (const chainId of TWAP_CHAINS) {
      expect(isTwapSupported(chainId)).toBe(true);
    }
  });

  it("returns false for unsupported twap chains", () => {
    expect(isTwapSupported(10)).toBe(false);
    expect(isTwapSupported(11155111)).toBe(false);
    expect(isTwapSupported(9999999)).toBe(false);
  });

  it("formats liquidity hub unsupported-chain error with chain names", () => {
    const message = getLiquidityHubError(1);

    expect(message).toContain("Orbs Liquidity Hub is not available on chain 1");
    expect(message).toContain("Polygon (137)");
    expect(message).toContain("BSC (56)");
    expect(message).toContain("Base (8453)");
    expect(message).toContain("Linea (59144)");
    expect(message).toContain("Blast (81457)");
    expect(message).toContain("Arbitrum (42161)");
  });

  it("formats twap unsupported-chain error with chain ID list", () => {
    const message = getTwapError(10);

    expect(message).toBe(
      "Orbs dTWAP/dLIMIT is not available on chain 10. Supported chain IDs: 1, 137, 56, 42161, 8453, 59144, 324, 250, 43114, 81457, 146, 534352"
    );
  });
});
