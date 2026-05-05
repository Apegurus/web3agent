import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAirdrops,
  getFundRaises,
  getGovernance,
  getHackHistory,
  getNews,
  getTokenUnlocks,
  getWhaleTransfers,
} from "../../../src/tools/research/defillama.js";

vi.mock("../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: vi.fn(),
}));

vi.mock("../../../src/tools/shared/cache.js", () => ({
  ttlCache: vi.fn((_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher()),
}));

import { resilientFetch } from "../../../src/utils/resilient-fetch.js";

const mockFetch = vi.mocked(resilientFetch);

function mockResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTokenUnlocks", () => {
  const rawUnlocks = [
    {
      name: "Arbitrum",
      symbol: "ARB",
      next_event: 1700000000,
      to_unlock_usd: 50_000_000,
      price: 1.25,
      delta_rel: -0.05,
    },
    {
      name: "Optimism",
      symbol: "OP",
      next_event: 1700086400,
      to_unlock_usd: 30_000_000,
      price: 2.0,
      delta_rel: -0.02,
    },
  ];

  it("returns normalized token unlock data with ISO dates", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawUnlocks));

    const result = await getTokenUnlocks({});

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "Arbitrum",
      symbol: "ARB",
      nextEvent: new Date(1700000000 * 1000).toISOString(),
      toUnlockUsd: 50_000_000,
      price: 1.25,
      priceImpactPercent: -0.05,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://feed-api.llama.fi/unlocks",
      undefined,
      expect.any(Object)
    );
  });

  it("respects limit parameter", async () => {
    const manyUnlocks = Array.from({ length: 30 }, (_, i) => ({
      name: `Token${i}`,
      symbol: `TKN${i}`,
      next_event: 1700000000 + i * 86400,
      to_unlock_usd: 1_000_000,
      price: 1.0,
      delta_rel: -0.01,
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyUnlocks));

    const result = await getTokenUnlocks({ limit: 5 });

    expect(result).toHaveLength(5);
  });

  it("defaults to limit 20", async () => {
    const manyUnlocks = Array.from({ length: 30 }, (_, i) => ({
      name: `Token${i}`,
      symbol: `TKN${i}`,
      next_event: 1700000000 + i * 86400,
      to_unlock_usd: 1_000_000,
      price: 1.0,
      delta_rel: -0.01,
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyUnlocks));

    const result = await getTokenUnlocks({});

    expect(result).toHaveLength(20);
  });
});

describe("getHackHistory", () => {
  const rawHacks = [
    {
      name: "Ronin Network",
      timestamp: 1648080000,
      amount: 625_000_000,
      technique: "Compromised private keys",
      source_url: "https://example.com/ronin",
    },
    {
      name: "Poly Network",
      timestamp: 1628640000,
      amount: 611_000_000,
      technique: "Contract vulnerability",
      source_url: "https://example.com/poly",
    },
  ];

  it("returns normalized hack history with ISO dates", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawHacks));

    const result = await getHackHistory({});

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "Ronin Network",
      date: new Date(1648080000 * 1000).toISOString(),
      amountUsd: 625_000_000,
      technique: "Compromised private keys",
      sourceUrl: "https://example.com/ronin",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://feed-api.llama.fi/hacks",
      undefined,
      expect.any(Object)
    );
  });

  it("filters by protocol name (case-insensitive)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawHacks));

    const result = await getHackHistory({ protocol: "ronin" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Ronin Network");
  });

  it("filters by protocol with different casing", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawHacks));

    const result = await getHackHistory({ protocol: "POLY NETWORK" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Poly Network");
  });

  it("respects limit parameter", async () => {
    const manyHacks = Array.from({ length: 30 }, (_, i) => ({
      name: `Protocol${i}`,
      timestamp: 1648080000 + i * 86400,
      amount: 1_000_000,
      technique: "Unknown",
      source_url: "https://example.com",
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyHacks));

    const result = await getHackHistory({ limit: 5 });

    expect(result).toHaveLength(5);
  });

  it("defaults to limit 20", async () => {
    const manyHacks = Array.from({ length: 30 }, (_, i) => ({
      name: `Protocol${i}`,
      timestamp: 1648080000 + i * 86400,
      amount: 1_000_000,
      technique: "Unknown",
      source_url: "https://example.com",
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyHacks));

    const result = await getHackHistory({});

    expect(result).toHaveLength(20);
  });
});

