import type { z } from "zod";
import type {
  categoryEntrySchema,
  tokenHistoryEntrySchema,
  tokenSearchResultEntrySchema,
  topTokenEntrySchema,
  trendingResultSchema,
} from "../../api/schemas/outputs.js";
import { resilientFetch } from "../../utils/resilient-fetch.js";
import { ttlCache } from "./cache.js";

// ── Shared helpers ───────────────────────────────────────────────

export function coingeckoUrl(path: string): string {
  const base = process.env.COINGECKO_API_KEY
    ? "https://pro-api.coingecko.com/api/v3"
    : "https://api.coingecko.com/api/v3";
  return `${base}${path}`;
}

export function coingeckoHeaders(): Record<string, string> {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { "x-cg-pro-api-key": key } : {};
}

const CG_TTL = 120_000;
const CG_FETCH_CONFIG = {
  label: "coingecko",
  retry: { baseDelayMs: 5000 },
};

// ── Types ────────────────────────────────────────────────────────

interface CoinGeckoTrendingItem {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number;
}

interface CoinGeckoMarket {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number;
  current_price: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  market_cap: number;
  total_volume: number;
  circulating_supply?: number;
  ath?: number;
  ath_date?: string;
}

interface CoinGeckoCategoryRaw {
  id: string;
  name: string;
  market_cap: number;
  market_cap_change_24h: number;
  volume_24h: number;
  top_3_coins: string[];
  updated_at: string;
}

// ── getTrending ──────────────────────────────────────────────────

export type TrendingResult = z.infer<typeof trendingResultSchema>;
export type TrendingCoin = TrendingResult["coins"][number];

export async function getTrending(input: { limit?: number }): Promise<TrendingResult> {
  const limit = input.limit ?? 10;
  const url = coingeckoUrl("/search/trending");

  const data = await ttlCache(url, CG_TTL, async () => {
    const res = await resilientFetch(url, { headers: coingeckoHeaders() }, CG_FETCH_CONFIG);
    return (await res.json()) as { coins: Array<{ item: CoinGeckoTrendingItem }> };
  });

  const items = data.coins.slice(0, limit).map((c) => c.item);

  // Try to enrich with market data
  const ids = items.map((i) => i.id).join(",");
  const marketsUrl = coingeckoUrl(`/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}`);

  try {
    const marketsRes = await resilientFetch(
      marketsUrl,
      { headers: coingeckoHeaders() },
      CG_FETCH_CONFIG
    );

    if (!marketsRes.ok) {
      throw new Error(`Market data request failed: ${marketsRes.status}`);
    }

    const markets = (await marketsRes.json()) as CoinGeckoMarket[];
    const marketMap = new Map(markets.map((m) => [m.id, m]));

    const coins: TrendingCoin[] = items.map((item) => {
      const market = marketMap.get(item.id);
      if (market) {
        return {
          name: market.name,
          symbol: market.symbol,
          marketCapRank: market.market_cap_rank,
          price: market.current_price,
          priceChange24h: market.price_change_percentage_24h,
          marketCap: market.market_cap,
          volume24h: market.total_volume,
        };
      }
      return {
        name: item.name,
        symbol: item.symbol,
        marketCapRank: item.market_cap_rank,
      };
    });

    return { coins };
  } catch (e: unknown) {
    process.stderr.write(`[market] Trending enrichment failed: ${e}\n`);
    // Return base data with warning
    const coins: TrendingCoin[] = items.map((item) => ({
      name: item.name,
      symbol: item.symbol,
      marketCapRank: item.market_cap_rank,
    }));
    return { coins, warnings: ["Market data enrichment unavailable"] };
  }
}

// ── getTopTokens ─────────────────────────────────────────────────

export type TopToken = z.infer<typeof topTokenEntrySchema>;

export async function getTopTokens(input: {
  category?: string;
  limit?: number;
  order?: "marketCap" | "volume";
}): Promise<TopToken[]> {
  const limit = input.limit ?? 20;
  const orderMap: Record<string, string> = {
    marketCap: "market_cap_desc",
    volume: "volume_desc",
  };
  const order = orderMap[input.order ?? "marketCap"] ?? "market_cap_desc";

  const params = new URLSearchParams({
    vs_currency: "usd",
    order,
    per_page: String(limit),
    price_change_percentage: "7d",
  });

  if (input.category) {
    params.set("category", input.category);
  }

  const url = coingeckoUrl(`/coins/markets?${params.toString()}`);

  const data = await ttlCache(url, CG_TTL, async () => {
    const res = await resilientFetch(url, { headers: coingeckoHeaders() }, CG_FETCH_CONFIG);
    return (await res.json()) as CoinGeckoMarket[];
  });

  return data.map((m) => ({
    name: m.name,
    symbol: m.symbol,
    marketCapRank: m.market_cap_rank,
    currentPrice: m.current_price,
    priceChange24h: m.price_change_percentage_24h,
    priceChange7d: m.price_change_percentage_7d_in_currency,
    marketCap: m.market_cap,
    totalVolume: m.total_volume,
    circulatingSupply: m.circulating_supply,
    ath: m.ath,
    athDate: m.ath_date,
  }));
}

