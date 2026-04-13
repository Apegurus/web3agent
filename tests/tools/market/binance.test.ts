import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMocks = vi.hoisted(() => ({
  invokeCcxtPublicCall: vi.fn(),
}));

vi.mock("../../../src/ccxt/invoke.js", () => ({
  invokeCcxtPublicCall: (...args: unknown[]) => invokeMocks.invokeCcxtPublicCall(...args),
}));

vi.mock("../../../src/ccxt/runtime-state.js", () => ({
  getCcxtRuntimeState: () => ({
    factory: {},
    registry: { accounts: [], warnings: [] },
  }),
}));

import {
  getFundingRates,
  getKlines,
  getOrderBook,
  getTicker,
} from "../../../src/tools/market/binance.js";

beforeEach(() => {
  invokeMocks.invokeCcxtPublicCall.mockReset();
});

describe("deprecated Binance compatibility shims", () => {
  it("maps getTicker to a Binance CCXT public call and preserves output shape", async () => {
    invokeMocks.invokeCcxtPublicCall.mockResolvedValueOnce({
      exchangeId: "binance",
      method: "fetchTicker",
      classification: "public",
      result: {
        symbol: "BTCUSDT",
        last: 65000,
        change: 1000,
        percentage: 1.56,
        high: 66000,
        low: 63500,
        baseVolume: 12345.67,
        quoteVolume: 802567890.12,
        bid: 64999,
        ask: 65001,
      },
    });

    const result = await getTicker({ symbol: "BTCUSDT" });

    expect(invokeMocks.invokeCcxtPublicCall).toHaveBeenCalledWith(
      {
        exchange: "binance",
        method: "fetchTicker",
        args: ["BTC/USDT"],
      },
      expect.anything()
    );
    expect(result).toEqual({
      symbol: "BTCUSDT",
      lastPrice: "65000",
      priceChange: "1000",
      priceChangePercent: "1.56",
      highPrice: "66000",
      lowPrice: "63500",
      volume: "12345.67",
      quoteVolume: "802567890.12",
      bidPrice: "64999",
      askPrice: "65001",
    });
  });

  it("maps getKlines to fetchOHLCV and preserves the current output schema", async () => {
    invokeMocks.invokeCcxtPublicCall.mockResolvedValueOnce({
      exchangeId: "binance",
      method: "fetchOHLCV",
      classification: "public",
      result: [
        [
          1710547200000,
          "64000.00",
          "66000.00",
          "63500.00",
          "65000.00",
          "12345.67",
          "802567890.12",
          1234,
        ],
        [
          1710547260000,
          "65000.00",
          "65500.00",
          "64800.00",
          "65200.00",
          "5678.90",
          "369567000.00",
          987,
        ],
      ],
    });

    const result = await getKlines({ symbol: "BTCUSDT", interval: "1h", limit: 50 });

    expect(invokeMocks.invokeCcxtPublicCall).toHaveBeenCalledWith(
      {
        exchange: "binance",
        method: "fetchOHLCV",
        args: ["BTC/USDT", "1h", undefined, 50],
      },
      expect.anything()
    );
    expect(result).toEqual([
      {
        openTime: 1710547200000,
        open: "64000.00",
        high: "66000.00",
        low: "63500.00",
        close: "65000.00",
        volume: "12345.67",
        quoteVolume: "802567890.12",
        trades: 1234,
      },
      {
        openTime: 1710547260000,
        open: "65000.00",
        high: "65500.00",
        low: "64800.00",
        close: "65200.00",
        volume: "5678.90",
        quoteVolume: "369567000.00",
        trades: 987,
      },
    ]);
  });

  it("maps getOrderBook to fetchOrderBook and preserves the current output schema", async () => {
    invokeMocks.invokeCcxtPublicCall.mockResolvedValueOnce({
      exchangeId: "binance",
      method: "fetchOrderBook",
      classification: "public",
      result: {
        nonce: 123456789,
        bids: [
          ["64999.00", "0.500"],
          ["64998.00", "1.200"],
        ],
        asks: [
          ["65001.00", "0.300"],
          ["65002.00", "0.800"],
        ],
      },
    });

    const result = await getOrderBook({ symbol: "BTCUSDT", limit: "50" });

    expect(invokeMocks.invokeCcxtPublicCall).toHaveBeenCalledWith(
      {
        exchange: "binance",
        method: "fetchOrderBook",
        args: ["BTC/USDT", 50],
      },
      expect.anything()
    );
    expect(result).toEqual({
      lastUpdateId: 123456789,
      bids: [
        { price: "64999.00", quantity: "0.500" },
        { price: "64998.00", quantity: "1.200" },
      ],
      asks: [
        { price: "65001.00", quantity: "0.300" },
        { price: "65002.00", quantity: "0.800" },
      ],
    });
  });

  it("maps getFundingRates through a CCXT funding-rate method and preserves the current output schema", async () => {
    invokeMocks.invokeCcxtPublicCall.mockResolvedValueOnce({
      exchangeId: "binance",
      method: "fetchFundingRateHistory",
      classification: "public",
      result: [
        {
          timestamp: 1710547200000,
          fundingRate: "0.00010000",
          info: { markPrice: "65000.00" },
        },
        {
          timestamp: 1710518400000,
          fundingRate: "0.00008000",
          info: { markPrice: "64200.00" },
        },
      ],
    });

    const result = await getFundingRates({ symbol: "BTCUSDT", limit: 50 });

    expect(invokeMocks.invokeCcxtPublicCall).toHaveBeenCalledWith(
      {
        exchange: "binance",
        method: "fetchFundingRateHistory",
        args: ["BTC/USDT", undefined, 50],
        marketType: "swap",
      },
      expect.anything()
    );
    expect(result).toEqual([
      {
        fundingTime: 1710547200000,
        fundingRate: "0.00010000",
        markPrice: "65000.00",
      },
      {
        fundingTime: 1710518400000,
        fundingRate: "0.00008000",
        markPrice: "64200.00",
      },
    ]);
  });

  // ── Error-path tests ──────────────────────────────────────────

  it("throws when getTicker receives a non-object CCXT response", async () => {
    invokeMocks.invokeCcxtPublicCall.mockResolvedValueOnce({
      exchangeId: "binance",
      method: "fetchTicker",
      classification: "public",
      result: "not-an-object",
    });

    await expect(getTicker({ symbol: "BTCUSDT" })).rejects.toThrow(
      "CCXT ticker response must be an object"
    );
  });

  it("throws when getKlines receives a non-array CCXT response", async () => {
    invokeMocks.invokeCcxtPublicCall.mockResolvedValueOnce({
      exchangeId: "binance",
      method: "fetchOHLCV",
      classification: "public",
      result: { unexpected: true },
    });

    await expect(getKlines({ symbol: "BTCUSDT", interval: "1h" })).rejects.toThrow(
      "CCXT OHLCV response must be an array"
    );
  });

  it("throws when getKlines receives a malformed OHLCV entry", async () => {
    invokeMocks.invokeCcxtPublicCall.mockResolvedValueOnce({
      exchangeId: "binance",
      method: "fetchOHLCV",
      classification: "public",
      result: [[1710547200000, "64000"]],
    });

    await expect(getKlines({ symbol: "BTCUSDT", interval: "1h" })).rejects.toThrow(
      "CCXT OHLCV entry must be an array with at least 6 values"
    );
  });

  it("throws when getOrderBook receives a response without bid/ask arrays", async () => {
    invokeMocks.invokeCcxtPublicCall.mockResolvedValueOnce({
      exchangeId: "binance",
      method: "fetchOrderBook",
      classification: "public",
      result: { bids: "not-an-array", asks: [] },
    });

    await expect(getOrderBook({ symbol: "BTCUSDT" })).rejects.toThrow(
      "CCXT order book response must include bid and ask arrays"
    );
  });

  it("throws when getFundingRates receives a non-array CCXT response", async () => {
    invokeMocks.invokeCcxtPublicCall.mockResolvedValueOnce({
      exchangeId: "binance",
      method: "fetchFundingRateHistory",
      classification: "public",
      result: { unexpected: true },
    });

    await expect(getFundingRates({ symbol: "BTCUSDT" })).rejects.toThrow(
      "CCXT funding-rate response must be an array"
    );
  });

  it("throws when a funding-rate entry is not an object", async () => {
    invokeMocks.invokeCcxtPublicCall.mockResolvedValueOnce({
      exchangeId: "binance",
      method: "fetchFundingRateHistory",
      classification: "public",
      result: ["not-an-object"],
    });

    await expect(getFundingRates({ symbol: "BTCUSDT" })).rejects.toThrow(
      "CCXT funding-rate entry must be an object"
    );
  });
});
