import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolDefinition } from "../register.js";
import { createToolHandler } from "../shared/handler-factory.js";
import { getFundingRates, getKlines, getOrderBook, getTicker } from "./binance.js";
import {
  getCategories,
  getTokenHistory,
  getTopTokens,
  getTrending,
  searchToken,
} from "./coingecko.js";
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
} from "./defillama.js";
import {
  marketGetCategoriesSchema,
  marketGetCexFundFlowsSchema,
  marketGetChainTvlSchema,
  marketGetDexVolumeSchema,
  marketGetExchangeRankingsSchema,
  marketGetFundingRatesSchema,
  marketGetGainersLosersSchema,
  marketGetGlobalStatsSchema,
  marketGetKlinesSchema,
  marketGetOrderBookSchema,
  marketGetProtocolTvlSchema,
  marketGetSentimentSchema,
  marketGetStablecoinStatsSchema,
  marketGetTickerSchema,
  marketGetTokenHistorySchema,
  marketGetTokenPriceSchema,
  marketGetTopProtocolsSchema,
  marketGetTopTokensSchema,
  marketGetTrendingSchema,
  marketSearchTokenSchema,
} from "./schemas.js";
import { getSentiment } from "./sentiment.js";

const MARKET_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function getMarketToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "market_get_protocol_tvl",
      category: "market",
      description:
        "Fetch the Total Value Locked (TVL) for a specific DeFi protocol by its DefiLlama slug. " +
        "Returns current TVL in USD, percentage changes over 1d/7d/30d periods, per-chain TVL breakdown, " +
        "protocol category, and website URL.",
      inputSchema: zodToJsonSchema(marketGetProtocolTvlSchema) as Record<string, unknown>,
      handler: createToolHandler(
        marketGetProtocolTvlSchema,
        getProtocolTvl,
        "MARKET_PROTOCOL_TVL_ERROR"
      ),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_top_protocols",
      category: "market",
      description:
        "Retrieve a ranked list of the top DeFi protocols by TVL from DefiLlama. " +
        "Returns protocol name, current TVL, 1-day TVL change, first listed chain, category, and DefiLlama slug " +
        "for each entry in the list.",
      inputSchema: zodToJsonSchema(marketGetTopProtocolsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        marketGetTopProtocolsSchema,
        getTopProtocols,
        "MARKET_TOP_PROTOCOLS_ERROR"
      ),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_chain_tvl",
      category: "market",
      description:
        "Retrieve the historical TVL time series for a specific blockchain network from DefiLlama. " +
        "Returns a list of date/TVL pairs showing how the chain's total locked value has evolved over time.",
      inputSchema: zodToJsonSchema(marketGetChainTvlSchema) as Record<string, unknown>,
      handler: createToolHandler(marketGetChainTvlSchema, getChainTvl, "MARKET_CHAIN_TVL_ERROR"),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_token_price",
      category: "market",
      description:
        "Fetch current USD prices for one or more tokens using DefiLlama's price oracle. " +
        "Accepts token identifiers in the format 'chain:address' (e.g. 'ethereum:0x...') and returns " +
        "price, symbol, decimals, confidence score, and last-updated timestamp for each token.",
      inputSchema: zodToJsonSchema(marketGetTokenPriceSchema) as Record<string, unknown>,
      handler: createToolHandler(
        marketGetTokenPriceSchema,
        getTokenPrice,
        "MARKET_TOKEN_PRICE_ERROR"
      ),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_token_history",
      category: "market",
      description:
        "Fetch historical price data for a token from CoinGecko by its coin ID. " +
        "Returns OHLC candlestick data and market cap/volume history for the specified number of days.",
      inputSchema: zodToJsonSchema(marketGetTokenHistorySchema) as Record<string, unknown>,
      handler: createToolHandler(
        marketGetTokenHistorySchema,
        getTokenHistory,
        "MARKET_TOKEN_HISTORY_ERROR"
      ),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_gainers_losers",
      category: "market",
      description:
        "Retrieve the top gaining and losing tokens over a specified time period from DefiLlama. " +
        "Returns separate lists of gainers and losers, each with token symbol and price change percentage.",
      inputSchema: zodToJsonSchema(marketGetGainersLosersSchema) as Record<string, unknown>,
      handler: createToolHandler(
        marketGetGainersLosersSchema,
        getGainersLosers,
        "MARKET_GAINERS_LOSERS_ERROR"
      ),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_dex_volume",
      category: "market",
      description:
        "Fetch 24-hour trading volume data for decentralized exchanges from DefiLlama. " +
        "Returns a ranked list of DEXes with their daily and total volume figures.",
      inputSchema: zodToJsonSchema(marketGetDexVolumeSchema) as Record<string, unknown>,
      handler: createToolHandler(marketGetDexVolumeSchema, getDexVolume, "MARKET_DEX_VOLUME_ERROR"),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_stablecoin_stats",
      category: "market",
      description:
        "Retrieve stablecoin market statistics from DefiLlama, including circulating supply and peg data. " +
        "Returns a list of stablecoins with their name, symbol, total circulating supply, peg type, and peg mechanism.",
      inputSchema: zodToJsonSchema(marketGetStablecoinStatsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        marketGetStablecoinStatsSchema,
        getStablecoinStats,
        "MARKET_STABLECOIN_STATS_ERROR"
      ),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_global_stats",
      category: "market",
      description:
        "Fetch aggregate global DeFi market statistics from DefiLlama. " +
        "Returns total DeFi TVL across all chains and protocols, providing a macro view of the DeFi ecosystem.",
      inputSchema: zodToJsonSchema(marketGetGlobalStatsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        marketGetGlobalStatsSchema,
        getGlobalStats,
        "MARKET_GLOBAL_STATS_ERROR"
      ),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_cex_fund_flows",
      category: "market",
      description:
        "Fetch net fund flow data for centralized exchanges from DefiLlama's CEX tracker. " +
        "Returns inflow and outflow amounts for each exchange, useful for monitoring capital movements on CEXes.",
      inputSchema: zodToJsonSchema(marketGetCexFundFlowsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        marketGetCexFundFlowsSchema,
        getCexFundFlows,
        "MARKET_CEX_FUND_FLOWS_ERROR"
      ),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_exchange_rankings",
      category: "market",
      description:
        "Retrieve a ranked list of centralized exchanges from DefiLlama by their assets under management. " +
        "Returns exchange name, total assets, reported vs clean volume metrics, and number of coins/pairs tracked.",
      inputSchema: zodToJsonSchema(marketGetExchangeRankingsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        marketGetExchangeRankingsSchema,
        getExchangeRankings,
        "MARKET_EXCHANGE_RANKINGS_ERROR"
      ),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_sentiment",
      category: "market",
      description:
        "Fetch the Crypto Fear & Greed Index from alternative.me for the specified number of recent days. " +
        "Returns the current index value with classification (e.g. Fear, Greed) plus historical daily readings.",
      inputSchema: zodToJsonSchema(marketGetSentimentSchema) as Record<string, unknown>,
      handler: createToolHandler(marketGetSentimentSchema, getSentiment, "MARKET_SENTIMENT_ERROR"),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_trending",
      category: "market",
      description:
        "Fetch the currently trending cryptocurrencies on CoinGecko based on search activity. " +
        "Returns a list of trending coins with their name, symbol, CoinGecko ID, and market cap rank.",
      inputSchema: zodToJsonSchema(marketGetTrendingSchema) as Record<string, unknown>,
      handler: createToolHandler(marketGetTrendingSchema, getTrending, "MARKET_TRENDING_ERROR"),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_top_tokens",
      category: "market",
      description:
        "Retrieve the top cryptocurrencies by market capitalization from CoinGecko. " +
        "Returns name, symbol, current price, market cap, 24h price change percentage, and trading volume for each token.",
      inputSchema: zodToJsonSchema(marketGetTopTokensSchema) as Record<string, unknown>,
      handler: createToolHandler(marketGetTopTokensSchema, getTopTokens, "MARKET_TOP_TOKENS_ERROR"),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_search_token",
      category: "market",
      description:
        "Search for cryptocurrencies, exchanges, and NFTs on CoinGecko by keyword. " +
        "Returns matching coins with their CoinGecko ID, symbol, name, and market cap rank.",
      inputSchema: zodToJsonSchema(marketSearchTokenSchema) as Record<string, unknown>,
      handler: createToolHandler(marketSearchTokenSchema, searchToken, "MARKET_SEARCH_TOKEN_ERROR"),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_categories",
      category: "market",
      description:
        "Fetch a list of cryptocurrency categories from CoinGecko with their aggregate market data. " +
        "Returns category name, total market cap, 24h market cap change, and top-3 coins for each category.",
      inputSchema: zodToJsonSchema(marketGetCategoriesSchema) as Record<string, unknown>,
      handler: createToolHandler(
        marketGetCategoriesSchema,
        getCategories,
        "MARKET_CATEGORIES_ERROR"
      ),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_ticker",
      category: "market",
      description:
        "Fetch real-time 24-hour ticker statistics for a trading pair from Binance. " +
        "Returns last price, price change, high/low, volume, bid/ask, and quote volume for the specified symbol.",
      inputSchema: zodToJsonSchema(marketGetTickerSchema) as Record<string, unknown>,
      handler: createToolHandler(marketGetTickerSchema, getTicker, "MARKET_TICKER_ERROR"),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_klines",
      category: "market",
      description:
        "Fetch candlestick (OHLCV) chart data for a trading pair from Binance at a specified interval. " +
        "Returns open, high, low, close price, volume, and timestamp for each candle in the requested range.",
      inputSchema: zodToJsonSchema(marketGetKlinesSchema) as Record<string, unknown>,
      handler: createToolHandler(marketGetKlinesSchema, getKlines, "MARKET_KLINES_ERROR"),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_order_book",
      category: "market",
      description:
        "Fetch the current order book depth for a trading pair from Binance. " +
        "Returns bid and ask price levels with their quantities up to the requested depth.",
      inputSchema: zodToJsonSchema(marketGetOrderBookSchema) as Record<string, unknown>,
      handler: createToolHandler(marketGetOrderBookSchema, getOrderBook, "MARKET_ORDER_BOOK_ERROR"),
      annotations: MARKET_ANNOTATIONS,
    },
    {
      name: "market_get_funding_rates",
      category: "market",
      description:
        "Fetch the current perpetual futures funding rates for one or all symbols from Binance. " +
        "Returns the funding rate, funding time, and mark price for each perpetual contract, " +
        "which is useful for tracking carry costs in leveraged positions.",
      inputSchema: zodToJsonSchema(marketGetFundingRatesSchema) as Record<string, unknown>,
      handler: createToolHandler(
        marketGetFundingRatesSchema,
        getFundingRates,
        "MARKET_FUNDING_RATES_ERROR"
      ),
      annotations: MARKET_ANNOTATIONS,
    },
  ];
}
