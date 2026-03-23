import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPricing = vi.hoisted(() => ({
  estimateTokenUsd: vi.fn(),
}));

vi.mock("../../src/tokens/pricing.js", () => mockPricing);

const mockRegistry = vi.hoisted(() => ({
  lookupTokenByAddress: vi.fn(),
}));

vi.mock("../../src/tokens/registry.js", () => mockRegistry);

import { extractEstimatedUsd } from "../../src/policy/extract-usd.js";

describe("extractEstimatedUsd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns explicit amountUsd field", async () => {
    const result = await extractEstimatedUsd({ amountUsd: 42.5 });
    expect(result).toBe(42.5);
    expect(mockPricing.estimateTokenUsd).not.toHaveBeenCalled();
  });

  it("returns explicit estimatedUsd string field", async () => {
    const result = await extractEstimatedUsd({ estimatedUsd: "15.75" });
    expect(result).toBe(15.75);
  });

  it("uses pricing module when fromToken + fromAmount + chainId present", async () => {
    mockRegistry.lookupTokenByAddress.mockReturnValue({ decimals: 18 });
    mockPricing.estimateTokenUsd.mockResolvedValue(150.0);
    const result = await extractEstimatedUsd({
      fromToken: "0xtoken",
      fromAmount: "1000000000000000000",
      chainId: 1,
    });
    expect(result).toBe(150.0);
    expect(mockPricing.estimateTokenUsd).toHaveBeenCalledWith(
      "0xtoken",
      1,
      "1000000000000000000",
      18
    );
  });

  it("uses decimals from params if registry lookup fails", async () => {
    mockRegistry.lookupTokenByAddress.mockReturnValue(undefined);
    mockPricing.estimateTokenUsd.mockResolvedValue(50.0);
    const result = await extractEstimatedUsd({
      fromToken: "0xtoken",
      fromAmount: "1000000",
      chainId: 1,
      fromDecimals: 6,
    });
    expect(result).toBe(50.0);
    expect(mockPricing.estimateTokenUsd).toHaveBeenCalledWith("0xtoken", 1, "1000000", 6);
  });

  it("returns 0 when price lookup fails", async () => {
    mockRegistry.lookupTokenByAddress.mockReturnValue({ decimals: 18 });
    mockPricing.estimateTokenUsd.mockResolvedValue(null);
    const result = await extractEstimatedUsd({
      fromToken: "0xtoken",
      fromAmount: "1000000000000000000",
      chainId: 1,
    });
    expect(result).toBe(0);
  });

  it("returns null when no recognizable fields (gas-only tool)", async () => {
    const result = await extractEstimatedUsd({ foo: "bar" });
    expect(result).toBeNull();
  });

  it("returns null when fromToken present but no chainId", async () => {
    const result = await extractEstimatedUsd({
      fromToken: "0xtoken",
      fromAmount: "1000000000000000000",
    });
    expect(result).toBeNull();
  });

  it("returns 0 when token fields present but decimals unknown", async () => {
    mockRegistry.lookupTokenByAddress.mockReturnValue(undefined);
    const result = await extractEstimatedUsd({
      fromToken: "0xunknown",
      fromAmount: "1000000",
      chainId: 1,
    });
    expect(result).toBe(0);
    expect(mockPricing.estimateTokenUsd).not.toHaveBeenCalled();
  });

  it("ignores negative and NaN explicit values", async () => {
    expect(await extractEstimatedUsd({ amountUsd: -5 })).toBeNull();
    expect(await extractEstimatedUsd({ amountUsd: "abc" })).toBeNull();
  });
});
