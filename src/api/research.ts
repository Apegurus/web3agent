import { getRuntime, invokeAndRequireData } from "./shared.js";
import type { RuntimeBoundOptions } from "./types.js";

export async function getContractSecurity(
  params: { address: string; chainId?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_contract_security", params);
}

export async function getTokenDueDiligence(
  params: { token: string; chainId?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_token_due_diligence", params);
}

export async function getTokenHolders(
  params: { token: string; chainId?: number; limit?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_token_holders", params);
}

export async function getYieldOpportunities(
  params: { token?: string; chain?: string; protocol?: string; minTvl?: number; limit?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_yield_opportunities", params);
}

export async function getCompareYields(
  params: { token: string; chainId?: number; limit?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_compare_yields", params);
}

export async function getProtocolInfo(params: { protocol: string }, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_protocol_info", params);
}

export async function getTokenUnlocks(params: { limit?: number }, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_token_unlocks", params);
}

export async function getHackHistory(
  params: { protocol?: string; limit?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_hack_history", params);
}

export async function getFundRaises(params: { limit?: number }, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_fund_raises", params);
}

export async function getWhaleTransfers(
  params: { symbol?: string; limit?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_whale_transfers", params);
}

export async function getGovernance(
  params: { protocol?: string; status?: "active" | "closed"; limit?: number },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_governance", params);
}

export async function getNews(params: { limit?: number }, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_news", params);
}

export async function getAirdrops(params: { limit?: number }, options?: RuntimeBoundOptions) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "research_airdrops", params);
}
