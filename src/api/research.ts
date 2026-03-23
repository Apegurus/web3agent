import { createSDKInvoker } from "./shared.js";
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
  TokenDueDiligenceResult,
  TokenHolderEntry,
  TokenUnlockEntry,
  WhaleTransferEntry,
  YieldComparisonEntry,
  YieldPoolEntry,
} from "./types.js";

export const getContractSecurity = createSDKInvoker<
  GetContractSecurityInput,
  ContractSecurityResult
>("research_contract_security");
export const getTokenDueDiligence = createSDKInvoker<
  GetTokenDueDiligenceInput,
  TokenDueDiligenceResult
>("research_token_due_diligence");
export const getResearchTokenHolders = createSDKInvoker<GetTokenHoldersInput, TokenHolderEntry[]>(
  "research_token_holders"
);
export const getYieldOpportunities = createSDKInvoker<GetYieldOpportunitiesInput, YieldPoolEntry[]>(
  "research_yield_opportunities"
);
export const getCompareYields = createSDKInvoker<GetCompareYieldsInput, YieldComparisonEntry[]>(
  "research_compare_yields"
);
export const getProtocolInfo = createSDKInvoker<GetProtocolInfoInput, ProtocolInfoResult>(
  "research_protocol_info"
);
export const getTokenUnlocks = createSDKInvoker<GetTokenUnlocksInput, TokenUnlockEntry[]>(
  "research_token_unlocks"
);
export const getHackHistory = createSDKInvoker<GetHackHistoryInput, HackEntry[]>(
  "research_hack_history"
);
export const getFundRaises = createSDKInvoker<GetFundRaisesInput, FundRaiseEntry[]>(
  "research_fund_raises"
);
export const getWhaleTransfers = createSDKInvoker<GetWhaleTransfersInput, WhaleTransferEntry[]>(
  "research_whale_transfers"
);
export const getGovernance = createSDKInvoker<GetGovernanceInput, GovernanceProposalEntry[]>(
  "research_governance"
);
export const getNews = createSDKInvoker<GetNewsInput, NewsEntry[]>("research_news");
export const getAirdrops = createSDKInvoker<GetAirdropsInput, AirdropEntry[]>("research_airdrops");
