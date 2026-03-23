import { getRuntime, invokeAndRequireData } from "./shared.js";
import type {
  AirdropEntry,
  ContractSecurityResult,
  FundRaiseEntry,
  GetAirdropsInput,
  GetCompareYieldsInput,
  GetContractSecurityInput,
  GetFundRaisesInput,
  GetGovernanceInput,
  GetHackHistoryInput,
  GetNewsInput,
  GetProtocolInfoInput,
  GetTokenDueDiligenceInput,
  GetTokenHoldersInput,
  GetTokenUnlocksInput,
  GetWhaleTransfersInput,
  GetYieldOpportunitiesInput,
  GovernanceProposalEntry,
  HackEntry,
  NewsEntry,
  ProtocolInfoResult,
  RuntimeBoundOptions,
  TokenDueDiligenceResult,
  TokenHolderEntry,
  TokenUnlockEntry,
  WhaleTransferEntry,
  YieldComparisonEntry,
  YieldPoolEntry,
} from "./types.js";

export async function getContractSecurity(
  params: GetContractSecurityInput,
  options?: RuntimeBoundOptions
): Promise<ContractSecurityResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ContractSecurityResult>(
    runtime,
    "research_contract_security",
    params
  );
}

export async function getTokenDueDiligence(
  params: GetTokenDueDiligenceInput,
  options?: RuntimeBoundOptions
): Promise<TokenDueDiligenceResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<TokenDueDiligenceResult>(
    runtime,
    "research_token_due_diligence",
    params
  );
}

/** Named getResearchTokenHolders (not getTokenHolders) to avoid collision with explorer's getTokenHolders */
export async function getResearchTokenHolders(
  params: GetTokenHoldersInput,
  options?: RuntimeBoundOptions
): Promise<TokenHolderEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<TokenHolderEntry[]>(runtime, "research_token_holders", params);
}

export async function getYieldOpportunities(
  params: GetYieldOpportunitiesInput,
  options?: RuntimeBoundOptions
): Promise<YieldPoolEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<YieldPoolEntry[]>(runtime, "research_yield_opportunities", params);
}

export async function getCompareYields(
  params: GetCompareYieldsInput,
  options?: RuntimeBoundOptions
): Promise<YieldComparisonEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<YieldComparisonEntry[]>(runtime, "research_compare_yields", params);
}

export async function getProtocolInfo(
  params: GetProtocolInfoInput,
  options?: RuntimeBoundOptions
): Promise<ProtocolInfoResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ProtocolInfoResult>(runtime, "research_protocol_info", params);
}

export async function getTokenUnlocks(
  params: GetTokenUnlocksInput,
  options?: RuntimeBoundOptions
): Promise<TokenUnlockEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<TokenUnlockEntry[]>(runtime, "research_token_unlocks", params);
}

export async function getHackHistory(
  params: GetHackHistoryInput,
  options?: RuntimeBoundOptions
): Promise<HackEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<HackEntry[]>(runtime, "research_hack_history", params);
}

export async function getFundRaises(
  params: GetFundRaisesInput,
  options?: RuntimeBoundOptions
): Promise<FundRaiseEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<FundRaiseEntry[]>(runtime, "research_fund_raises", params);
}

export async function getWhaleTransfers(
  params: GetWhaleTransfersInput,
  options?: RuntimeBoundOptions
): Promise<WhaleTransferEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<WhaleTransferEntry[]>(runtime, "research_whale_transfers", params);
}

export async function getGovernance(
  params: GetGovernanceInput,
  options?: RuntimeBoundOptions
): Promise<GovernanceProposalEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<GovernanceProposalEntry[]>(runtime, "research_governance", params);
}

export async function getNews(
  params: GetNewsInput,
  options?: RuntimeBoundOptions
): Promise<NewsEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<NewsEntry[]>(runtime, "research_news", params);
}

export async function getAirdrops(
  params: GetAirdropsInput,
  options?: RuntimeBoundOptions
): Promise<AirdropEntry[]> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<AirdropEntry[]>(runtime, "research_airdrops", params);
}
