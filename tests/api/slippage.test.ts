import { describe, expect, it } from "vitest";
import { orbsSwapSchema } from "../../src/api/schemas/orbs.js";
import { zeroExSwapSchema } from "../../src/api/schemas/zerox.js";
import { percentageToBasisPoints } from "../../src/api/slippage.js";
import { zeroExQuoteRequestSchema } from "../../src/zerox/schemas.js";

const tokenInput = {
  fromAmount: "1000",
  fromToken: "0x1111111111111111111111111111111111111111",
  toToken: "0x2222222222222222222222222222222222222222",
};

describe("slippage boundaries", () => {
  it("never rounds a percentage upward beyond the caller maximum", () => {
    expect(percentageToBasisPoints(0.005)).toBe(0);
    expect(percentageToBasisPoints(0.019)).toBe(1);
  });

  it("rejects percentage slippage outside 0 through 100", () => {
    expect(orbsSwapSchema.safeParse({ ...tokenInput, slippagePct: -0.01 }).success).toBe(false);
    expect(orbsSwapSchema.safeParse({ ...tokenInput, slippagePct: 100.01 }).success).toBe(false);
  });

  it("rejects basis-point slippage above 100 percent at public and provider boundaries", () => {
    expect(zeroExSwapSchema.safeParse({ ...tokenInput, slippageBps: 10_001 }).success).toBe(false);
    expect(
      zeroExQuoteRequestSchema.safeParse({
        ...tokenInput,
        apiKey: "key",
        chainId: 4663,
        slippageBps: 10_001,
        taker: "0x3333333333333333333333333333333333333333",
      }).success
    ).toBe(false);
  });
});