describe("getFundRaises", () => {
  const rawRaises = [
    {
      name: "Uniswap Labs",
      timestamp: 1660000000,
      amount: 165_000_000,
      round: "Series B",
      lead_investor: "Polychain Capital",
      source_url: "https://example.com/uniswap",
    },
    {
      name: "Aave",
      timestamp: 1650000000,
      amount: 25_000_000,
      round: "Series A",
      lead_investor: "Three Arrows Capital",
      source_url: "https://example.com/aave",
    },
  ];

  it("returns normalized fund raise data with ISO dates", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawRaises));

    const result = await getFundRaises({});

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "Uniswap Labs",
      date: new Date(1660000000 * 1000).toISOString(),
      amountUsd: 165_000_000,
      round: "Series B",
      leadInvestor: "Polychain Capital",
      sourceUrl: "https://example.com/uniswap",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://feed-api.llama.fi/raises",
      undefined,
      expect.any(Object)
    );
  });

  it("respects limit parameter", async () => {
    const manyRaises = Array.from({ length: 30 }, (_, i) => ({
      name: `Project${i}`,
      timestamp: 1660000000 + i * 86400,
      amount: 1_000_000,
      round: "Seed",
      lead_investor: "VC Fund",
      source_url: "https://example.com",
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyRaises));

    const result = await getFundRaises({ limit: 5 });

    expect(result).toHaveLength(5);
  });

  it("defaults to limit 20", async () => {
    const manyRaises = Array.from({ length: 30 }, (_, i) => ({
      name: `Project${i}`,
      timestamp: 1660000000 + i * 86400,
      amount: 1_000_000,
      round: "Seed",
      lead_investor: "VC Fund",
      source_url: "https://example.com",
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyRaises));

    const result = await getFundRaises({});

    expect(result).toHaveLength(20);
  });
});

describe("getWhaleTransfers", () => {
  const rawTransfers = [
    {
      transaction_hash: "0xabc123",
      block_time: "2024-01-15T12:00:00.000Z",
      symbol: "USDT",
      value: 1_000_000,
      value_usd: 1_000_000,
      from_entity: "Binance",
      to_entity: "Unknown",
    },
    {
      transaction_hash: "0xdef456",
      block_time: "2024-01-15T11:00:00.000Z",
      symbol: "ETH",
      value: 500,
      value_usd: 1_500_000,
      from_entity: "Coinbase",
      to_entity: "Kraken",
    },
  ];

  it("returns normalized whale transfer data", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawTransfers));

    const result = await getWhaleTransfers({});

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      txHash: "0xabc123",
      blockTime: "2024-01-15T12:00:00.000Z",
      symbol: "USDT",
      value: 1_000_000,
      valueUsd: 1_000_000,
      fromEntity: "Binance",
      toEntity: "Unknown",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://feed-api.llama.fi/transfers",
      undefined,
      expect.any(Object)
    );
  });

  it("filters by symbol (case-insensitive)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawTransfers));

    const result = await getWhaleTransfers({ symbol: "usdt" });

    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("USDT");
  });

  it("filters by symbol with uppercase", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawTransfers));

    const result = await getWhaleTransfers({ symbol: "ETH" });

    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("ETH");
  });

  it("respects limit parameter", async () => {
    const manyTransfers = Array.from({ length: 30 }, (_, i) => ({
      transaction_hash: `0x${i}`,
      block_time: "2024-01-15T12:00:00.000Z",
      symbol: "USDT",
      value: 1_000_000,
      value_usd: 1_000_000,
      from_entity: "Exchange",
      to_entity: "Unknown",
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyTransfers));

    const result = await getWhaleTransfers({ limit: 5 });

    expect(result).toHaveLength(5);
  });

  it("defaults to limit 20", async () => {
    const manyTransfers = Array.from({ length: 30 }, (_, i) => ({
      transaction_hash: `0x${i}`,
      block_time: "2024-01-15T12:00:00.000Z",
      symbol: "USDT",
      value: 1_000_000,
      value_usd: 1_000_000,
      from_entity: "Exchange",
      to_entity: "Unknown",
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyTransfers));

    const result = await getWhaleTransfers({});

    expect(result).toHaveLength(20);
  });
});

