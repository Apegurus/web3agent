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

  it("estimates USD for ccxt createOrder on a USD-quoted pair", async () => {
    const result = await extractEstimatedUsd({
      method: "createOrder",
      args: ["BTC/USDT", "limit", "buy", 1, 50000],
    });

    expect(result).toBe(50000);
    expect(mockPricing.estimateTokenUsd).not.toHaveBeenCalled();
  });

  it("estimates USD for ccxt editOrder using the correct amount and price slots", async () => {
    const result = await extractEstimatedUsd({
      method: "editOrder",
      args: ["order-1", "BTC/USDT", "limit", "buy", 1, 50000],
    });

    expect(result).toBe(50000);
  });

  it("returns 0 for ccxt createOrder on a non-USD quoted pair", async () => {
    const result = await extractEstimatedUsd({
      method: "createOrder",
      args: ["ETH/BTC", "limit", "buy", 10, 0.05],
    });

    expect(result).toBe(0);
  });

  it("returns 0 for ccxt createOrder on a fiat-quoted non-USD pair", async () => {
    const result = await extractEstimatedUsd({
      method: "createOrder",
      args: ["BTC/EUR", "limit", "buy", 1, 45000],
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

  it("rejects Infinity from explicit USD fields", async () => {
    expect(await extractEstimatedUsd({ estimatedUsd: Number.POSITIVE_INFINITY })).not.toBe(
      Number.POSITIVE_INFINITY
    );
    expect(await extractEstimatedUsd({ amountUsd: "Infinity" })).not.toBe(Number.POSITIVE_INFINITY);
    // Either 0 (token fields present but estimation failed) or null (no estimable field)
    // are both acceptable — just NOT infinity.
  });

  it("clamps CCXT createOrder amount*price overflow to 0 (not Infinity)", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      // Number.MAX_VALUE * 2 overflows to Infinity. Both inputs pass parsePositiveNumber's
      // own finite check, so the multiplication is the overflow site.
      const result = await extractEstimatedUsd({
        method: "createOrder",
        args: ["BTC/USDT", "limit", "buy", Number.MAX_VALUE, Number.MAX_VALUE],
      });
      expect(Number.isFinite(result as number)).toBe(true);
      expect(result).toBe(0);
      const stderrCalls = stderrSpy.mock.calls.map(([chunk]) => String(chunk)).join("");
      expect(stderrCalls).toContain("[policy]");
      expect(stderrCalls).toContain("non-finite");
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("clamps non-finite output from estimateTokenUsd to 0 (not Infinity)", async () => {
    mockRegistry.lookupTokenByAddress.mockReturnValue({ decimals: 18 });
    mockPricing.estimateTokenUsd.mockResolvedValue(Number.POSITIVE_INFINITY);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      const result = await extractEstimatedUsd({
        fromToken: "0xtoken",
        fromAmount: "1000000000000000000",
        chainId: 1,
      });
      expect(result).toBe(0);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
