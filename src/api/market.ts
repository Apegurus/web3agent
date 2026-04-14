import { createSDKInvoker } from "./shared.js";
import type {
  CategoryEntry,
  CexFundFlowEntry,
  ChainTvlEntry,
  DexVolumeResult,
  ExchangeRankingEntry,
  FundingRateEntry,
  GainersLosersResult,
  GetCategoriesInput,
  GetCexFundFlowsInput,
  GetChainTvlInput,
  GetDexVolumeInput,
  GetExchangeRankingsInput,
  GetFundingRatesInput,
  GetGainersLosersInput,
  GetGlobalStatsInput,
  GetKlinesInput,
  GetOrderBookInput,
  GetProtocolTvlInput,
  GetSentimentInput,
  GetStablecoinStatsInput,
  GetTickerInput,
  GetTokenHistoryInput,
  GetTokenPriceInput,
  GetTopProtocolsInput,
  GetTopTokensInput,
  GetTrendingInput,
  GlobalStatsResult,
  KlineEntry,
  OrderBookResult,
  ProtocolTvlResult,
  SearchTokenInput,
  SentimentResult,
  StablecoinEntry,
  TickerResult,
  TokenHistoryEntry,
  TokenPriceResult,
  TokenSearchResultEntry,
  TopProtocolEntry,
  TopTokenEntry,
  TrendingResult,
} from "./types.js";

export const getProtocolTvl = createSDKInvoker<GetProtocolTvlInput, ProtocolTvlResult>(
  "market_get_protocol_tvl"
);
export const getTopProtocols = createSDKInvoker<GetTopProtocolsInput, TopProtocolEntry[]>(
  "market_get_top_protocols"
);
export const getChainTvl = createSDKInvoker<GetChainTvlInput, ChainTvlEntry[]>(
  "market_get_chain_tvl"
);
export const getTokenPrice = createSDKInvoker<GetTokenPriceInput, TokenPriceResult>(
  "market_get_token_price"
);
export const getTokenHistory = createSDKInvoker<GetTokenHistoryInput, TokenHistoryEntry[]>(
  "market_get_token_history"
);
export const getGainersLosers = createSDKInvoker<GetGainersLosersInput, GainersLosersResult>(
  "market_get_gainers_losers"
);
export const getDexVolume = createSDKInvoker<GetDexVolumeInput, DexVolumeResult>(
  "market_get_dex_volume"
);
export const getStablecoinStats = createSDKInvoker<GetStablecoinStatsInput, StablecoinEntry[]>(
  "market_get_stablecoin_stats"
);
export const getGlobalStats = createSDKInvoker<GetGlobalStatsInput, GlobalStatsResult>(
  "market_get_global_stats"
);
export const getCexFundFlows = createSDKInvoker<GetCexFundFlowsInput, CexFundFlowEntry[]>(
  "market_get_cex_fund_flows"
);
export const getExchangeRankings = createSDKInvoker<
  GetExchangeRankingsInput,
  ExchangeRankingEntry[]
>("market_get_exchange_rankings");
export const getSentiment = createSDKInvoker<GetSentimentInput, SentimentResult>(
  "market_get_sentiment"
);
export const getTrending = createSDKInvoker<GetTrendingInput, TrendingResult>(
  "market_get_trending"
);
export const getTopTokens = createSDKInvoker<GetTopTokensInput, TopTokenEntry[]>(
  "market_get_top_tokens"
);
export const searchToken = createSDKInvoker<SearchTokenInput, TokenSearchResultEntry[]>(
  "market_search_token"
);
export const getCategories = createSDKInvoker<GetCategoriesInput, CategoryEntry[]>(
  "market_get_categories"
);
/** @deprecated Use `ccxtPublicCall` with method `fetchTicker` instead. */
export const getTicker = createSDKInvoker<GetTickerInput, TickerResult>("market_get_ticker");
/** @deprecated Use `ccxtPublicCall` with method `fetchOHLCV` instead. */
export const getKlines = createSDKInvoker<GetKlinesInput, KlineEntry[]>("market_get_klines");
/** @deprecated Use `ccxtPublicCall` with method `fetchOrderBook` instead. */
export const getOrderBook = createSDKInvoker<GetOrderBookInput, OrderBookResult>(
  "market_get_order_book"
);
/** @deprecated Use `ccxtPublicCall` with method `fetchFundingRates` instead. */
export const getFundingRates = createSDKInvoker<GetFundingRatesInput, FundingRateEntry[]>(
  "market_get_funding_rates"
);