describe("getGovernance", () => {
  const rawProposals = [
    {
      org_name: "Uniswap",
      title: "Add new fee tier",
      status: "active",
      start: 1700000000,
      end: 1700604800,
      link: "https://example.com/proposal1",
      quorum: 40_000_000,
      choices: ["For", "Against", "Abstain"],
      votes: [10_000_000, 2_000_000, 500_000],
      voters: 1500,
    },
    {
      org_name: "Compound",
      title: "Update interest rate model",
      status: "closed",
      start: 1699000000,
      end: 1699604800,
      link: "https://example.com/proposal2",
      quorum: 100_000,
      choices: ["For", "Against"],
      votes: [200_000, 50_000],
      voters: 300,
    },
  ];

  it("returns normalized governance data with ISO dates", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawProposals));

    const result = await getGovernance({});

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      orgName: "Uniswap",
      title: "Add new fee tier",
      status: "active",
      startDate: new Date(1700000000 * 1000).toISOString(),
      endDate: new Date(1700604800 * 1000).toISOString(),
      link: "https://example.com/proposal1",
      quorum: 40_000_000,
      choices: ["For", "Against", "Abstain"],
      votes: [10_000_000, 2_000_000, 500_000],
      voterCount: 1500,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://feed-api.llama.fi/governance",
      undefined,
      expect.any(Object)
    );
  });

  it("filters by protocol (case-insensitive)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawProposals));

    const result = await getGovernance({ protocol: "uniswap" });

    expect(result).toHaveLength(1);
    expect(result[0].orgName).toBe("Uniswap");
  });

  it("filters by status", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawProposals));

    const result = await getGovernance({ status: "closed" });

    expect(result).toHaveLength(1);
    expect(result[0].orgName).toBe("Compound");
  });

  it("filters by both protocol and status", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawProposals));

    const result = await getGovernance({ protocol: "uniswap", status: "active" });

    expect(result).toHaveLength(1);
    expect(result[0].orgName).toBe("Uniswap");
  });

  it("returns empty when filters match nothing", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawProposals));

    const result = await getGovernance({ protocol: "uniswap", status: "closed" });

    expect(result).toHaveLength(0);
  });

  it("respects limit parameter", async () => {
    const manyProposals = Array.from({ length: 30 }, (_, i) => ({
      org_name: `Protocol${i}`,
      title: `Proposal ${i}`,
      status: "active",
      start: 1700000000,
      end: 1700604800,
      link: "https://example.com",
      quorum: 1000,
      choices: ["For", "Against"],
      votes: [500, 100],
      voters: 50,
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyProposals));

    const result = await getGovernance({ limit: 5 });

    expect(result).toHaveLength(5);
  });

  it("defaults to limit 20", async () => {
    const manyProposals = Array.from({ length: 30 }, (_, i) => ({
      org_name: `Protocol${i}`,
      title: `Proposal ${i}`,
      status: "active",
      start: 1700000000,
      end: 1700604800,
      link: "https://example.com",
      quorum: 1000,
      choices: ["For", "Against"],
      votes: [500, 100],
      voters: 50,
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyProposals));

    const result = await getGovernance({});

    expect(result).toHaveLength(20);
  });
});

