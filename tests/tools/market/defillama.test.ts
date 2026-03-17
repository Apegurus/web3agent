import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCexFundFlows,
  getChainTvl,
  getDexVolume,
  getExchangeRankings,
  getGainersLosers,
  getGlobalStats,
  getProtocolTvl,
  getStablecoinStats,
  getTokenPrice,
  getTopProtocols,
} from "../../../src/tools/market/defillama.js";

vi.mock("../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: vi.fn(),
}));

vi.mock("../../../src/tools/market/cache.js", () => ({
  ttlCache: vi.fn((_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher()),
}));

import { resilientFetch } from "../../../src/utils/resilient-fetch.js";

const mockFetch = vi.mocked(resilientFetch);

function mockResponse(data: unknown): Response {
  return {
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getProtocolTvl", () => {
  it("returns normalized TVL data for a protocol", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        name: "Aave",
        tvl: 5_000_000_000,
        change_1d: 1.5,
        change_7d: -3.2,
        change_1m: 10.0,
        chainTvls: { Ethereum: 3_000_000_000, Arbitrum: 2_000_000_000 },
        category: "Lending",
        url: "https://aave.com",
      })
    );

    const result = await getProtocolTvl({ protocol: "aave" });

    expect(result).toEqual({
      name: "Aave",
      tvl: 5_000_000_000,
      tvlChange1d: 1.5,
      tvlChange7d: -3.2,
      tvlChange30d: 10.0,
      chainTvls: { Ethereum: 3_000_000_000, Arbitrum: 2_000_000_000 },
      category: "Lending",
      url: "https://aave.com",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.llama.fi/protocol/aave",
      undefined,
      expect.any(Object)
    );
  });

  it("handles missing optional fields gracefully", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        name: "SomeProtocol",
        tvl: 100_000,
        chainTvls: {},
        category: "DEX",
        url: "https://example.com",
      })
    );

    const result = await getProtocolTvl({ protocol: "someprotocol" });

    expect(result.tvlChange1d).toBeUndefined();
    expect(result.tvlChange7d).toBeUndefined();
    expect(result.tvlChange30d).toBeUndefined();
  });
});

describe("getTopProtocols", () => {
  const rawProtocols = [
    {
      name: "Aave",
      tvl: 5_000_000_000,
      change_1d: 1.5,
      chains: ["Ethereum"],
      category: "Lending",
      slug: "aave",
    },
    {
      name: "Uniswap",
      tvl: 3_000_000_000,
      change_1d: -0.5,
      chains: ["Ethereum", "Arbitrum"],
      category: "Dexes",
      slug: "uniswap",
    },
    {
      name: "Compound",
      tvl: 1_000_000_000,
      change_1d: 0.1,
      chains: ["Ethereum"],
      category: "Lending",
      slug: "compound",
    },
  ];

  it("returns top protocols sorted by TVL", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawProtocols));

    const result = await getTopProtocols({});

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("Aave");
    expect(result[0].tvl).toBe(5_000_000_000);
    expect(result[0].tvlChange1d).toBe(1.5);
  });

  it("filters by chain when provided", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawProtocols));

    const result = await getTopProtocols({ chain: "Arbitrum" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Uniswap");
  });

  it("filters by category when provided", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawProtocols));

    const result = await getTopProtocols({ category: "Lending" });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Aave");
    expect(result[1].name).toBe("Compound");
  });

  it("respects limit parameter", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawProtocols));

    const result = await getTopProtocols({ limit: 2 });

    expect(result).toHaveLength(2);
  });

  it("defaults to limit 20", async () => {
    const manyProtocols = Array.from({ length: 30 }, (_, i) => ({
      name: `Protocol${i}`,
      tvl: 30 - i,
      change_1d: 0,
      chains: ["Ethereum"],
      category: "Dexes",
      slug: `protocol${i}`,
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyProtocols));

    const result = await getTopProtocols({});

    expect(result).toHaveLength(20);
  });
});

describe("getChainTvl", () => {
  it("returns array of date/tvl pairs with ISO dates", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse([
        { date: 1700000000, tvl: 50_000_000_000 },
        { date: 1700086400, tvl: 51_000_000_000 },
      ])
    );

    const result = await getChainTvl({ chain: "Ethereum" });

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe(new Date(1700000000 * 1000).toISOString());
    expect(result[0].tvl).toBe(50_000_000_000);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.llama.fi/v2/historicalChainTvl/Ethereum",
      undefined,
      expect.any(Object)
    );
  });
});

