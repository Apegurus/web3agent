import { z } from "zod";

// ── Shared building blocks ──────────────────────────────────────

export const limitSchema = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Maximum number of results to return");

export const protocolSlugSchema = z
  .string()
  .describe("Protocol slug as used by DefiLlama (e.g., 'aave', 'uniswap')");

export const tradingPairSchema = z
  .string()
  .describe("Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT')");

// ── DefiLlama tools ─────────────────────────────────────────────

export const marketGetProtocolTvlSchema = z.object({
  protocol: protocolSlugSchema,
});

export const marketGetTopProtocolsSchema = z.object({
  chain: z.string().optional().describe("Filter by chain name (e.g., 'Ethereum', 'Arbitrum')"),
  category: z
    .string()
    .optional()
    .describe("Filter by protocol category (e.g., 'Dexes', 'Lending')"),
  limit: limitSchema,
});

export const marketGetChainTvlSchema = z.object({
  chain: z.string().describe("Chain name (e.g., 'Ethereum', 'Arbitrum')"),
});

export const marketGetTokenPriceSchema = z.object({
  tokens: z
    .array(z.string().describe("Token identifier in 'chain:address' or CoinGecko ID format"))
    .min(1)
    .describe("Array of token identifiers to price"),
  searchWidth: z.string().optional().describe("Time range to search for prices (e.g., '4h')"),
});

export const marketGetTokenHistorySchema = z.object({
  token: z
    .string()
    .describe(
      "Token identifier — CoinGecko ID (e.g., 'bitcoin') or chain:address (e.g., 'ethereum:0x...')"
    ),
  period: z
    .enum(["1d", "7d", "30d", "90d", "1y"])
    .optional()
    .describe("Time period for price history (default: 30d)"),
});

export const marketGetGainersLosersSchema = z.object({
  period: z
    .enum(["1h", "24h", "7d"])
    .optional()
    .describe("Time period for price change calculation (default: 24h)"),
  limit: limitSchema,
});

export const marketGetDexVolumeSchema = z.object({
  chain: z.string().optional().describe("Filter by chain name"),
  protocol: z.string().optional().describe("Filter by protocol name"),
});

export const marketGetStablecoinStatsSchema = z.object({
  chain: z.string().optional().describe("Filter by chain name"),
});

export const marketGetGlobalStatsSchema = z.object({});

export const marketGetCexFundFlowsSchema = z.object({
  limit: limitSchema,
});

export const marketGetExchangeRankingsSchema = z.object({
  limit: limitSchema,
});

// ── Sentiment ───────────────────────────────────────────────────

export const marketGetSentimentSchema = z.object({
  days: z
    .number()
    .int()
    .positive()
    .max(30)
    .optional()
    .describe("Number of days of history to include (default: 7, max: 30)"),
});

// ── CoinGecko ───────────────────────────────────────────────────

export const marketGetTrendingSchema = z.object({
  limit: limitSchema,
});

export const marketGetTopTokensSchema = z.object({
  category: z
    .string()
    .optional()
    .describe("CoinGecko category slug (e.g., 'decentralized-finance-defi', 'layer-2')"),
  limit: z
    .number()
    .int()
    .positive()
    .max(250)
    .optional()
    .describe("Number of tokens to return (default: 20, max: 250)"),
  order: z.enum(["marketCap", "volume"]).optional().describe("Sort order (default: marketCap)"),
});

export const marketSearchTokenSchema = z.object({
  query: z.string().describe("Search query — token name, symbol, or keyword"),
});

export const marketGetCategoriesSchema = z.object({
  order: z
    .enum(["marketCap", "name", "marketCapChange24h"])
    .optional()
    .describe("Sort order for categories (default: marketCap)"),
  limit: limitSchema,
});

// ── Binance ─────────────────────────────────────────────────────

export const marketGetTickerSchema = z.object({
  symbol: tradingPairSchema,
});

export const marketGetKlinesSchema = z.object({
  symbol: tradingPairSchema,
  interval: z
    .enum(["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"])
    .describe("Candlestick interval"),
  limit: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe("Number of candles to return (default: 100, max: 1000)"),
});

export const marketGetOrderBookSchema = z.object({
  symbol: tradingPairSchema,
  limit: z
    .enum(["5", "10", "20", "50", "100"])
    .optional()
    .describe("Order book depth (default: '20')"),
});

export const marketGetFundingRatesSchema = z.object({
  symbol: tradingPairSchema,
  limit: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe("Number of funding rate entries (default: 10)"),
});
