import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRuntime, mockInvokeAndRequireData } = vi.hoisted(() => ({
  mockGetRuntime: vi.fn(),
  mockInvokeAndRequireData: vi.fn(),
}));

vi.mock("../../src/api/shared.js", () => ({
  getRuntime: mockGetRuntime,
  invokeAndRequireData: mockInvokeAndRequireData,
  createSDKInvoker(toolName: string) {
    return async (params: unknown, options?: unknown) => {
      const runtime = await mockGetRuntime(options);
      return mockInvokeAndRequireData(runtime, toolName, params);
    };
  },
}));

import {
  getCategories,
  getCexFundFlows,
  getChainTvl,
  getDexVolume,
  getExchangeRankings,
  getFundingRates,
  getGainersLosers,
  getGlobalStats,
  getKlines,
  getOrderBook,
  getProtocolTvl,
  getSentiment,
  getStablecoinStats,
  getTicker,
  getTokenHistory,
  getTokenPrice,
  getTopProtocols,
  getTopTokens,
  getTrending,
  searchToken,
} from "../../src/api/market.js";
import { getRuntime, invokeAndRequireData } from "../../src/api/shared.js";

describe("market SDK functions", () => {
  // biome-ignore lint/suspicious/noExplicitAny: mock runtime has no typed interface
  const mockRuntime = {} as any;

  beforeEach(() => {
    vi.mocked(getRuntime).mockResolvedValue(mockRuntime);
    vi.mocked(invokeAndRequireData).mockResolvedValue({ data: "test" });
  });

  it("getProtocolTvl invokes correct tool", async () => {
    await getProtocolTvl({ protocol: "aave" });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_protocol_tvl", {
      protocol: "aave",
    });
  });

  it("getTopProtocols invokes correct tool", async () => {
    await getTopProtocols({ chain: "Ethereum", limit: 10 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_top_protocols", {
      chain: "Ethereum",
      limit: 10,
    });
  });

  it("getChainTvl invokes correct tool", async () => {
    await getChainTvl({ chain: "Arbitrum" });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_chain_tvl", {
      chain: "Arbitrum",
    });
  });

  it("getTokenPrice invokes correct tool", async () => {
    await getTokenPrice({ tokens: ["ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"] });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_token_price", {
      tokens: ["ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
    });
  });

  it("getTokenHistory invokes correct tool", async () => {
    await getTokenHistory({ token: "bitcoin", period: "7d" });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_token_history", {
      token: "bitcoin",
      period: "7d",
    });
  });

  it("getGainersLosers invokes correct tool", async () => {
    await getGainersLosers({ period: "24h", limit: 20 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_gainers_losers", {
      period: "24h",
      limit: 20,
    });
  });

  it("getDexVolume invokes correct tool", async () => {
    await getDexVolume({ chain: "Ethereum" });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_dex_volume", {
      chain: "Ethereum",
    });
  });

  it("getStablecoinStats invokes correct tool", async () => {
    await getStablecoinStats({ chain: "Ethereum" });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_stablecoin_stats", {
      chain: "Ethereum",
    });
  });

  it("getGlobalStats invokes correct tool", async () => {
    await getGlobalStats({});
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_global_stats", {});
  });

  it("getCexFundFlows invokes correct tool", async () => {
    await getCexFundFlows({ limit: 5 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_cex_fund_flows", {
      limit: 5,
    });
  });

  it("getExchangeRankings invokes correct tool", async () => {
    await getExchangeRankings({ limit: 10 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_exchange_rankings", {
      limit: 10,
    });
  });

  it("getSentiment invokes correct tool", async () => {
    await getSentiment({ days: 7 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_sentiment", {
      days: 7,
    });
  });

  it("getTrending invokes correct tool", async () => {
    await getTrending({ limit: 10 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_trending", {
      limit: 10,
    });
  });

  it("getTopTokens invokes correct tool", async () => {
    await getTopTokens({ order: "marketCap", limit: 20 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_top_tokens", {
      order: "marketCap",
      limit: 20,
    });
  });

  it("searchToken invokes correct tool", async () => {
    await searchToken({ query: "ethereum" });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_search_token", {
      query: "ethereum",
    });
  });

  it("getCategories invokes correct tool", async () => {
    await getCategories({ order: "marketCap", limit: 10 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_categories", {
      order: "marketCap",
      limit: 10,
    });
  });

  it("getTicker invokes correct tool", async () => {
    await getTicker({ symbol: "BTCUSDT" });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_ticker", {
      symbol: "BTCUSDT",
    });
  });

  it("getKlines invokes correct tool", async () => {
    await getKlines({ symbol: "ETHUSDT", interval: "1h", limit: 100 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_klines", {
      symbol: "ETHUSDT",
      interval: "1h",
      limit: 100,
    });
  });

  it("getOrderBook invokes correct tool", async () => {
    await getOrderBook({ symbol: "BTCUSDT", limit: "20" });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_order_book", {
      symbol: "BTCUSDT",
      limit: "20",
    });
  });

  it("getFundingRates invokes correct tool", async () => {
    await getFundingRates({ symbol: "BTCUSDT", limit: 10 });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_funding_rates", {
      symbol: "BTCUSDT",
      limit: 10,
    });
  });
});