describe("getTokenPrice", () => {
  it("returns coin prices keyed by token ID", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        coins: {
          "ethereum:0xabc": {
            price: 3000.5,
            symbol: "WETH",
            decimals: 18,
            confidence: 0.99,
            timestamp: 1700000000,
          },
        },
      })
    );

    const result = await getTokenPrice({ tokens: ["ethereum:0xabc"] });

    expect(result.coins["ethereum:0xabc"]).toEqual({
      price: 3000.5,
      symbol: "WETH",
      decimals: 18,
      confidence: 0.99,
      timestamp: 1700000000,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://coins.llama.fi/prices/current/ethereum:0xabc",
      undefined,
      expect.any(Object)
    );
  });

  it("joins multiple tokens with commas", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ coins: {} }));

    await getTokenPrice({ tokens: ["coingecko:bitcoin", "coingecko:ethereum"] });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://coins.llama.fi/prices/current/coingecko:bitcoin,coingecko:ethereum",
      undefined,
      expect.any(Object)
    );
  });

  it("appends searchWidth when provided", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ coins: {} }));

    await getTokenPrice({ tokens: ["coingecko:bitcoin"], searchWidth: "4h" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://coins.llama.fi/prices/current/coingecko:bitcoin?searchWidth=4h",
      undefined,
      expect.any(Object)
    );
  });
});

describe("getGainersLosers", () => {
  it("returns gainers and losers sorted by price change", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        coins: {
          BTC: 5.0,
          ETH: -3.0,
          SOL: 15.0,
          AVAX: -8.0,
          LINK: 2.0,
        },
      })
    );

    const result = await getGainersLosers({ limit: 2 });

    expect(result.gainers).toHaveLength(2);
    expect(result.losers).toHaveLength(2);
    expect(result.gainers[0].symbol).toBe("SOL");
    expect(result.gainers[0].priceChange).toBe(15.0);
    expect(result.losers[0].symbol).toBe("AVAX");
    expect(result.losers[0].priceChange).toBe(-8.0);
  });

  it("uses 24h period by default", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ coins: {} }));

    await getGainersLosers({});

    expect(mockFetch).toHaveBeenCalledWith(
      "https://coins.llama.fi/percentage/24h",
      undefined,
      expect.any(Object)
    );
  });

  it("defaults to limit 10", async () => {
    const coins: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      coins[`TOKEN${i}`] = i - 15;
    }
    mockFetch.mockResolvedValueOnce(mockResponse({ coins }));

    const result = await getGainersLosers({});

    expect(result.gainers).toHaveLength(10);
    expect(result.losers).toHaveLength(10);
  });
});

describe("getDexVolume", () => {
  it("returns total volume and protocol list for all chains", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        total24h: 1_000_000_000,
        protocols: [
          { name: "Uniswap", total24h: 600_000_000, change_1d: 5.0 },
          { name: "Curve", total24h: 400_000_000, change_1d: -2.0 },
        ],
      })
    );

    const result = await getDexVolume({});

    expect(result.totalVolume24h).toBe(1_000_000_000);
    expect(result.protocols).toHaveLength(2);
    expect(result.protocols[0].name).toBe("Uniswap");
    expect(result.protocols[0].volume24h).toBe(600_000_000);
    expect(result.protocols[0].change1d).toBe(5.0);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.llama.fi/overview/dexs",
      undefined,
      expect.any(Object)
    );
  });

  it("uses chain-specific endpoint when chain is provided", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ total24h: 500_000_000, protocols: [] }));

    await getDexVolume({ chain: "Arbitrum" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.llama.fi/overview/dexs/Arbitrum",
      undefined,
      expect.any(Object)
    );
  });
});

describe("getStablecoinStats", () => {
  it("returns normalized stablecoin data", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        peggedAssets: [
          {
            name: "Tether",
            symbol: "USDT",
            circulating: { peggedUSD: 80_000_000_000 },
            pegDeviation: 0.001,
          },
          {
            name: "USD Coin",
            symbol: "USDC",
            circulating: { peggedUSD: 40_000_000_000 },
            pegDeviation: 0.0005,
          },
        ],
      })
    );

    const result = await getStablecoinStats({});

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Tether");
    expect(result[0].symbol).toBe("USDT");
    expect(result[0].totalCirculating).toBe(80_000_000_000);
    expect(result[0].pegDeviation).toBe(0.001);
    expect(result[0].dominance).toBeCloseTo(66.67, 0);
  });

  it("filters by chain when provided", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        peggedAssets: [
          {
            name: "Tether",
            symbol: "USDT",
            circulating: { peggedUSD: 80_000_000_000 },
            pegDeviation: 0,
            chainCirculating: {
              Ethereum: { current: { peggedUSD: 40_000_000_000 } },
              Tron: { current: { peggedUSD: 40_000_000_000 } },
            },
          },
          {
            name: "USD Coin",
            symbol: "USDC",
            circulating: { peggedUSD: 40_000_000_000 },
            pegDeviation: 0,
            chainCirculating: {
              Tron: { current: { peggedUSD: 40_000_000_000 } },
            },
          },
        ],
      })
    );

    const result = await getStablecoinStats({ chain: "Ethereum" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Tether");
  });
});

