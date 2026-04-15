import { describe, expect, it } from "vitest";
import { describeExchangeCapabilities } from "../../src/ccxt/capabilities.js";
import type { CcxtExchangeLike } from "../../src/ccxt/types.js";

const mockExchange: CcxtExchangeLike = {
  id: "binance",
  name: "Binance",
  has: { spot: true, fetchTicker: true },
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

  it("still includes account names in configuredAccounts regardless of credentials", () => {
    const result = describeExchangeCapabilities(mockExchange, [
      { name: "stub", hasCredentials: false },
    ]);

    expect(result.configuredAccounts).toEqual(["stub"]);
  });
});
