import type {
  CexFundFlowEntry,
  ChainTvlEntry,
  DexVolumeResult,
  ExchangeRankingEntry,
  GainersLosersResult,
  GlobalStatsResult,
  ProtocolTvlResult,
  StablecoinEntry,
  TokenPriceResult,
  TopProtocolEntry,
} from "../../api/types.js";
import { resilientFetch } from "../../utils/resilient-fetch.js";
import { ttlCache } from "../shared/cache.js";

const TTL_PROTOCOL = 300_000;
const TTL_PRICE = 60_000;
const TTL_FEED = 60_000;

// ── Types ────────────────────────────────────────────────────────

// GainerLoserEntry is an element of the arrays inside GainersLosersResult
export type GainerLoserEntry = GainersLosersResult["gainers"][number];
// DexProtocolEntry is an element of DexVolumeResult.protocols
export type DexProtocolEntry = DexVolumeResult["protocols"][number];

// ── Handlers ─────────────────────────────────────────────────────

export async function getProtocolTvl(input: {
  protocol: string;
}): Promise<ProtocolTvlResult> {
  const { protocol } = input;
  return ttlCache(`defillama:protocol:${protocol}`, TTL_PROTOCOL, async () => {
    const response = await resilientFetch(
      `https://api.llama.fi/protocol/${encodeURIComponent(protocol)}`,
      undefined,
      { label: "defillama-protocol" }
    );
    if (!response.ok) {
      throw new Error(`DefiLlama API returned ${response.status}`);
    }
    const data = (await response.json()) as {
      name: string;
      tvl: number;
      change_1d?: number;
      change_7d?: number;
      change_1m?: number;
      chainTvls: Record<string, number>;
      category?: string | null;
      url?: string | null;
    };

    return {
      name: data.name,
      tvl: data.tvl,
      tvlChange1d: data.change_1d ?? null,
      tvlChange7d: data.change_7d ?? null,
      tvlChange30d: data.change_1m ?? null,
      chainTvls: data.chainTvls,
      category: data.category ?? null,
      url: data.url ?? null,
    };
  });
}

export async function getTopProtocols(input: {
  chain?: string;
  category?: string;
  limit?: number;
}): Promise<TopProtocolEntry[]> {
  const { chain, category, limit = 20 } = input;
  const rawData = await ttlCache("defillama:protocols", TTL_PROTOCOL, async () => {
    const response = await resilientFetch("https://api.llama.fi/protocols", undefined, {
      label: "defillama-protocols",
    });
    if (!response.ok) {
      throw new Error(`DefiLlama API returned ${response.status}`);
    }
    return response.json() as Promise<
      Array<{
        name: string;
        tvl: number;
        change_1d: number;
        chains: string[];
        category: string;
        slug: string;
      }>
    >;
  });

  let filtered = rawData;

  if (chain) {
    filtered = filtered.filter((p) => p.chains.includes(chain));
  }

  if (category) {
    filtered = filtered.filter((p) => p.category === category);
  }

  filtered.sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0));

  return filtered.slice(0, limit).map((p) => ({
    name: p.name,
    tvl: p.tvl,
    tvlChange1d: p.change_1d,
    chain: p.chains[0] ?? "",
    category: p.category,
    slug: p.slug,
  }));
}

export async function getChainTvl(input: { chain: string }): Promise<ChainTvlEntry[]> {
  const { chain } = input;
  return ttlCache(`defillama:chain-tvl:${chain}`, TTL_PROTOCOL, async () => {
    const response = await resilientFetch(
      `https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(chain)}`,
      undefined,
      { label: "defillama-chain-tvl" }
    );
    if (!response.ok) {
      throw new Error(`DefiLlama API returned ${response.status}`);
    }
    const data = (await response.json()) as Array<{ date: number; tvl: number }>;

    return data.map((entry) => ({
      date: new Date(entry.date * 1000).toISOString(),
      tvl: entry.tvl,
    }));
  });
}

