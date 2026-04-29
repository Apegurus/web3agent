import { describe, expect, it } from "vitest";
import { describeExchangeCapabilities } from "../../src/ccxt/capabilities.js";
import type { CcxtExchangeLike } from "../../src/ccxt/types.js";

const mockExchange: CcxtExchangeLike = {
  id: "binance",
  name: "Binance",
  has: {
    spot: true,
    fetchTicker: true,
    fetchBalance: true,
    createOrder: true,
  },
  timeframes: { "1m": "1m" },
  symbols: ["BTC/USDT"],
  loadMarkets: async () => ({}),
};

describe("describeExchangeCapabilities", () => {
  it("returns public-only modes when no accounts configured", () => {
    const result = describeExchangeCapabilities(mockExchange, []);

    expect(result.supportedInvocationModes).toEqual(["public"]);
  });

  it("returns all modes when accounts have credentials", () => {
    const result = describeExchangeCapabilities(mockExchange, [
      { name: "main", hasCredentials: true },
    ]);

    expect(result.supportedInvocationModes).toContain("private_read");
    expect(result.supportedInvocationModes).toContain("private_write");
  });

  it("returns public-only when accounts exist but lack credentials", () => {
    const result = describeExchangeCapabilities(mockExchange, [
      { name: "stub", hasCredentials: false },
    ]);

    expect(result.supportedInvocationModes).toEqual(["public"]);
  });

  it("does NOT advertise private_write when exchange lacks createOrder/cancelOrder", () => {
    const exchange: CcxtExchangeLike = {
      id: "minimal",
      name: "minimal",
      has: { spot: true, fetchTicker: true },
    };

    const result = describeExchangeCapabilities(exchange, [{ name: "test", hasCredentials: true }]);

    expect(result.supportedInvocationModes).toEqual(["public"]);
  });

  it("advertises private_read but NOT private_write when exchange has fetchBalance but lacks createOrder", () => {
    const exchange: CcxtExchangeLike = {
      id: "readonly",
      name: "readonly",
      has: { spot: true, fetchBalance: true, fetchPositions: true },
    };

    const result = describeExchangeCapabilities(exchange, [{ name: "test", hasCredentials: true }]);

    expect(result.supportedInvocationModes).toContain("private_read");
    expect(result.supportedInvocationModes).not.toContain("private_write");
  });

  it("still includes account names in configuredAccounts regardless of credentials", () => {
    const result = describeExchangeCapabilities(mockExchange, [
      { name: "stub", hasCredentials: false },
    ]);

    expect(result.configuredAccounts).toEqual(["stub"]);
  });
});
