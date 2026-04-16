import type { ProtocolInfoResult, YieldComparisonEntry, YieldPoolEntry } from "../../api/types.js";
import { getChainById } from "../../chains/registry.js";
import { resilientFetch } from "../../utils/resilient-fetch.js";
import { coingeckoHeaders, coingeckoUrl } from "../market/coingecko.js";
import { ttlCache } from "../shared/cache.js";

const TTL = 300_000;

// Common chain name aliases → DefiLlama canonical names
const CHAIN_ALIASES: Record<string, string> = {
  bsc: "binance",
  bnb: "binance",
  "bnb smart chain": "binance",
  "binance smart chain": "binance",
  avax: "avalanche",
  matic: "polygon",
  arb: "arbitrum",
  "arbitrum one": "arbitrum",
  op: "optimism",
  "op mainnet": "optimism",
  ftm: "fantom",
  eth: "ethereum",
};

function normalizeChainName(chain: string): string {
  const lower = chain.toLowerCase();
  return CHAIN_ALIASES[lower] ?? lower;
}

// ── Types ────────────────────────────────────────────────────────

// Local aliases for use as function return types
type YieldOpportunity = YieldPoolEntry;
type CompareYieldEntry = YieldComparisonEntry;

interface RawPool {
  pool: string;
  project: string;
  chain: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number;
  apyReward: number;
  ilRisk: string;
  rewardTokens: string[];
}

// ── Shared fetcher ───────────────────────────────────────────────

async function fetchPools(): Promise<RawPool[]> {
  return ttlCache("yields:pools", TTL, async () => {
    const response = await resilientFetch("https://yields.llama.fi/pools", undefined, {
      label: "defillama-yields",
    });
    if (!response.ok) {
      throw new Error(`DefiLlama API returned ${response.status}`);
    }
    const data = (await response.json()) as { data: RawPool[] };
    return data.data;
  });
}

// ── getYieldOpportunities ─────────────────────────────────────────

export async function getYieldOpportunities(input: {
  token?: string;
  chain?: string;
  protocol?: string;
  minTvl?: number;
  limit?: number;
}): Promise<YieldOpportunity[]> {
  const { token, chain, protocol, minTvl = 100_000, limit = 20 } = input;

  const pools = await fetchPools();

  let filtered = pools;

  if (token) {
    const tokenLower = token.toLowerCase();
    filtered = filtered.filter((p) => p.symbol.toLowerCase().includes(tokenLower));
  }

  if (chain) {
    const normalized = normalizeChainName(chain);
    filtered = filtered.filter((p) => p.chain.toLowerCase() === normalized);
  }

  if (protocol) {
    const protocolLower = protocol.toLowerCase();
    filtered = filtered.filter((p) => p.project.toLowerCase() === protocolLower);
  }

  filtered = filtered.filter((p) => p.tvlUsd >= minTvl);

  filtered.sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0));

  return filtered.slice(0, limit).map((p) => ({
    pool: p.pool,
    project: p.project,
    chain: p.chain,
    symbol: p.symbol,
    tvlUsd: p.tvlUsd,
    apy: p.apy,
    apyBase: p.apyBase,
    apyReward: p.apyReward,
    ilRisk: p.ilRisk,
    rewardTokens: p.rewardTokens,
  }));
}

// ── getCompareYields ──────────────────────────────────────────────

export async function getCompareYields(input: {
  token: string;
  chainId?: number;
  limit?: number;
}): Promise<CompareYieldEntry[]> {
  const { token, chainId, limit = 10 } = input;

  const pools = await fetchPools();

  const tokenLower = token.toLowerCase();
  let filtered = pools.filter((p) => p.symbol.toLowerCase().includes(tokenLower));

  if (chainId !== undefined) {
    const chain = getChainById(chainId);
    const normalized = chain ? normalizeChainName(chain.name) : String(chainId).toLowerCase();
    filtered = filtered.filter((p) => p.chain.toLowerCase() === normalized);
  }

  filtered.sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));

  return filtered.slice(0, limit).map((p) => ({
    project: p.project,
    chain: p.chain,
    apy: p.apy,
    tvlUsd: p.tvlUsd,
    apyBase: p.apyBase,
    apyReward: p.apyReward,
  }));
}

// ── getProtocolInfo ───────────────────────────────────────────────

export async function getProtocolInfo(input: {
  protocol: string;
}): Promise<ProtocolInfoResult> {
  const { protocol } = input;

  const rawData = await ttlCache(`yields:protocol-info:${protocol}`, TTL, async () => {
    const response = await resilientFetch(
      `https://api.llama.fi/protocol/${encodeURIComponent(protocol)}`,
      undefined,
      { label: "defillama-protocol-info" }
    );
    if (!response.ok) {
      throw new Error(`DefiLlama API returned ${response.status}`);
    }
    return (await response.json()) as {
      name: string;
      description?: string;
      category: string;
      chains: string[];
      tvl: number;
      audits?: string;
      url?: string;
      raises?: unknown[];
      twitter?: string;
      gecko_id?: string | null;
      governance?: string[];
      governanceID?: string[];
    };
  });

  const governanceLinks: string[] | null = rawData.governance ?? rawData.governanceID ?? null;

  const base: ProtocolInfoResult = {
    name: rawData.name,
    description: rawData.description,
    category: rawData.category,
    chains: rawData.chains ?? [],
    tvl: rawData.tvl,
    audits: rawData.audits,
    url: rawData.url,
    raises: rawData.raises,
    twitter: rawData.twitter,
    governanceLinks,
    sources: ["defillama"],
  };

  if (!rawData.gecko_id) {
    return base;
  }

  // Enrich with CoinGecko
  try {
    const cgUrl = coingeckoUrl(`/coins/${rawData.gecko_id}`);
    const cgResponse = await resilientFetch(
      cgUrl,
      { headers: coingeckoHeaders() },
      { label: "coingecko" }
    );

    if (!cgResponse.ok) {
      throw new Error(`CoinGecko returned ${cgResponse.status}`);
    }

    const cgData = (await cgResponse.json()) as {
      description?: { en?: string };
      developer_data?: { commit_count_4_weeks?: number };
      community_data?: { twitter_followers?: number };
      categories?: string[];
      sentiment_votes_up_percentage?: number;
      sentiment_votes_down_percentage?: number;
    };

    return {
      ...base,
      description: cgData.description?.en ?? base.description,
      devActivity: cgData.developer_data?.commit_count_4_weeks,
      communityScore: cgData.community_data?.twitter_followers,
      categories: cgData.categories,
      sentimentUp: cgData.sentiment_votes_up_percentage,
      sentimentDown: cgData.sentiment_votes_down_percentage,
      sources: ["defillama", "coingecko"],
    };
  } catch (e: unknown) {
    process.stderr.write(`[yields] CoinGecko enrichment failed: ${e}\n`);
    return {
      ...base,
      warnings: ["CoinGecko enrichment unavailable"],
    };
  }
}
