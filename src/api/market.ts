import { getRuntime, invokeAndRequireData } from "./shared.js";
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
  RuntimeBoundOptions,
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

export async function getProtocolTvl(
  params: GetProtocolTvlInput,
  options?: RuntimeBoundOptions
): Promise<ProtocolTvlResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ProtocolTvlResult>(runtime, "market_get_protocol_tvl", params);
}

export async function getTopProtocols(
  params: GetTopProtocolsInput,
  options?: RuntimeBoundOptions
): Promise<TopProtocolEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<TopProtocolEntry[]>(runtime, "market_get_top_protocols", params);
}

export async function getChainTvl(
  params: GetChainTvlInput,
  options?: RuntimeBoundOptions
): Promise<ChainTvlEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ChainTvlEntry[]>(runtime, "market_get_chain_tvl", params);
}

export async function getTokenPrice(
  params: GetTokenPriceInput,
  options?: RuntimeBoundOptions
): Promise<TokenPriceResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<TokenPriceResult>(runtime, "market_get_token_price", params);
}

export async function getTokenHistory(
  params: GetTokenHistoryInput,
  options?: RuntimeBoundOptions
): Promise<TokenHistoryEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<TokenHistoryEntry[]>(runtime, "market_get_token_history", params);
}

export async function getGainersLosers(
  params: GetGainersLosersInput,
  options?: RuntimeBoundOptions
): Promise<GainersLosersResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<GainersLosersResult>(runtime, "market_get_gainers_losers", params);
}

export async function getDexVolume(
  params: GetDexVolumeInput,
  options?: RuntimeBoundOptions
): Promise<DexVolumeResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<DexVolumeResult>(runtime, "market_get_dex_volume", params);
}

export async function getStablecoinStats(
  params: GetStablecoinStatsInput,
  options?: RuntimeBoundOptions
): Promise<StablecoinEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<StablecoinEntry[]>(runtime, "market_get_stablecoin_stats", params);
}

export async function getGlobalStats(
  params: GetGlobalStatsInput,
  options?: RuntimeBoundOptions
): Promise<GlobalStatsResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<GlobalStatsResult>(runtime, "market_get_global_stats", params);
}

export async function getCexFundFlows(
  params: GetCexFundFlowsInput,
  options?: RuntimeBoundOptions
): Promise<CexFundFlowEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<CexFundFlowEntry[]>(runtime, "market_get_cex_fund_flows", params);
}

export async function getExchangeRankings(
  params: GetExchangeRankingsInput,
  options?: RuntimeBoundOptions
): Promise<ExchangeRankingEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExchangeRankingEntry[]>(
    runtime,
    "market_get_exchange_rankings",
    params
  );
}

export async function getSentiment(
  params: GetSentimentInput,
  options?: RuntimeBoundOptions
): Promise<SentimentResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<SentimentResult>(runtime, "market_get_sentiment", params);
}

export async function getTrending(
  params: GetTrendingInput,
  options?: RuntimeBoundOptions
): Promise<TrendingResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<TrendingResult>(runtime, "market_get_trending", params);
}

export async function getTopTokens(
  params: GetTopTokensInput,
  options?: RuntimeBoundOptions
): Promise<TopTokenEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<TopTokenEntry[]>(runtime, "market_get_top_tokens", params);
}

export async function searchToken(
  params: SearchTokenInput,
  options?: RuntimeBoundOptions
): Promise<TokenSearchResultEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<TokenSearchResultEntry[]>(runtime, "market_search_token", params);
}

export async function getCategories(
  params: GetCategoriesInput,
  options?: RuntimeBoundOptions
): Promise<CategoryEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<CategoryEntry[]>(runtime, "market_get_categories", params);
}

export async function getTicker(
  params: GetTickerInput,
  options?: RuntimeBoundOptions
): Promise<TickerResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<TickerResult>(runtime, "market_get_ticker", params);
}

export async function getKlines(
  params: GetKlinesInput,
  options?: RuntimeBoundOptions
): Promise<KlineEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<KlineEntry[]>(runtime, "market_get_klines", params);
}

export async function getOrderBook(
  params: GetOrderBookInput,
  options?: RuntimeBoundOptions
): Promise<OrderBookResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<OrderBookResult>(runtime, "market_get_order_book", params);
}

export async function getFundingRates(
  params: GetFundingRatesInput,
  options?: RuntimeBoundOptions
): Promise<FundingRateEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<FundingRateEntry[]>(runtime, "market_get_funding_rates", params);
}
