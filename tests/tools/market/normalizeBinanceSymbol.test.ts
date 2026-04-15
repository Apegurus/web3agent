import { describe, expect, it } from "vitest";
import { normalizeBinanceSymbol } from "../../../src/tools/market/binance.js";

describe("normalizeBinanceSymbol", () => {
  it("converts BTCUSDT to BTC/USDT", () => {
    expect(normalizeBinanceSymbol("BTCUSDT")).toBe("BTC/USDT");
  });

  it("passes through already-normalized symbols", () => {
    expect(normalizeBinanceSymbol("BTC/USDT")).toBe("BTC/USDT");
  });

  it("converts ETHBTC to ETH/BTC", () => {
    expect(normalizeBinanceSymbol("ETHBTC")).toBe("ETH/BTC");
  });

  it("returns unknown symbols unchanged", () => {
    expect(normalizeBinanceSymbol("XYZFOO")).toBe("XYZFOO");
  });

  it("handles BNBETH correctly", () => {
    expect(normalizeBinanceSymbol("BNBETH")).toBe("BNB/ETH");
  });

  it("prefers longest quote match (BUSD before USD)", () => {
    expect(normalizeBinanceSymbol("ETHBUSD")).toBe("ETH/BUSD");
  });
});
