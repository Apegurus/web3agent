import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCompareYields,
  getProtocolInfo,
  getYieldOpportunities,
} from "../../../src/tools/research/yields.js";

vi.mock("../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: vi.fn(),
}));

vi.mock("../../../src/tools/shared/cache.js", () => ({
  ttlCache: vi.fn((_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher()),
}));

import { resilientFetch } from "../../../src/utils/resilient-fetch.js";

const mockFetch = vi.mocked(resilientFetch);

function mockResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Sample pool data ─────────────────────────────────────────────

const samplePools = [
  {
    pool: "pool-1",
    project: "aave",
    chain: "Ethereum",
    symbol: "USDC",
    tvlUsd: 5_000_000,
    apy: 4.5,
    apyBase: 3.0,
    apyReward: 1.5,
    ilRisk: "NO",
    rewardTokens: ["0xabc"],
  },
  {
    pool: "pool-2",
    project: "compound",
    chain: "Arbitrum",
    symbol: "USDT",
    tvlUsd: 2_000_000,
    apy: 6.0,
    apyBase: 5.0,
    apyReward: 1.0,
    ilRisk: "NO",
    rewardTokens: [],
  },
  {
    pool: "pool-3",
    project: "uniswap",
    chain: "Ethereum",
    symbol: "USDC-ETH",
    tvlUsd: 10_000_000,
    apy: 12.0,
    apyBase: 8.0,
    apyReward: 4.0,
    ilRisk: "YES",
    rewardTokens: ["0xdef"],
  },
  {
    pool: "pool-4",
    project: "aave",
    chain: "Polygon",
    symbol: "DAI",
    tvlUsd: 50_000,
    apy: 2.0,
    apyBase: 2.0,
    apyReward: 0,
    ilRisk: "NO",
    rewardTokens: [],
  },
];

describe("getYieldOpportunities", () => {
  it("returns pools sorted by tvlUsd descending", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: samplePools }));

    const result = await getYieldOpportunities({});

    // Only pool-1, pool-2, pool-3 have tvlUsd >= 100000 (default minTvl)
    expect(result).toHaveLength(3);
    expect(result[0].pool).toBe("pool-3"); // 10_000_000
    expect(result[1].pool).toBe("pool-1"); // 5_000_000
    expect(result[2].pool).toBe("pool-2"); // 2_000_000
  });

  it("filters by token symbol (case-insensitive)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: samplePools }));

    const result = await getYieldOpportunities({ token: "usdc" });

    // pool-1 has symbol USDC, pool-3 has USDC-ETH (both contain usdc)
    expect(result).toHaveLength(2);
    const pools = result.map((r) => r.pool);
    expect(pools).toContain("pool-1");
    expect(pools).toContain("pool-3");
  });

  it("filters by chain (case-insensitive)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: samplePools }));

    const result = await getYieldOpportunities({ chain: "arbitrum" });

    expect(result).toHaveLength(1);
    expect(result[0].pool).toBe("pool-2");
  });

  it("filters by protocol (case-insensitive)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: samplePools }));

    const result = await getYieldOpportunities({ protocol: "AAVE" });

    // Only pool-1 qualifies (pool-4 has tvlUsd < 100000 default)
    expect(result).toHaveLength(1);
    expect(result[0].pool).toBe("pool-1");
  });

  it("filters by minTvl", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: samplePools }));

    const result = await getYieldOpportunities({ minTvl: 3_000_000 });

    expect(result).toHaveLength(2);
    expect(result[0].pool).toBe("pool-3");
    expect(result[1].pool).toBe("pool-1");
  });

  it("respects limit parameter", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: samplePools }));

    const result = await getYieldOpportunities({ limit: 1 });

    expect(result).toHaveLength(1);
    expect(result[0].pool).toBe("pool-3");
  });

  it("defaults to limit 20", async () => {
    const manyPools = Array.from({ length: 30 }, (_, i) => ({
      pool: `pool-${i}`,
      project: "aave",
      chain: "Ethereum",
      symbol: "USDC",
      tvlUsd: 1_000_000 + i,
      apy: 4.0,
      apyBase: 3.0,
      apyReward: 1.0,
      ilRisk: "NO",
      rewardTokens: [],
    }));
    mockFetch.mockResolvedValueOnce(mockResponse({ data: manyPools }));

    const result = await getYieldOpportunities({});

    expect(result).toHaveLength(20);
  });

  it("returns correct shape for each entry", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: [samplePools[0]] }));

    const result = await getYieldOpportunities({});

    expect(result[0]).toEqual({
      pool: "pool-1",
      project: "aave",
      chain: "Ethereum",
      symbol: "USDC",
      tvlUsd: 5_000_000,
      apy: 4.5,
      apyBase: 3.0,
      apyReward: 1.5,
      ilRisk: "NO",
      rewardTokens: ["0xabc"],
    });
  });

  it("fetches from yields.llama.fi/pools", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: [] }));

    await getYieldOpportunities({});

    expect(mockFetch).toHaveBeenCalledWith(
      "https://yields.llama.fi/pools",
      undefined,
      expect.any(Object)
    );
  });
});

