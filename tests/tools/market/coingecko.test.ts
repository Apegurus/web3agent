import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockResilientFetch = vi.hoisted(() => vi.fn());
vi.mock("../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: mockResilientFetch,
}));

vi.mock("../../../src/tools/market/cache.js", () => ({
  ttlCache: vi.fn((_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher()),
}));

import {
  getCategories,
  getTokenHistory,
  getTopTokens,
  getTrending,
  searchToken,
} from "../../../src/tools/market/coingecko.js";

beforeEach(() => {
  mockResilientFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── getTrending ──────────────────────────────────────────────────

const mockTrendingResponse = {
  coins: [
    {
      item: {
        id: "bitcoin",
        name: "Bitcoin",
        symbol: "BTC",
        market_cap_rank: 1,
      },
    },
    {
      item: {
        id: "ethereum",
        name: "Ethereum",
        symbol: "ETH",
        market_cap_rank: 2,
      },
    },
  ],
};

const mockMarketsResponse = [
  {
    id: "bitcoin",
    name: "Bitcoin",
    symbol: "btc",
    market_cap_rank: 1,
    current_price: 65000,
    price_change_percentage_24h: 2.5,
    market_cap: 1280000000000,
    total_volume: 45000000000,
  },
  {
    id: "ethereum",
    name: "Ethereum",
    symbol: "eth",
    market_cap_rank: 2,
    current_price: 3500,
    price_change_percentage_24h: 1.8,
    market_cap: 420000000000,
    total_volume: 20000000000,
  },
];

describe("getTrending", () => {
  it("fetches trending coins and enriches with market data", async () => {
    mockResilientFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(mockTrendingResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(mockMarketsResponse), { status: 200 }));

    const result = await getTrending({});

    expect(result.coins).toHaveLength(2);
    expect(result.coins[0]).toEqual({
      name: "Bitcoin",
      symbol: "btc",
      marketCapRank: 1,
      price: 65000,
      priceChange24h: 2.5,
      marketCap: 1280000000000,
      volume24h: 45000000000,
    });
    expect(result.coins[1]).toEqual({
      name: "Ethereum",
      symbol: "eth",
      marketCapRank: 2,
      price: 3500,
      priceChange24h: 1.8,
      marketCap: 420000000000,
      volume24h: 20000000000,
    });
  });

  it("respects limit parameter", async () => {
    mockResilientFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(mockTrendingResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(mockMarketsResponse), { status: 200 }));

    const result = await getTrending({ limit: 1 });

    expect(result.coins).toHaveLength(1);
  });

  it("returns base data with warning when enrichment fails", async () => {
    mockResilientFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(mockTrendingResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }));

    const result = await getTrending({});

    expect(result.coins).toHaveLength(2);
    expect(result.warnings).toContain("Market data enrichment unavailable");
    // Base data from trending endpoint
    expect(result.coins[0]).toMatchObject({
      name: "Bitcoin",
      symbol: "BTC",
      marketCapRank: 1,
    });
  });

  it("returns base data with warning when enrichment fetch throws", async () => {
    mockResilientFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(mockTrendingResponse), { status: 200 }))
      .mockRejectedValueOnce(new Error("network error"));

    const result = await getTrending({});

    expect(result.coins).toHaveLength(2);
    expect(result.warnings).toContain("Market data enrichment unavailable");
  });

  it("uses default limit of 10", async () => {
    const manyCoins = Array.from({ length: 15 }, (_, i) => ({
      item: { id: `coin${i}`, name: `Coin ${i}`, symbol: `C${i}`, market_cap_rank: i + 1 },
    }));

    mockResilientFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ coins: manyCoins }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const result = await getTrending({});

    // 15 coins fetched but limit defaults to 10
    expect(result.coins).toHaveLength(10);
  });
});

// ── getTopTokens ─────────────────────────────────────────────────

const mockTopTokensResponse = [
  {
    id: "bitcoin",
    name: "Bitcoin",
    symbol: "btc",
    market_cap_rank: 1,
    current_price: 65000,
    price_change_percentage_24h: 2.5,
    price_change_percentage_7d_in_currency: 5.2,
    market_cap: 1280000000000,
    total_volume: 45000000000,
    circulating_supply: 19700000,
    ath: 73000,
    ath_date: "2024-03-14T07:10:36.635Z",
  },
];

