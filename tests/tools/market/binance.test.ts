import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const mockResilientFetch = vi.hoisted(() => vi.fn());
vi.mock("../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: mockResilientFetch,
}));

import {
  getFundingRates,
  getKlines,
  getOrderBook,
  getTicker,
} from "../../../src/tools/market/binance.js";

beforeEach(() => {
  mockResilientFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── getTicker ────────────────────────────────────────────────────

describe("getTicker", () => {
  const mockTickerResponse = {
    symbol: "BTCUSDT",
    lastPrice: "65000.00",
    priceChange: "1000.00",
    priceChangePercent: "1.56",
    highPrice: "66000.00",
    lowPrice: "63500.00",
    volume: "12345.67",
    quoteVolume: "802567890.12",
    bidPrice: "64999.00",
    askPrice: "65001.00",
  };

  it("fetches and returns ticker data", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockTickerResponse), { status: 200 })
    );

    const result = await getTicker({ symbol: "BTCUSDT" });

    expect(result).toEqual({
      symbol: "BTCUSDT",
      lastPrice: "65000.00",
      priceChange: "1000.00",
      priceChangePercent: "1.56",
      highPrice: "66000.00",
      lowPrice: "63500.00",
      volume: "12345.67",
      quoteVolume: "802567890.12",
      bidPrice: "64999.00",
      askPrice: "65001.00",
    });
  });

  it("calls correct Binance endpoint", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockTickerResponse), { status: 200 })
    );

    await getTicker({ symbol: "ETHUSDT" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      "https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT",
      undefined,
      { label: "binance-ticker" }
    );
  });

  it("throws on geo-restriction (451)", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response("Unavailable For Legal Reasons", { status: 451 })
    );

    await expect(getTicker({ symbol: "BTCUSDT" })).rejects.toThrow(
      "Binance API is not available in your region"
    );
  });

  it("throws on 403 as generic error (not geo-restriction)", async () => {
    mockResilientFetch.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    await expect(getTicker({ symbol: "BTCUSDT" })).rejects.toThrow("403");
  });

  it("throws on non-ok response", async () => {
    mockResilientFetch.mockResolvedValueOnce(new Response("Bad Request", { status: 400 }));

    await expect(getTicker({ symbol: "INVALID" })).rejects.toThrow();
  });

  it("throws when a 200 ticker response is missing required fields", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ lastPrice: "65000.00" }), { status: 200 })
    );

    await expect(getTicker({ symbol: "BTCUSDT" })).rejects.toThrow();
  });
});

// ── getKlines ────────────────────────────────────────────────────

describe("getKlines", () => {
  const mockKlinesResponse = [
    [
      1710547200000, // openTime
      "64000.00", // open
      "66000.00", // high
      "63500.00", // low
      "65000.00", // close
      "12345.67", // volume
      1710547260000, // closeTime
      "802567890.12", // quoteVolume
      1234, // trades
      "6000.00", // takerBuyBase
      "390000000.00", // takerBuyQuote
      "0", // ignore
    ],
    [
      1710547260000,
      "65000.00",
      "65500.00",
      "64800.00",
      "65200.00",
      "5678.90",
      1710547320000,
      "369567000.00",
      987,
      "2800.00",
      "182400000.00",
      "0",
    ],
  ];

  it("fetches and transforms klines data", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockKlinesResponse), { status: 200 })
    );

    const result = await getKlines({ symbol: "BTCUSDT", interval: "1h" });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      openTime: 1710547200000,
      open: "64000.00",
      high: "66000.00",
      low: "63500.00",
      close: "65000.00",
      volume: "12345.67",
      quoteVolume: "802567890.12",
      trades: 1234,
    });
  });

  it("uses default limit of 100", async () => {
    mockResilientFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await getKlines({ symbol: "BTCUSDT", interval: "1d" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=100",
      undefined,
      { label: "binance-klines" }
    );
  });

  it("uses provided limit", async () => {
    mockResilientFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await getKlines({ symbol: "BTCUSDT", interval: "1h", limit: 50 });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=50",
      undefined,
      { label: "binance-klines" }
    );
  });

  it("throws on geo-restriction (451)", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response("Unavailable For Legal Reasons", { status: 451 })
    );

    await expect(getKlines({ symbol: "BTCUSDT", interval: "1h" })).rejects.toThrow(
      "Binance API is not available in your region"
    );
  });

  it("throws on non-ok response", async () => {
    mockResilientFetch.mockResolvedValueOnce(new Response("Bad Request", { status: 400 }));

    await expect(getKlines({ symbol: "INVALID", interval: "1h" })).rejects.toThrow();
  });
});