describe("getGlobalStats", () => {
  it("returns global market statistics", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        data: {
          total_market_cap: { usd: 2_000_000_000_000 },
          total_volume: { usd: 100_000_000_000 },
          market_cap_percentage: { btc: 50.5, eth: 18.0 },
          market_cap_change_percentage_24h_usd: 2.5,
          defi_market_cap: "300000000000",
          defi_volume_24h: "50000000000",
        },
      })
    );

    const result = await getGlobalStats({});

    expect(result.totalMarketCap).toBe(2_000_000_000_000);
    expect(result.totalVolume24h).toBe(100_000_000_000);
    expect(result.btcDominance).toBe(50.5);
    expect(result.ethDominance).toBe(18.0);
    expect(result.marketCapChange24h).toBe(2.5);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://fe-cache.llama.fi/cg_market_data",
      undefined,
      expect.any(Object)
    );
  });
});

describe("getCexFundFlows", () => {
  it("returns normalized fund flow data with computed netFlow", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse([
        {
          symbol: "BTC",
          deposit_count: 1000,
          withdraw_count: 800,
          deposit_sum_usd: 500_000_000,
          withdraw_sum_usd: 450_000_000,
          total_users: 5000,
        },
        {
          symbol: "ETH",
          deposit_count: 2000,
          withdraw_count: 1500,
          deposit_sum_usd: 300_000_000,
          withdraw_sum_usd: 350_000_000,
          total_users: 8000,
        },
      ])
    );

    const result = await getCexFundFlows({});

    expect(result).toHaveLength(2);
    expect(result[0].symbol).toBe("BTC");
    expect(result[0].depositCount).toBe(1000);
    expect(result[0].withdrawCount).toBe(800);
    expect(result[0].depositSumUsd).toBe(500_000_000);
    expect(result[0].withdrawSumUsd).toBe(450_000_000);
    expect(result[0].netFlow).toBe(50_000_000);
    expect(result[0].totalUsers).toBe(5000);
    expect(result[1].netFlow).toBe(-50_000_000);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://feed-api.llama.fi/flows",
      undefined,
      expect.any(Object)
    );
  });

  it("respects limit parameter", async () => {
    const flows = Array.from({ length: 30 }, (_, i) => ({
      symbol: `TOKEN${i}`,
      deposit_count: i,
      withdraw_count: i,
      deposit_sum_usd: i * 1000,
      withdraw_sum_usd: i * 900,
      total_users: i * 10,
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(flows));

    const result = await getCexFundFlows({ limit: 5 });

    expect(result).toHaveLength(5);
  });

  it("defaults to limit 20", async () => {
    const flows = Array.from({ length: 30 }, (_, i) => ({
      symbol: `TOKEN${i}`,
      deposit_count: i,
      withdraw_count: i,
      deposit_sum_usd: i * 1000,
      withdraw_sum_usd: i * 900,
      total_users: i * 10,
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(flows));

    const result = await getCexFundFlows({});

    expect(result).toHaveLength(20);
  });
});

describe("getExchangeRankings", () => {
  it("returns normalized exchange rankings", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        data: [
          {
            name: "Binance",
            trust_score: 10,
            trust_score_rank: 1,
            trade_volume_24h_btc: 1_000_000,
            country: "Cayman Islands",
            year_established: 2017,
          },
          {
            name: "Coinbase",
            trust_score: 9,
            trust_score_rank: 2,
            trade_volume_24h_btc: 500_000,
            country: "United States",
            year_established: 2012,
          },
        ],
      })
    );

    const result = await getExchangeRankings({});

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Binance");
    expect(result[0].trustScore).toBe(10);
    expect(result[0].trustScoreRank).toBe(1);
    expect(result[0].volume24hBtc).toBe(1_000_000);
    expect(result[0].country).toBe("Cayman Islands");
    expect(result[0].yearEstablished).toBe(2017);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://fe-cache.llama.fi/exchanges",
      undefined,
      expect.any(Object)
    );
  });

  it("respects limit parameter", async () => {
    const exchanges = Array.from({ length: 30 }, (_, i) => ({
      name: `Exchange${i}`,
      trust_score: 10 - i * 0.1,
      trust_score_rank: i + 1,
      trade_volume_24h_btc: 1_000_000 - i * 1000,
      country: "Unknown",
      year_established: 2010 + i,
    }));
    mockFetch.mockResolvedValueOnce(mockResponse({ data: exchanges }));

    const result = await getExchangeRankings({ limit: 5 });

    expect(result).toHaveLength(5);
  });

  it("defaults to limit 20", async () => {
    const exchanges = Array.from({ length: 30 }, (_, i) => ({
      name: `Exchange${i}`,
      trust_score: 10 - i * 0.1,
      trust_score_rank: i + 1,
      trade_volume_24h_btc: 1_000_000 - i * 1000,
      country: "Unknown",
      year_established: 2010 + i,
    }));
    mockFetch.mockResolvedValueOnce(mockResponse({ data: exchanges }));

    const result = await getExchangeRankings({});

    expect(result).toHaveLength(20);
  });
});