describe("getNews", () => {
  const rawNews = [
    {
      title: "Bitcoin reaches new ATH",
      content: "Bitcoin has reached a new all-time high of $100k",
      link: "https://example.com/news1",
      pub_date: "2024-01-15T10:00:00.000Z",
      topic: "Bitcoin",
      sentiment: "positive",
    },
    {
      title: "DeFi protocol hacked",
      content: "A major DeFi protocol lost $50M in an exploit",
      link: "https://example.com/news2",
      pub_date: "2024-01-15T09:00:00.000Z",
      topic: "DeFi",
      sentiment: "negative",
    },
  ];

  it("returns normalized news data", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawNews));

    const result = await getNews({});

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      title: "Bitcoin reaches new ATH",
      summary: "Bitcoin has reached a new all-time high of $100k",
      link: "https://example.com/news1",
      publishedAt: "2024-01-15T10:00:00.000Z",
      topic: "Bitcoin",
      sentiment: "positive",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://feed-api.llama.fi/news",
      undefined,
      expect.any(Object)
    );
  });

  it("respects limit parameter", async () => {
    const manyNews = Array.from({ length: 30 }, (_, i) => ({
      title: `News ${i}`,
      content: `Content ${i}`,
      link: "https://example.com",
      pub_date: "2024-01-15T10:00:00.000Z",
      topic: "DeFi",
      sentiment: "neutral",
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyNews));

    const result = await getNews({ limit: 5 });

    expect(result).toHaveLength(5);
  });

  it("defaults to limit 20", async () => {
    const manyNews = Array.from({ length: 30 }, (_, i) => ({
      title: `News ${i}`,
      content: `Content ${i}`,
      link: "https://example.com",
      pub_date: "2024-01-15T10:00:00.000Z",
      topic: "DeFi",
      sentiment: "neutral",
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyNews));

    const result = await getNews({});

    expect(result).toHaveLength(20);
  });
});

describe("getAirdrops", () => {
  const rawAirdrops = [
    {
      name: "LayerZero",
      symbol: "ZRO",
      claim_page: "https://example.com/claim/zro",
      ends: 1710000000,
      price: 3.5,
      delta_rel: 0.12,
    },
    {
      name: "StarkNet",
      symbol: "STRK",
      claim_page: "https://example.com/claim/strk",
      ends: null,
      price: 1.8,
      delta_rel: -0.05,
    },
  ];

  it("returns normalized airdrop data with ISO ends date", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawAirdrops));

    const result = await getAirdrops({});

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "LayerZero",
      symbol: "ZRO",
      claimPage: "https://example.com/claim/zro",
      endsAt: new Date(1710000000 * 1000).toISOString(),
      price: 3.5,
      priceChange: 0.12,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://feed-api.llama.fi/airdrops",
      undefined,
      expect.any(Object)
    );
  });

  it("sets endsAt to null when ends is null", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(rawAirdrops));

    const result = await getAirdrops({});

    expect(result[1].endsAt).toBeNull();
  });

  it("respects limit parameter", async () => {
    const manyAirdrops = Array.from({ length: 30 }, (_, i) => ({
      name: `Token${i}`,
      symbol: `TKN${i}`,
      claim_page: "https://example.com",
      ends: 1710000000,
      price: 1.0,
      delta_rel: 0.01,
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyAirdrops));

    const result = await getAirdrops({ limit: 5 });

    expect(result).toHaveLength(5);
  });

  it("defaults to limit 20", async () => {
    const manyAirdrops = Array.from({ length: 30 }, (_, i) => ({
      name: `Token${i}`,
      symbol: `TKN${i}`,
      claim_page: "https://example.com",
      ends: 1710000000,
      price: 1.0,
      delta_rel: 0.01,
    }));
    mockFetch.mockResolvedValueOnce(mockResponse(manyAirdrops));

    const result = await getAirdrops({});

    expect(result).toHaveLength(20);
  });
});