describe("getTopTokens", () => {
  it("fetches top tokens with default parameters", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockTopTokensResponse), { status: 200 })
    );

    const result = await getTopTokens({});

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Bitcoin",
      symbol: "btc",
      marketCapRank: 1,
      currentPrice: 65000,
      priceChange24h: 2.5,
      priceChange7d: 5.2,
      marketCap: 1280000000000,
      totalVolume: 45000000000,
      circulatingSupply: 19700000,
      ath: 73000,
      athDate: "2024-03-14T07:10:36.635Z",
    });
  });

  it("maps marketCap order to market_cap_desc", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockTopTokensResponse), { status: 200 })
    );

    await getTopTokens({ order: "marketCap" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("order=market_cap_desc"),
      expect.anything(),
      expect.anything()
    );
  });

  it("maps volume order to volume_desc", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockTopTokensResponse), { status: 200 })
    );

    await getTopTokens({ order: "volume" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("order=volume_desc"),
      expect.anything(),
      expect.anything()
    );
  });

  it("passes category when provided", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockTopTokensResponse), { status: 200 })
    );

    await getTopTokens({ category: "decentralized-finance-defi" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("category=decentralized-finance-defi"),
      expect.anything(),
      expect.anything()
    );
  });

  it("uses default limit of 20", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockTopTokensResponse), { status: 200 })
    );

    await getTopTokens({});

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("per_page=20"),
      expect.anything(),
      expect.anything()
    );
  });
});

// ── searchToken ──────────────────────────────────────────────────

const mockSearchResponse = {
  coins: [
    {
      id: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC",
      market_cap_rank: 1,
      thumb: "https://example.com/btc.png",
    },
    {
      id: "bitcoin-cash",
      name: "Bitcoin Cash",
      symbol: "BCH",
      market_cap_rank: 15,
      thumb: "https://example.com/bch.png",
    },
  ],
};

describe("searchToken", () => {
  it("searches for tokens by query", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockSearchResponse), { status: 200 })
    );

    const result = await searchToken({ query: "bitcoin" });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC",
      marketCapRank: 1,
      thumb: "https://example.com/btc.png",
    });
  });

  it("passes query to API", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockSearchResponse), { status: 200 })
    );

    await searchToken({ query: "eth" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("query=eth"),
      expect.anything(),
      expect.anything()
    );
  });
});

// ── getCategories ────────────────────────────────────────────────

const mockCategoriesResponse = [
  {
    id: "decentralized-finance-defi",
    name: "Decentralized Finance (DeFi)",
    market_cap: 120000000000,
    market_cap_change_24h: 3.5,
    volume_24h: 15000000000,
    top_3_coins: ["https://coin1.png", "https://coin2.png", "https://coin3.png"],
    updated_at: "2024-03-14T07:10:36.635Z",
  },
];

describe("getCategories", () => {
  it("fetches categories with default parameters", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockCategoriesResponse), { status: 200 })
    );

    const result = await getCategories({});

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Decentralized Finance (DeFi)",
      marketCap: 120000000000,
      marketCapChange24h: 3.5,
      volume24h: 15000000000,
      topCoins: ["https://coin1.png", "https://coin2.png", "https://coin3.png"],
      updatedAt: "2024-03-14T07:10:36.635Z",
    });
  });

  it("maps marketCap order to market_cap_desc", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockCategoriesResponse), { status: 200 })
    );

    await getCategories({ order: "marketCap" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("order=market_cap_desc"),
      expect.anything(),
      expect.anything()
    );
  });

  it("maps name order to name_asc", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockCategoriesResponse), { status: 200 })
    );

    await getCategories({ order: "name" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("order=name_asc"),
      expect.anything(),
      expect.anything()
    );
  });

  it("maps marketCapChange24h order to market_cap_change_24h_desc", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockCategoriesResponse), { status: 200 })
    );

    await getCategories({ order: "marketCapChange24h" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("order=market_cap_change_24h_desc"),
      expect.anything(),
      expect.anything()
    );
  });

  it("respects limit parameter", async () => {
    const manyCategories = Array.from({ length: 30 }, (_, i) => ({
      id: `cat${i}`,
      name: `Category ${i}`,
      market_cap: i * 1000000,
      market_cap_change_24h: 0,
      volume_24h: 0,
      top_3_coins: [],
      updated_at: "2024-01-01T00:00:00.000Z",
    }));

    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(manyCategories), { status: 200 })
    );

    const result = await getCategories({ limit: 5 });

    expect(result).toHaveLength(5);
  });
});