export async function getTokenPrice(input: {
  tokens: string[];
  searchWidth?: string;
}): Promise<TokenPriceResult> {
  const { tokens, searchWidth } = input;
  const joined = tokens.join(",");
  const url = searchWidth
    ? `https://coins.llama.fi/prices/current/${joined}?searchWidth=${searchWidth}`
    : `https://coins.llama.fi/prices/current/${joined}`;

  return ttlCache(`defillama:prices:${joined}:${searchWidth ?? ""}`, TTL_PRICE, async () => {
    const response = await resilientFetch(url, undefined, { label: "defillama-prices" });
    if (!response.ok) {
      throw new Error(`DefiLlama API returned ${response.status}`);
    }
    return response.json() as Promise<TokenPriceResult>;
  });
}

export async function getGainersLosers(input: {
  period?: string;
  limit?: number;
}): Promise<GainersLosersResult> {
  const { period = "24h", limit = 10 } = input;
  const data = await ttlCache(`defillama:gainers-losers:${period}`, TTL_PRICE, async () => {
    const response = await resilientFetch(
      `https://coins.llama.fi/percentage/${encodeURIComponent(period)}`,
      undefined,
      { label: "defillama-percentage" }
    );
    if (!response.ok) {
      throw new Error(`DefiLlama API returned ${response.status}`);
    }
    return (await response.json()) as { coins: Record<string, number> };
  });

  const entries = Object.entries(data.coins).map(([symbol, priceChange]) => ({
    symbol,
    priceChange,
    // price is not provided by the percentage endpoint
    price: null as number | null,
  }));

  entries.sort((a, b) => b.priceChange - a.priceChange);

  // Split entries so gainers and losers don't overlap when fewer than 2*limit
  const midpoint = Math.ceil(entries.length / 2);
  const gainers = entries.slice(0, Math.min(limit, midpoint));
  const losers = entries.slice(Math.max(entries.length - limit, midpoint)).reverse();

  return { gainers, losers };
}

export async function getDexVolume(input: {
  chain?: string;
  protocol?: string;
}): Promise<DexVolumeResult> {
  const { chain, protocol } = input;
  const url = chain
    ? `https://api.llama.fi/overview/dexs/${encodeURIComponent(chain)}`
    : "https://api.llama.fi/overview/dexs";

  const cached = await ttlCache(
    `defillama:dex-volume:${chain ?? "all"}`,
    TTL_PROTOCOL,
    async () => {
      const response = await resilientFetch(url, undefined, { label: "defillama-dexs" });
      if (!response.ok) {
        throw new Error(`DefiLlama API returned ${response.status}`);
      }
      const data = (await response.json()) as {
        total24h: number;
        total7d?: number;
        protocols: Array<{ name: string; total24h: number; change_1d: number }>;
      };

      return {
        totalVolume24h: data.total24h,
        totalVolume7d: data.total7d ?? null,
        protocols: (data.protocols ?? []).map((p) => ({
          name: p.name,
          volume24h: p.total24h,
          change1d: p.change_1d,
        })),
      };
    }
  );

  if (protocol) {
    const lowerProtocol = protocol.toLowerCase();
    return {
      ...cached,
      protocols: cached.protocols.filter((p) => p.name.toLowerCase().includes(lowerProtocol)),
    };
  }

  return cached;
}

export async function getStablecoinStats(input: {
  chain?: string;
}): Promise<StablecoinEntry[]> {
  const { chain } = input;
  return ttlCache(`defillama:stablecoins:${chain ?? "all"}`, TTL_PROTOCOL, async () => {
    const response = await resilientFetch(
      "https://stablecoins.llama.fi/stablecoins?includePrices=true",
      undefined,
      { label: "defillama-stablecoins" }
    );
    if (!response.ok) {
      throw new Error(`DefiLlama API returned ${response.status}`);
    }
    const data = (await response.json()) as {
      peggedAssets: Array<{
        name: string;
        symbol: string;
        circulating: { peggedUSD: number };
        pegDeviation?: number;
        chainCirculating?: Record<string, { current: { peggedUSD: number } }>;
      }>;
    };

    let assets = data.peggedAssets;

    if (chain) {
      assets = assets.filter((a) => a.chainCirculating && chain in a.chainCirculating);
    }

    const totalCirculating = assets.reduce((sum, a) => sum + (a.circulating?.peggedUSD ?? 0), 0);

    return assets.map((a) => {
      const circ = a.circulating?.peggedUSD ?? 0;
      return {
        name: a.name,
        symbol: a.symbol,
        totalCirculating: circ,
        pegDeviation: a.pegDeviation ?? 0,
        dominance: totalCirculating > 0 ? (circ / totalCirculating) * 100 : 0,
      };
    });
  });
}