describe("getCompareYields", () => {
  it("filters by token symbol and sorts by apy descending", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: samplePools }));

    const result = await getCompareYields({ token: "USDC" });

    // pool-1 (USDC, apy 4.5) and pool-3 (USDC-ETH, apy 12.0)
    expect(result).toHaveLength(2);
    expect(result[0].project).toBe("uniswap"); // highest apy
    expect(result[0].apy).toBe(12.0);
    expect(result[1].project).toBe("aave");
  });

  it("filters by chainId when provided", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: samplePools }));

    // chainId 1 = Ethereum
    const result = await getCompareYields({ token: "USDC", chainId: 1 });

    // USDC pools on Ethereum only: pool-1 and pool-3
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const r of result) {
      expect(r.chain.toLowerCase()).toContain("ethereum");
    }
  });

  it("defaults to limit 10", async () => {
    const manyPools = Array.from({ length: 20 }, (_, i) => ({
      pool: `pool-${i}`,
      project: "aave",
      chain: "Ethereum",
      symbol: "USDC",
      tvlUsd: 1_000_000,
      apy: i * 0.5,
      apyBase: i * 0.3,
      apyReward: i * 0.2,
      ilRisk: "NO",
      rewardTokens: [],
    }));
    mockFetch.mockResolvedValueOnce(mockResponse({ data: manyPools }));

    const result = await getCompareYields({ token: "USDC" });

    expect(result).toHaveLength(10);
  });

  it("returns correct shape for each entry", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: [samplePools[0]] }));

    const result = await getCompareYields({ token: "USDC" });

    expect(result[0]).toEqual({
      project: "aave",
      chain: "Ethereum",
      apy: 4.5,
      tvlUsd: 5_000_000,
      apyBase: 3.0,
      apyReward: 1.5,
    });
  });

  it("returns empty array when no pools match", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: samplePools }));

    const result = await getCompareYields({ token: "NONEXISTENT" });

    expect(result).toHaveLength(0);
  });
});

describe("getProtocolInfo", () => {
  const defiLlamaResponse = {
    name: "Aave",
    description: "Liquidity protocol",
    category: "Lending",
    chains: ["Ethereum", "Arbitrum"],
    tvl: 5_000_000_000,
    audits: "2",
    url: "https://aave.com",
    raises: [{ date: "2021-01-01", amount: 1_000_000 }],
    twitter: "AaveAave",
    gecko_id: "aave",
    governance: ["https://governance.aave.com"],
  };

  const coingeckoResponse = {
    description: { en: "Aave is a decentralized liquidity protocol." },
    developer_data: { commit_count_4_weeks: 42 },
    community_data: { twitter_followers: 500_000 },
    categories: ["DeFi", "Lending"],
    sentiment_votes_up_percentage: 85,
    sentiment_votes_down_percentage: 15,
  };

  it("returns DefiLlama data enriched with CoinGecko when gecko_id present", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(defiLlamaResponse))
      .mockResolvedValueOnce(mockResponse(coingeckoResponse));

    const result = await getProtocolInfo({ protocol: "aave" });

    expect(result.name).toBe("Aave");
    expect(result.description).toBe("Aave is a decentralized liquidity protocol.");
    expect(result.category).toBe("Lending");
    expect(result.chains).toEqual(["Ethereum", "Arbitrum"]);
    expect(result.tvl).toBe(5_000_000_000);
    expect(result.audits).toBe("2");
    expect(result.url).toBe("https://aave.com");
    expect(result.raises).toEqual([{ date: "2021-01-01", amount: 1_000_000 }]);
    expect(result.twitter).toBe("AaveAave");
    expect(result.devActivity).toBe(42);
    expect(result.communityScore).toBe(500_000);
    expect(result.categories).toEqual(["DeFi", "Lending"]);
    expect(result.sentimentUp).toBe(85);
    expect(result.sentimentDown).toBe(15);
    expect(result.sources).toContain("defillama");
    expect(result.sources).toContain("coingecko");
    expect(result.governanceLinks).toEqual(["https://governance.aave.com"]);
  });

  it("returns DefiLlama-only data when no gecko_id", async () => {
    const noGeckoResponse = { ...defiLlamaResponse, gecko_id: null };
    mockFetch.mockResolvedValueOnce(mockResponse(noGeckoResponse));

    const result = await getProtocolInfo({ protocol: "aave" });

    expect(result.name).toBe("Aave");
    expect(result.sources).toEqual(["defillama"]);
    expect(result.devActivity).toBeUndefined();
    expect(result.communityScore).toBeUndefined();
    expect(result.governanceLinks).toEqual(["https://governance.aave.com"]);
    // Should only call DefiLlama, not CoinGecko
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("sets governanceLinks to null when not present in response", async () => {
    const noGovResponse = { ...defiLlamaResponse, gecko_id: null, governance: undefined };
    mockFetch.mockResolvedValueOnce(mockResponse(noGovResponse));

    const result = await getProtocolInfo({ protocol: "aave" });

    expect(result.governanceLinks).toBeNull();
  });

  it("falls back to DefiLlama data with warning when CoinGecko fails", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(defiLlamaResponse))
      .mockRejectedValueOnce(new Error("Network error"));

    const result = await getProtocolInfo({ protocol: "aave" });

    expect(result.name).toBe("Aave");
    expect(result.sources).toEqual(["defillama"]);
    expect(result.warnings).toEqual(["CoinGecko enrichment unavailable"]);
    expect(result.devActivity).toBeUndefined();
  });

  it("falls back when CoinGecko returns non-ok response", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(defiLlamaResponse))
      .mockResolvedValueOnce(mockResponse({}, false)); // non-ok response

    const result = await getProtocolInfo({ protocol: "aave" });

    expect(result.sources).toEqual(["defillama"]);
    expect(result.warnings).toEqual(["CoinGecko enrichment unavailable"]);
  });

  it("fetches DefiLlama protocol endpoint correctly", async () => {
    const simpleResponse = { ...defiLlamaResponse, gecko_id: null };
    mockFetch.mockResolvedValueOnce(mockResponse(simpleResponse));

    await getProtocolInfo({ protocol: "uniswap" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.llama.fi/protocol/uniswap",
      undefined,
      expect.any(Object)
    );
  });
});