// ── searchToken ──────────────────────────────────────────────────

export type SearchTokenResult = z.infer<typeof tokenSearchResultEntrySchema>;

interface CoinGeckoSearchCoin {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number;
  thumb: string;
}

export async function searchToken(input: { query: string }): Promise<SearchTokenResult[]> {
  const url = coingeckoUrl(`/search?query=${encodeURIComponent(input.query)}`);

  const data = await ttlCache(url, CG_TTL, async () => {
    const res = await resilientFetch(url, { headers: coingeckoHeaders() }, CG_FETCH_CONFIG);
    return (await res.json()) as { coins: CoinGeckoSearchCoin[] };
  });

  return data.coins.map((c) => ({
    id: c.id,
    name: c.name,
    symbol: c.symbol,
    marketCapRank: c.market_cap_rank,
    thumb: c.thumb,
  }));
}

// ── getCategories ────────────────────────────────────────────────

export type CategoryResult = z.infer<typeof categoryEntrySchema>;

export async function getCategories(input: {
  order?: "marketCap" | "name" | "marketCapChange24h";
  limit?: number;
}): Promise<CategoryResult[]> {
  const limit = input.limit ?? 20;
  const orderMap: Record<string, string> = {
    marketCap: "market_cap_desc",
    name: "name_asc",
    marketCapChange24h: "market_cap_change_24h_desc",
  };
  const order = input.order ? orderMap[input.order] : undefined;

  const params = new URLSearchParams();
  if (order) {
    params.set("order", order);
  }

  const queryString = params.toString();
  const url = coingeckoUrl(`/coins/categories${queryString ? `?${queryString}` : ""}`);

  const data = await ttlCache(url, CG_TTL, async () => {
    const res = await resilientFetch(url, { headers: coingeckoHeaders() }, CG_FETCH_CONFIG);
    return (await res.json()) as CoinGeckoCategoryRaw[];
  });

  return data.slice(0, limit).map((c) => ({
    name: c.name,
    marketCap: c.market_cap,
    marketCapChange24h: c.market_cap_change_24h,
    volume24h: c.volume_24h,
    topCoins: c.top_3_coins,
    updatedAt: c.updated_at,
  }));
}

// ── getTokenHistory ──────────────────────────────────────────────

export type TokenHistoryEntry = z.infer<typeof tokenHistoryEntrySchema>;

const PERIOD_DAYS: Record<string, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

const PERIOD_SECONDS: Record<string, number> = {
  "1d": 86400,
  "7d": 7 * 86400,
  "30d": 30 * 86400,
  "90d": 90 * 86400,
  "1y": 365 * 86400,
};

export async function getTokenHistory(input: {
  token: string;
  period?: "1d" | "7d" | "30d" | "90d" | "1y";
}): Promise<TokenHistoryEntry[]> {
  const period = input.period ?? "30d";
  const days = PERIOD_DAYS[period];
  const periodSeconds = PERIOD_SECONDS[period];

  // If token is chain:address format, use DefiLlama directly
  if (input.token.includes(":")) {
    return fetchFromDefiLlama(input.token, periodSeconds, days);
  }

  // Otherwise try CoinGecko first
  const url = coingeckoUrl(
    `/coins/${encodeURIComponent(input.token)}/market_chart?vs_currency=usd&days=${days}`
  );

  const res = await resilientFetch(url, { headers: coingeckoHeaders() }, CG_FETCH_CONFIG);

  if (!res.ok) {
    throw new Error(
      `CoinGecko returned ${res.status} for token '${input.token}'. Try using chain:address format (e.g., 'ethereum:0x...') for DefiLlama fallback.`
    );
  }

  const data = (await res.json()) as {
    prices: [number, number][];
    market_caps: [number, number][];
    total_volumes: [number, number][];
  };

  return data.prices.map(([ts, price], i) => ({
    timestamp: new Date(ts).toISOString(),
    price,
    marketCap: data.market_caps[i]?.[1],
    volume: data.total_volumes[i]?.[1],
  }));
}

async function fetchFromDefiLlama(
  token: string,
  periodSeconds: number,
  days: number
): Promise<TokenHistoryEntry[]> {
  const resolution = days <= 7 ? "1h" : "1d";
  const start = Math.floor(Date.now() / 1000) - periodSeconds;
  const span = days <= 7 ? days * 24 : days;

  const url = `https://coins.llama.fi/chart/${token}?start=${start}&span=${span}&period=${resolution}`;

  const res = await resilientFetch(url, undefined, {
    label: "defillama",
    retry: { baseDelayMs: 1000 },
  });

  if (!res.ok) {
    throw new Error(`DefiLlama returned ${res.status} for token "${token}"`);
  }

  const data = (await res.json()) as {
    coins: Record<string, { prices: Array<{ timestamp: number; price: number }> }>;
  };

  const coinData = data.coins[token];
  if (!coinData) {
    throw new Error(`No price data found for token "${token}"`);
  }

  return coinData.prices.map((entry) => ({
    timestamp: new Date(entry.timestamp * 1000).toISOString(),
    price: entry.price,
  }));
}
