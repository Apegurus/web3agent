import { getRuntime, invokeAndRequireData } from "./shared.js";
import type { RuntimeBoundOptions } from "./types.js";

export async function getProtocolTvl(params: { protocol: string }, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_protocol_tvl", params);
}

export async function getTopProtocols(
  params: { chain?: string; category?: string; limit?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_top_protocols", params);
}

export async function getChainTvl(params: { chain: string }, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_chain_tvl", params);
}

export async function getTokenPrice(
  params: { tokens: string[]; searchWidth?: string },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_token_price", params);
}

export async function getTokenHistory(
  params: { token: string; period?: "1d" | "7d" | "30d" | "90d" | "1y" },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_token_history", params);
}

export async function getGainersLosers(
  params: { period?: "1h" | "24h" | "7d"; limit?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_gainers_losers", params);
}

export async function getDexVolume(
  params: { chain?: string; protocol?: string },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_dex_volume", params);
}

export async function getStablecoinStats(
  params: { chain?: string },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_stablecoin_stats", params);
}

export async function getGlobalStats(params: Record<string, never>, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_global_stats", params);
}

export async function getCexFundFlows(params: { limit?: number }, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_cex_fund_flows", params);
}

export async function getExchangeRankings(
  params: { limit?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_exchange_rankings", params);
}

export async function getSentiment(params: { days?: number }, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_sentiment", params);
}

export async function getTrending(params: { limit?: number }, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_trending", params);
}

export async function getTopTokens(
  params: { category?: string; limit?: number; order?: "marketCap" | "volume" },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_top_tokens", params);
}

export async function searchToken(params: { query: string }, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_search_token", params);
}

export async function getCategories(
  params: { order?: "marketCap" | "name" | "marketCapChange24h"; limit?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_categories", params);
}

export async function getTicker(params: { symbol: string }, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_ticker", params);
}

export async function getKlines(
  params: {
    symbol: string;
    interval: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M";
    limit?: number;
  },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_klines", params);
}

export async function getOrderBook(
  params: { symbol: string; limit?: "5" | "10" | "20" | "50" | "100" },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_order_book", params);
}

export async function getFundingRates(
  params: { symbol: string; limit?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_funding_rates", params);
}