// ── getTokenHistory ──────────────────────────────────────────────

const mockMarketChartResponse = {
  prices: [
    [1710547200000, 65000],
    [1710460800000, 64000],
    [1710374400000, 63000],
  ],
  market_caps: [
    [1710547200000, 1280000000000],
    [1710460800000, 1260000000000],
    [1710374400000, 1240000000000],
  ],
  total_volumes: [
    [1710547200000, 45000000000],
    [1710460800000, 44000000000],
    [1710374400000, 43000000000],
  ],
};

const mockDefiLlamaChartResponse = {
  coins: {
    "ethereum:0xtoken": {
      prices: [
        { timestamp: 1710547200, price: 65000, confidence: 0.99 },
        { timestamp: 1710460800, price: 64000, confidence: 0.99 },
      ],
    },
  },
};

describe("getTokenHistory", () => {
  it("fetches token history from CoinGecko by ID", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockMarketChartResponse), { status: 200 })
    );

    const result = await getTokenHistory({ token: "bitcoin" });

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      timestamp: new Date(1710547200000).toISOString(),
      price: 65000,
      marketCap: 1280000000000,
      volume: 45000000000,
    });
  });

  it("maps period to correct days parameter", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockMarketChartResponse), { status: 200 })
    );

    await getTokenHistory({ token: "bitcoin", period: "7d" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("days=7"),
      expect.anything(),
      expect.anything()
    );
  });

  it("maps 1y period to 365 days", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockMarketChartResponse), { status: 200 })
    );

    await getTokenHistory({ token: "bitcoin", period: "1y" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("days=365"),
      expect.anything(),
      expect.anything()
    );
  });

  it("uses default period of 30d", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockMarketChartResponse), { status: 200 })
    );

    await getTokenHistory({ token: "bitcoin" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("days=30"),
      expect.anything(),
      expect.anything()
    );
  });

  it("uses DefiLlama directly for chain:address format", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockDefiLlamaChartResponse), { status: 200 })
    );

    const result = await getTokenHistory({ token: "ethereum:0xtoken" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("coins.llama.fi/chart/ethereum:0xtoken"),
      undefined,
      expect.objectContaining({ label: "defillama" })
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      timestamp: new Date(1710547200 * 1000).toISOString(),
      price: 65000,
    });
  });

  it("falls back to DefiLlama on CoinGecko non-2xx response — chain:address goes directly to DefiLlama", async () => {
    // chain:address tokens bypass CoinGecko entirely and go directly to DefiLlama
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockDefiLlamaChartResponse), { status: 200 })
    );

    const result = await getTokenHistory({ token: "ethereum:0xtoken" });

    // Only one call — DefiLlama directly
    expect(mockResilientFetch).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
  });

  it("falls back to DefiLlama on CoinGecko failure for ID that has no chain:address", async () => {
    // When CoinGecko fails for a plain ID (no chain:address), throw error
    mockResilientFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    await expect(getTokenHistory({ token: "unknown-coin-id" })).rejects.toThrow();
  });

  it("DefiLlama uses hourly resolution for periods <= 7d", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockDefiLlamaChartResponse), { status: 200 })
    );

    await getTokenHistory({ token: "ethereum:0xtoken", period: "7d" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("period=1h"),
      undefined,
      expect.objectContaining({ label: "defillama" })
    );
  });

  it("DefiLlama uses daily resolution for periods > 7d", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockDefiLlamaChartResponse), { status: 200 })
    );

    await getTokenHistory({ token: "ethereum:0xtoken", period: "30d" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("period=1d"),
      undefined,
      expect.objectContaining({ label: "defillama" })
    );
  });
});