export async function getGlobalStats(_input: Record<string, never>): Promise<GlobalStatsResult> {
  return ttlCache("defillama:global-stats", TTL_PRICE, async () => {
    const response = await resilientFetch("https://fe-cache.llama.fi/cg_market_data", undefined, {
      label: "defillama-global",
    });
    if (!response.ok) {
      throw new Error(`DefiLlama API returned ${response.status}`);
    }
    const raw = (await response.json()) as {
      data: {
        total_market_cap: { usd: number };
        total_volume: { usd: number };
        market_cap_percentage: { btc: number; eth: number };
        market_cap_change_percentage_24h_usd: number;
        defi_market_cap?: string | number;
        defi_volume_24h?: string | number;
      };
    };

    const d = raw.data;
    const defiMarketCap = Number(d.defi_market_cap ?? 0);
    const totalMarketCap = d.total_market_cap?.usd ?? 0;

    return {
      totalMarketCap,
      totalVolume24h: d.total_volume?.usd ?? 0,
      btcDominance: d.market_cap_percentage?.btc ?? 0,
      ethDominance: d.market_cap_percentage?.eth ?? 0,
      defiMarketCap,
      defiDominance: totalMarketCap > 0 ? (defiMarketCap / totalMarketCap) * 100 : 0,
      marketCapChange24h: d.market_cap_change_percentage_24h_usd ?? 0,
    };
  });
}

export async function getCexFundFlows(input: {
  limit?: number;
}): Promise<CexFundFlowEntry[]> {
  const { limit = 20 } = input;
  const data = await ttlCache("defillama:cex-flows", TTL_FEED, async () => {
    const response = await resilientFetch("https://feed-api.llama.fi/flows", undefined, {
      label: "defillama-flows",
    });
    if (!response.ok) {
      throw new Error(`DefiLlama API returned ${response.status}`);
    }
    return (await response.json()) as Array<{
      symbol: string;
      deposit_count: number;
      withdraw_count: number;
      deposit_sum_usd: number;
      withdraw_sum_usd: number;
      total_users: number;
    }>;
  });

  return data.slice(0, limit).map((item) => ({
    symbol: item.symbol,
    depositCount: item.deposit_count,
    withdrawCount: item.withdraw_count,
    depositSumUsd: item.deposit_sum_usd,
    withdrawSumUsd: item.withdraw_sum_usd,
    netFlow: item.deposit_sum_usd - item.withdraw_sum_usd,
    totalUsers: item.total_users,
  }));
}

export async function getExchangeRankings(input: {
  limit?: number;
}): Promise<ExchangeRankingEntry[]> {
  const { limit = 20 } = input;
  const raw = await ttlCache("defillama:exchanges", TTL_FEED, async () => {
    const response = await resilientFetch("https://fe-cache.llama.fi/exchanges", undefined, {
      label: "defillama-exchanges",
    });
    if (!response.ok) {
      throw new Error(`DefiLlama API returned ${response.status}`);
    }
    return (await response.json()) as {
      data: Array<{
        name: string;
        trust_score: number;
        trust_score_rank: number;
        trade_volume_24h_btc: number;
        country: string | null;
        year_established: number | null;
      }>;
    };
  });

  return raw.data.slice(0, limit).map((item) => ({
    name: item.name,
    trustScore: item.trust_score,
    trustScoreRank: item.trust_score_rank,
    volume24hBtc: item.trade_volume_24h_btc,
    country: item.country ?? null,
    yearEstablished: item.year_established ?? null,
  }));
}