// ── getOrderBook ─────────────────────────────────────────────────

describe("getOrderBook", () => {
  const mockOrderBookResponse = {
    lastUpdateId: 123456789,
    bids: [
      ["64999.00", "0.500"],
      ["64998.00", "1.200"],
      ["64997.00", "2.100"],
    ],
    asks: [
      ["65001.00", "0.300"],
      ["65002.00", "0.800"],
      ["65003.00", "1.500"],
    ],
  };

  it("fetches and transforms order book data", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockOrderBookResponse), { status: 200 })
    );

    const result = await getOrderBook({ symbol: "BTCUSDT" });

    expect(result.lastUpdateId).toBe(123456789);
    expect(result.bids).toEqual([
      { price: "64999.00", quantity: "0.500" },
      { price: "64998.00", quantity: "1.200" },
      { price: "64997.00", quantity: "2.100" },
    ]);
    expect(result.asks).toEqual([
      { price: "65001.00", quantity: "0.300" },
      { price: "65002.00", quantity: "0.800" },
      { price: "65003.00", quantity: "1.500" },
    ]);
  });

  it("uses default limit of 20", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockOrderBookResponse), { status: 200 })
    );

    await getOrderBook({ symbol: "BTCUSDT" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=20",
      undefined,
      { label: "binance-orderbook" }
    );
  });

  it("uses provided limit", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockOrderBookResponse), { status: 200 })
    );

    await getOrderBook({ symbol: "BTCUSDT", limit: "50" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=50",
      undefined,
      { label: "binance-orderbook" }
    );
  });

  it("throws on geo-restriction (451)", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response("Unavailable For Legal Reasons", { status: 451 })
    );

    await expect(getOrderBook({ symbol: "BTCUSDT" })).rejects.toThrow(
      "Binance API is not available in your region"
    );
  });

  it("throws on non-ok response", async () => {
    mockResilientFetch.mockResolvedValueOnce(new Response("Bad Request", { status: 400 }));

    await expect(getOrderBook({ symbol: "INVALID" })).rejects.toThrow();
  });

  it("throws when a 200 order book response has invalid levels", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ lastUpdateId: 123, bids: "oops", asks: [] }), { status: 200 })
    );

    await expect(getOrderBook({ symbol: "BTCUSDT" })).rejects.toBeInstanceOf(ZodError);
  });
});

// ── getFundingRates ──────────────────────────────────────────────

describe("getFundingRates", () => {
  const mockFundingRatesResponse = [
    {
      symbol: "BTCUSDT",
      fundingTime: 1710547200000,
      fundingRate: "0.00010000",
      markPrice: "65000.00",
    },
    {
      symbol: "BTCUSDT",
      fundingTime: 1710518400000,
      fundingRate: "0.00008000",
      markPrice: "64200.00",
    },
  ];

  it("fetches and transforms funding rates data", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockFundingRatesResponse), { status: 200 })
    );

    const result = await getFundingRates({ symbol: "BTCUSDT" });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      fundingTime: 1710547200000,
      fundingRate: "0.00010000",
      markPrice: "65000.00",
    });
    expect(result[1]).toEqual({
      fundingTime: 1710518400000,
      fundingRate: "0.00008000",
      markPrice: "64200.00",
    });
  });

  it("uses default limit of 10", async () => {
    mockResilientFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await getFundingRates({ symbol: "BTCUSDT" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=10",
      undefined,
      { label: "binance-funding" }
    );
  });

  it("uses provided limit", async () => {
    mockResilientFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await getFundingRates({ symbol: "BTCUSDT", limit: 50 });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=50",
      undefined,
      { label: "binance-funding" }
    );
  });

  it("throws on geo-restriction (451)", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response("Unavailable For Legal Reasons", { status: 451 })
    );

    await expect(getFundingRates({ symbol: "BTCUSDT" })).rejects.toThrow(
      "Binance API is not available in your region"
    );
  });

  it("throws on 403 as generic error (not geo-restriction)", async () => {
    mockResilientFetch.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    await expect(getFundingRates({ symbol: "BTCUSDT" })).rejects.toThrow("403");
  });

  it("throws on non-ok response", async () => {
    mockResilientFetch.mockResolvedValueOnce(new Response("Bad Request", { status: 400 }));

    await expect(getFundingRates({ symbol: "INVALID" })).rejects.toThrow();
  });

  it("throws when a 200 funding response is missing required fields", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ fundingTime: 1710547200000, markPrice: "65000.00" }]), {
        status: 200,
      })
    );

    await expect(getFundingRates({ symbol: "BTCUSDT" })).rejects.toThrow();
  });
});
