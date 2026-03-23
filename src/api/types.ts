import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Chain } from "viem";
import type { z } from "zod";
import type {
  CreateRuntimeOptions,
  RuntimeHealth,
  RuntimeToolListener,
  ToolCatalogEntry,
  ToolCategory,
  ToolErrorPayload,
  ToolResultError,
  ToolResultPayload,
  ToolSource,
  ToolSuccessPayload,
  Web3AgentRuntime,
} from "../runtime/types.js";
import type { ResolvedToken } from "../tokens/resolver.js";
// biome-ignore lint/style/useImportType: z.infer<typeof X> requires value imports for typeof
import {
  acpVClaimRefundSchema,
  acpVCompleteJobSchema,
  acpVCreateJobSchema,
  acpVFundJobSchema,
  acpVGetJobSchema,
  acpVRejectJobSchema,
  acpVSetBudgetSchema,
  acpVSubmitJobSchema,
} from "../tools/acp-virtuals/schemas.js";
// biome-ignore lint/style/useImportType: z.infer<typeof X> requires value imports for typeof
import {
  erc8183ClaimRefundSchema,
  erc8183CompleteJobSchema,
  erc8183CreateJobSchema,
  erc8183FundJobSchema,
  erc8183GetJobSchema,
  erc8183RejectJobSchema,
  erc8183SetBudgetSchema,
  erc8183SubmitJobSchema,
} from "../tools/acp/schemas.js";
// biome-ignore lint/style/useImportType: z.infer<typeof X> requires value imports for typeof
import {
  agdpCreateOfferingSchema,
  agdpGetMyJobsSchema,
  agdpGetOfferingSchema,
  agdpGetOfferingsSchema,
  agdpHireAgentSchema,
} from "../tools/agdp/schemas.js";
// biome-ignore lint/style/useImportType: z.infer<typeof X> requires value imports for typeof
import {
  erc8004GetAgentSchema,
  erc8004GetFeedbackSchema,
  erc8004RegisterSchema,
  erc8004SubmitFeedbackSchema,
  erc8004UpdateAgentSchema,
} from "../tools/erc8004/schemas.js";
// biome-ignore lint/style/useImportType: z.infer<typeof X> requires value imports for typeof
import { policyGetSchema } from "../tools/policy/schemas.js";
// biome-ignore lint/style/useImportType: z.infer<typeof X> requires value imports for typeof
import { x402CheckRequirementsSchema, x402FetchSchema } from "../tools/x402/schemas.js";
import type { RuntimeConfig } from "../types/config.js";
import type { WalletState } from "../types/wallet.js";
import type {
  lifiExecuteBridgeSchema,
  lifiGetQuoteSchema,
  lifiPrepareBridgeIntentSchema,
  listChainTokensSchema,
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
  operationActionResultSchema,
  operationResumeStateSchema,
  orbsCancelOrderSchema,
  orbsGetQuoteSchema,
  orbsGetRequiredApprovalsSchema,
  orbsPlaceLimitSchema,
  orbsPlaceOrderSchema,
  orbsPlaceTwapSchema,
  orbsPrepareLimitIntentSchema,
  orbsPrepareOrderIntentSchema,
  orbsPrepareSwapIntentSchema,
  orbsPrepareTwapIntentSchema,
  orbsQueryOrdersSchema,
  orbsSubmitSignedOrderSchema,
  orbsSubmitSignedSwapSchema,
  orbsSwapStatusSchema,
  prepareOperationSchema,
  preparedActionSchema,
  preparedSignMessageActionSchema,
  preparedSignTypedDataActionSchema,
  preparedTransactionActionSchema,
  preparedTransactionRequestSchema,
  researchAirdropsSchema,
  researchCompareYieldsSchema,
  researchContractSecuritySchema,
  researchFundRaisesSchema,
  researchGovernanceSchema,
  researchHackHistorySchema,
  researchNewsSchema,
  researchProtocolInfoSchema,
  researchTokenDueDiligenceSchema,
  researchTokenHoldersSchema,
  researchTokenUnlocksSchema,
  researchWhaleTransfersSchema,
  researchYieldOpportunitiesSchema,
  resolveTokenSchema,
  transactionConfirmSchema,
  transactionDenySchema,
  transactionSimulateSchema,
  typedDataPayloadSchema,
  walletActivateSchema,
  walletDeriveAddressesSchema,
  walletFromMnemonicSchema,
  walletSetConfirmationSchema,
} from "./schemas.js";
// biome-ignore lint/style/useImportType: z.infer<typeof X> requires value imports for typeof
import {
  explorerAddressInfoSchema,
  explorerBlockByTimestampSchema,
  explorerBlockInfoSchema,
  explorerBlockRewardUncleSchema,
  explorerBlockRewardsSchema,
  explorerContractAbiSchema,
  explorerContractCodeSchema,
  explorerContractCreatorSchema,
  explorerContractSourceSchema,
  explorerDailyStatSchema,
  explorerDailyStatsSchema,
  explorerEventLogSchema,
  explorerEventLogsSchema,
  explorerHistoricalBalanceSchema,
  explorerHistoricalPriceEntrySchema,
  explorerHistoricalPriceSchema,
  explorerInternalTxSchema,
  explorerInternalTxsSchema,
  explorerNativePriceSchema,
  explorerNativeSupplySchema,
  explorerNftInventorySchema,
  explorerNftItemSchema,
  explorerTokenHolderSchema,
  explorerTokenHoldersSchema,
  explorerTokenHoldingSchema,
  explorerTokenInfoSchema,
  explorerTokenSupplySchema,
  explorerTokenTransferSchema,
  explorerTokenTransfersSchema,
  explorerTokensByAddressSchema,
  explorerTransactionSchema,
  explorerTxDetailsSchema,
  explorerTxExecutionStatusSchema,
  explorerTxHistorySchema,
  explorerTxReceiptSchema,
} from "./schemas/explorer-outputs.js";
// biome-ignore lint/style/useImportType: z.infer<typeof X> requires value imports for typeof
import {
  airdropEntrySchema,
  approvalStepSchema,
  balanceChangeSchema,
  bridgeIntentSchema,
  bridgeTxStepSchema,
  categoryEntrySchema,
  cexFundFlowEntrySchema,
  chainTvlEntrySchema,
  contractSecurityResultSchema,
  crossChainSwapQuoteResultSchema,
  crossChainSwapQuoteSummarySchema,
  dexVolumeResultSchema,
  exchangeRankingEntrySchema,
  fundRaiseEntrySchema,
  fundingRateEntrySchema,
  gainersLosersResultSchema,
  globalStatsResultSchema,
  governanceProposalEntrySchema,
  hackEntrySchema,
  klineEntrySchema,
  limitIntentSchema,
  newsEntrySchema,
  orderBookResultSchema,
  preparedOperationSchema,
  protocolInfoResultSchema,
  protocolTvlResultSchema,
  sameChainSwapQuoteResultSchema,
  sentimentResultSchema,
  simulationResultSchema,
  spotOrderIntentSchema,
  stablecoinEntrySchema,
  swapIntentSchema,
  swapQuoteResultSchema,
  swapSubmissionResultSchema,
  tickerResultSchema,
  tokenDueDiligenceResultSchema,
  tokenHistoryEntrySchema,
  tokenHolderEntrySchema,
  tokenPriceResultSchema,
  tokenSearchResultEntrySchema,
  tokenSwappableResultSchema,
  tokenUnlockEntrySchema,
  topProtocolEntrySchema,
  topTokenEntrySchema,
  trendingResultSchema,
  twapIntentSchema,
  whaleTransferEntrySchema,
  yieldComparisonEntrySchema,
  yieldPoolEntrySchema,
} from "./schemas/outputs.js";
// biome-ignore lint/style/useImportType: z.infer<typeof X> requires value imports for typeof
import {
  acpClaimRefundOutputSchema,
  acpCompleteJobOutputSchema,
  acpCreateJobOutputSchema,
  acpFundJobOutputSchema,
  acpGetJobOutputSchema,
  acpRejectJobOutputSchema,
  acpSetBudgetOutputSchema,
  acpSubmitJobOutputSchema,
  agdpCreateOfferingOutputSchema,
  agdpGetMyJobsOutputSchema,
  agdpGetOfferingOutputSchema,
  agdpGetOfferingsOutputSchema,
  agdpHireAgentOutputSchema,
  erc8004GetAgentOutputSchema,
  erc8004GetFeedbackOutputSchema,
  erc8004RegisterAgentOutputSchema,
  erc8004SubmitFeedbackOutputSchema,
  erc8004UpdateAgentOutputSchema,
  erc8183ClaimRefundOutputSchema,
  erc8183CompleteJobOutputSchema,
  erc8183CreateJobOutputSchema,
  erc8183FundJobOutputSchema,
  erc8183GetJobOutputSchema,
  erc8183RejectJobOutputSchema,
  erc8183SetBudgetOutputSchema,
  erc8183SubmitJobOutputSchema,
  policyGetOutputSchema,
  x402CheckRequirementsOutputSchema,
  x402FetchOutputSchema,
} from "./schemas/sdk-outputs.js";

export type ResolveTokenInput = z.infer<typeof resolveTokenSchema>;
export type ListChainTokensInput = z.infer<typeof listChainTokensSchema>;
export type LifiQuoteInput = z.infer<typeof lifiGetQuoteSchema>;
export type ExecuteBridgeInput = z.infer<typeof lifiExecuteBridgeSchema>;
export type PrepareBridgeIntentInput = z.infer<typeof lifiPrepareBridgeIntentSchema>;
export type OrbsQuoteInput = z.infer<typeof orbsGetQuoteSchema>;
export type ExecuteSameChainSwapInput = OrbsQuoteInput;
export type PrepareSwapIntentInput = z.infer<typeof orbsPrepareSwapIntentSchema>;
export type GetRequiredApprovalsInput = z.input<typeof orbsGetRequiredApprovalsSchema>;
export type SubmitSignedSwapInput = z.infer<typeof orbsSubmitSignedSwapSchema>;
export type SwapStatusInput = z.infer<typeof orbsSwapStatusSchema>;
export type PlaceOrderInput = z.infer<typeof orbsPlaceOrderSchema>;
export type PrepareOrderIntentInput = z.infer<typeof orbsPrepareOrderIntentSchema>;
export type PlaceTwapOrderInput = z.infer<typeof orbsPlaceTwapSchema>;
export type PrepareTwapIntentInput = z.infer<typeof orbsPrepareTwapIntentSchema>;
export type PlaceLimitOrderInput = z.infer<typeof orbsPlaceLimitSchema>;
export type PrepareLimitIntentInput = z.infer<typeof orbsPrepareLimitIntentSchema>;
export type SubmitSignedOrderInput = z.infer<typeof orbsSubmitSignedOrderSchema>;
export type QueryOrdersInput = z.infer<typeof orbsQueryOrdersSchema>;
export type CancelOrderInput = z.infer<typeof orbsCancelOrderSchema>;
export type SpotOrderIntent = z.infer<typeof spotOrderIntentSchema>;
export type WalletActivateInput = z.infer<typeof walletActivateSchema>;
export type WalletSetConfirmationInput = z.infer<typeof walletSetConfirmationSchema>;
export type WalletFromMnemonicInput = z.infer<typeof walletFromMnemonicSchema>;
export type WalletDeriveAddressesInput = z.infer<typeof walletDeriveAddressesSchema>;
export type TransactionConfirmInput = z.infer<typeof transactionConfirmSchema>;
export type TransactionDenyInput = z.infer<typeof transactionDenySchema>;
export type SimulateTransactionInput = z.infer<typeof transactionSimulateSchema>;

export type AcpCreateJobInput = z.infer<typeof acpVCreateJobSchema>;
export type AcpSetBudgetInput = z.infer<typeof acpVSetBudgetSchema>;
export type AcpFundJobInput = z.infer<typeof acpVFundJobSchema>;
export type AcpSubmitJobInput = z.infer<typeof acpVSubmitJobSchema>;
export type AcpCompleteJobInput = z.infer<typeof acpVCompleteJobSchema>;
export type AcpRejectJobInput = z.infer<typeof acpVRejectJobSchema>;
export type AcpClaimRefundInput = z.infer<typeof acpVClaimRefundSchema>;
export type AcpGetJobInput = z.infer<typeof acpVGetJobSchema>;

export type AcpCreateJobOutput = z.infer<typeof acpCreateJobOutputSchema>;
export type AcpSetBudgetOutput = z.infer<typeof acpSetBudgetOutputSchema>;
export type AcpFundJobOutput = z.infer<typeof acpFundJobOutputSchema>;
export type AcpSubmitJobOutput = z.infer<typeof acpSubmitJobOutputSchema>;
export type AcpCompleteJobOutput = z.infer<typeof acpCompleteJobOutputSchema>;
export type AcpRejectJobOutput = z.infer<typeof acpRejectJobOutputSchema>;
export type AcpClaimRefundOutput = z.infer<typeof acpClaimRefundOutputSchema>;
export type AcpGetJobOutput = z.infer<typeof acpGetJobOutputSchema>;

export type Erc8183CreateJobInput = z.infer<typeof erc8183CreateJobSchema>;
export type Erc8183SetBudgetInput = z.infer<typeof erc8183SetBudgetSchema>;
export type Erc8183FundJobInput = z.infer<typeof erc8183FundJobSchema>;
export type Erc8183SubmitJobInput = z.infer<typeof erc8183SubmitJobSchema>;
export type Erc8183CompleteJobInput = z.infer<typeof erc8183CompleteJobSchema>;
export type Erc8183RejectJobInput = z.infer<typeof erc8183RejectJobSchema>;
export type Erc8183ClaimRefundInput = z.infer<typeof erc8183ClaimRefundSchema>;
export type Erc8183GetJobInput = z.infer<typeof erc8183GetJobSchema>;

export type Erc8183CreateJobOutput = z.infer<typeof erc8183CreateJobOutputSchema>;
export type Erc8183SetBudgetOutput = z.infer<typeof erc8183SetBudgetOutputSchema>;
export type Erc8183FundJobOutput = z.infer<typeof erc8183FundJobOutputSchema>;
export type Erc8183SubmitJobOutput = z.infer<typeof erc8183SubmitJobOutputSchema>;
export type Erc8183CompleteJobOutput = z.infer<typeof erc8183CompleteJobOutputSchema>;
export type Erc8183RejectJobOutput = z.infer<typeof erc8183RejectJobOutputSchema>;
export type Erc8183ClaimRefundOutput = z.infer<typeof erc8183ClaimRefundOutputSchema>;
export type Erc8183GetJobOutput = z.infer<typeof erc8183GetJobOutputSchema>;

export type AgdpGetOfferingsInput = z.infer<typeof agdpGetOfferingsSchema>;
export type AgdpGetOfferingInput = z.infer<typeof agdpGetOfferingSchema>;
export type AgdpGetMyJobsInput = z.infer<typeof agdpGetMyJobsSchema>;
export type AgdpHireAgentInput = z.infer<typeof agdpHireAgentSchema>;
export type AgdpCreateOfferingInput = z.infer<typeof agdpCreateOfferingSchema>;

export type AgdpGetOfferingsOutput = z.infer<typeof agdpGetOfferingsOutputSchema>;
export type AgdpGetOfferingOutput = z.infer<typeof agdpGetOfferingOutputSchema>;
export type AgdpGetMyJobsOutput = z.infer<typeof agdpGetMyJobsOutputSchema>;
export type AgdpHireAgentOutput = z.infer<typeof agdpHireAgentOutputSchema>;
export type AgdpCreateOfferingOutput = z.infer<typeof agdpCreateOfferingOutputSchema>;

export type Erc8004RegisterAgentInput = z.infer<typeof erc8004RegisterSchema>;
export type Erc8004GetAgentInput = z.infer<typeof erc8004GetAgentSchema>;
export type Erc8004UpdateAgentInput = z.infer<typeof erc8004UpdateAgentSchema>;
export type Erc8004SubmitFeedbackInput = z.infer<typeof erc8004SubmitFeedbackSchema>;
export type Erc8004GetFeedbackInput = z.infer<typeof erc8004GetFeedbackSchema>;

export type Erc8004RegisterAgentOutput = z.infer<typeof erc8004RegisterAgentOutputSchema>;
export type Erc8004GetAgentOutput = z.infer<typeof erc8004GetAgentOutputSchema>;
export type Erc8004UpdateAgentOutput = z.infer<typeof erc8004UpdateAgentOutputSchema>;
export type Erc8004SubmitFeedbackOutput = z.infer<typeof erc8004SubmitFeedbackOutputSchema>;
export type Erc8004GetFeedbackOutput = z.infer<typeof erc8004GetFeedbackOutputSchema>;

export type X402CheckRequirementsInput = z.infer<typeof x402CheckRequirementsSchema>;
export type X402FetchInput = z.infer<typeof x402FetchSchema>;

export type X402CheckRequirementsOutput = z.infer<typeof x402CheckRequirementsOutputSchema>;
export type X402FetchOutput = z.infer<typeof x402FetchOutputSchema>;

export type PolicyGetInput = z.infer<typeof policyGetSchema>;
export type PolicyGetOutput = z.infer<typeof policyGetOutputSchema>;

export interface RuntimeBoundOptions {
  runtime?: Web3AgentRuntime;
}

export interface SupportedChainEntry {
  id: number;
  name: string;
  nativeCurrency: Chain["nativeCurrency"];
}

export interface SupportedChainsResult {
  note: string;
  chains: SupportedChainEntry[];
}

export type ChainLookupResult = Chain | undefined;

export interface WalletGenerateResult {
  address: string;
  privateKey: string;
  warning: string;
}

export interface WalletGenerateMnemonicResult {
  mnemonic: string;
  firstAddress: string;
  derivationPath: string;
  warning: string;
}

export interface WalletAddressDerivationResult {
  address: string;
  derivationPath: string;
}

export interface WalletDerivedAddressEntry {
  index: number;
  address: string;
  derivationPath: string;
}

export interface WalletDeactivationResult {
  mode: WalletState["mode"];
  message: string;
}

export interface WalletConfirmationResult {
  confirmationRequired: boolean;
  message: string;
}

export interface TransactionDenyResult {
  denied: true;
  id: string;
  message: string;
}

export interface TransactionListEntry {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  expiresIn: number;
  walletAddress?: string;
}

export interface TransactionListResult {
  count: number;
  operations: TransactionListEntry[];
}

export interface ServerStatusResult {
  walletMode: WalletState["mode"];
  activeChainId: number;
  confirmWrites: boolean;
  backends: RuntimeHealth["backends"];
  toolCount: number;
}

export interface PendingConfirmationResult {
  status: "pending_confirmation";
  id: string;
  summary: string;
}

export type TypedDataPayload = z.infer<typeof typedDataPayloadSchema>;

export type ApprovalStep = z.infer<typeof approvalStepSchema>;
export type SwapIntent = z.infer<typeof swapIntentSchema>;
export type TwapIntent = z.infer<typeof twapIntentSchema>;
export type LimitIntent = z.infer<typeof limitIntentSchema>;

export type PreparedTransactionRequest = z.infer<typeof preparedTransactionRequestSchema>;
export type PreparedTransactionAction = z.infer<typeof preparedTransactionActionSchema>;
export type PreparedSignTypedDataAction = z.infer<typeof preparedSignTypedDataActionSchema>;
export type PreparedSignMessageAction = z.infer<typeof preparedSignMessageActionSchema>;
export type PreparedAction = z.infer<typeof preparedActionSchema>;

export type PreparedOperationIntegration = "orbs" | "lifi" | "goat";

export type OperationResumeState = z.infer<typeof operationResumeStateSchema>;

export type PreparedOperation = z.infer<typeof preparedOperationSchema>;

export type OperationActionResult = z.infer<typeof operationActionResultSchema>;
export type OperationTransactionResult = Extract<OperationActionResult, { type: "transaction" }>;
export type OperationSignatureResult = Extract<OperationActionResult, { type: "signature" }>;
export type OperationMessageSignatureResult = Extract<
  OperationActionResult,
  { type: "messageSignature" }
>;
export type OrbsSwapOperationInput = Extract<
  z.infer<typeof prepareOperationSchema>,
  { integration: "orbs"; kind: "swap" }
>;
export type OrbsOrderOperationInput = Extract<
  z.infer<typeof prepareOperationSchema>,
  { integration: "orbs"; kind: "order" }
>;
export type LifiBridgeOperationInput = Extract<
  z.infer<typeof prepareOperationSchema>,
  { integration: "lifi"; kind: "bridge" }
>;
export type GoatToolOperationInput = Extract<
  z.infer<typeof prepareOperationSchema>,
  { integration: "goat"; kind: "tool" }
>;
export type PrepareOperationInput = z.infer<typeof prepareOperationSchema>;
export interface ResumeOperationInput {
  resumeState: OperationResumeState;
  actionResults?: Record<string, OperationActionResult>;
}

export interface ResumeOperationPendingResult {
  completed: false;
  operation: PreparedOperation;
}

export interface ResumeOperationCompletedResult {
  completed: true;
  integration: PreparedOperationIntegration;
  kind: string;
  result: CompletedOperationResult;
}

export type PrepareOperationResult = PreparedOperation | ResumeOperationCompletedResult;

export type ResumeOperationResult = ResumeOperationPendingResult | ResumeOperationCompletedResult;

export type BridgeTxStep = z.infer<typeof bridgeTxStepSchema>;
export type BridgeIntent = z.infer<typeof bridgeIntentSchema>;

export type BalanceChange = z.infer<typeof balanceChangeSchema>;
export type SimulationResult = z.infer<typeof simulationResultSchema>;
export type SwapSubmissionResult = z.infer<typeof swapSubmissionResultSchema>;

export interface CompletedOperationResult {
  status?: string;
  message?: string;
  txHash?: string;
  [key: string]: unknown;
}

export type WriteOperationResult = PendingConfirmationResult | CompletedOperationResult;

export type SameChainSwapQuoteResult = z.infer<typeof sameChainSwapQuoteResultSchema>;
export type CrossChainSwapQuoteSummary = z.infer<typeof crossChainSwapQuoteSummarySchema>;
export type CrossChainSwapQuoteResult = z.infer<typeof crossChainSwapQuoteResultSchema>;
export type SwapQuoteResult = z.infer<typeof swapQuoteResultSchema>;
export type TokenSwappableResult = z.infer<typeof tokenSwappableResultSchema>;

// ── Market output types ──────────────────────────────────────────────────────
export type ProtocolTvlResult = z.infer<typeof protocolTvlResultSchema>;
export type TopProtocolEntry = z.infer<typeof topProtocolEntrySchema>;
export type ChainTvlEntry = z.infer<typeof chainTvlEntrySchema>;
export type TokenPriceResult = z.infer<typeof tokenPriceResultSchema>;
export type TokenHistoryEntry = z.infer<typeof tokenHistoryEntrySchema>;
export type GainersLosersResult = z.infer<typeof gainersLosersResultSchema>;
export type DexVolumeResult = z.infer<typeof dexVolumeResultSchema>;
export type StablecoinEntry = z.infer<typeof stablecoinEntrySchema>;
export type GlobalStatsResult = z.infer<typeof globalStatsResultSchema>;
export type CexFundFlowEntry = z.infer<typeof cexFundFlowEntrySchema>;
export type ExchangeRankingEntry = z.infer<typeof exchangeRankingEntrySchema>;
export type SentimentResult = z.infer<typeof sentimentResultSchema>;
export type TrendingResult = z.infer<typeof trendingResultSchema>;
export type TopTokenEntry = z.infer<typeof topTokenEntrySchema>;
export type TokenSearchResultEntry = z.infer<typeof tokenSearchResultEntrySchema>;
export type CategoryEntry = z.infer<typeof categoryEntrySchema>;
export type TickerResult = z.infer<typeof tickerResultSchema>;
export type KlineEntry = z.infer<typeof klineEntrySchema>;
export type OrderBookResult = z.infer<typeof orderBookResultSchema>;
export type FundingRateEntry = z.infer<typeof fundingRateEntrySchema>;

// ── Research output types ────────────────────────────────────────────────────
export type ContractSecurityResult = z.infer<typeof contractSecurityResultSchema>;
export type TokenDueDiligenceResult = z.infer<typeof tokenDueDiligenceResultSchema>;
export type TokenHolderEntry = z.infer<typeof tokenHolderEntrySchema>;
export type YieldPoolEntry = z.infer<typeof yieldPoolEntrySchema>;
export type YieldComparisonEntry = z.infer<typeof yieldComparisonEntrySchema>;
export type ProtocolInfoResult = z.infer<typeof protocolInfoResultSchema>;
export type TokenUnlockEntry = z.infer<typeof tokenUnlockEntrySchema>;
export type HackEntry = z.infer<typeof hackEntrySchema>;
export type FundRaiseEntry = z.infer<typeof fundRaiseEntrySchema>;
export type WhaleTransferEntry = z.infer<typeof whaleTransferEntrySchema>;
export type GovernanceProposalEntry = z.infer<typeof governanceProposalEntrySchema>;
export type NewsEntry = z.infer<typeof newsEntrySchema>;
export type AirdropEntry = z.infer<typeof airdropEntrySchema>;

export interface SwapStatusResult {
  provider: "orbs";
  status: Record<string, unknown>;
}

export interface SwapHistoryEntry {
  id: string;
  provider: "orbs" | "lifi";
  status: "pending_confirmation" | "confirmed" | "denied" | "expired";
  walletAddress?: string;
  description: string;
  timestamp: string;
}

export interface SwapHistoryResult {
  walletAddress?: string;
  entries: SwapHistoryEntry[];
}

export interface ListOrdersResult {
  count: number;
  orders: Array<{
    id: string;
    type: string;
    status: string;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    progress?: unknown;
    createdAt?: string;
  }>;
}

export type RootResolveTokenResult = ResolvedToken;

export type ExplorerAddressInfo = z.infer<typeof explorerAddressInfoSchema>;
export type ExplorerTokenHolding = z.infer<typeof explorerTokenHoldingSchema>;
export type ExplorerTokensByAddress = z.infer<typeof explorerTokensByAddressSchema>;
export type ExplorerTransaction = z.infer<typeof explorerTransactionSchema>;
export type ExplorerTxHistory = z.infer<typeof explorerTxHistorySchema>;
export type ExplorerTxDetails = z.infer<typeof explorerTxDetailsSchema>;
export type ExplorerTxReceipt = z.infer<typeof explorerTxReceiptSchema>;
export type ExplorerTokenTransfer = z.infer<typeof explorerTokenTransferSchema>;
export type ExplorerTokenTransfers = z.infer<typeof explorerTokenTransfersSchema>;
export type ExplorerNftItem = z.infer<typeof explorerNftItemSchema>;
export type ExplorerNftInventory = z.infer<typeof explorerNftInventorySchema>;
export type ExplorerContractAbi = z.infer<typeof explorerContractAbiSchema>;
export type ExplorerContractSource = z.infer<typeof explorerContractSourceSchema>;
export type ExplorerBlockInfo = z.infer<typeof explorerBlockInfoSchema>;
export type ExplorerHistoricalBalance = z.infer<typeof explorerHistoricalBalanceSchema>;
export type ExplorerInternalTx = z.infer<typeof explorerInternalTxSchema>;
export type ExplorerInternalTxs = z.infer<typeof explorerInternalTxsSchema>;
export type ExplorerTxExecutionStatus = z.infer<typeof explorerTxExecutionStatusSchema>;
export type ExplorerTokenInfo = z.infer<typeof explorerTokenInfoSchema>;
export type ExplorerTokenSupply = z.infer<typeof explorerTokenSupplySchema>;
export type ExplorerTokenHolder = z.infer<typeof explorerTokenHolderSchema>;
export type ExplorerTokenHolders = z.infer<typeof explorerTokenHoldersSchema>;
export type ExplorerBlockByTimestamp = z.infer<typeof explorerBlockByTimestampSchema>;
export type ExplorerBlockRewardUncle = z.infer<typeof explorerBlockRewardUncleSchema>;
export type ExplorerBlockRewards = z.infer<typeof explorerBlockRewardsSchema>;
export type ExplorerContractCreator = z.infer<typeof explorerContractCreatorSchema>;
export type ExplorerContractCode = z.infer<typeof explorerContractCodeSchema>;
export type ExplorerEventLog = z.infer<typeof explorerEventLogSchema>;
export type ExplorerEventLogs = z.infer<typeof explorerEventLogsSchema>;
export type ExplorerDailyStat = z.infer<typeof explorerDailyStatSchema>;
export type ExplorerDailyStats = z.infer<typeof explorerDailyStatsSchema>;
export type ExplorerNativePrice = z.infer<typeof explorerNativePriceSchema>;
export type ExplorerHistoricalPriceEntry = z.infer<typeof explorerHistoricalPriceEntrySchema>;
export type ExplorerHistoricalPrice = z.infer<typeof explorerHistoricalPriceSchema>;
export type ExplorerNativeSupply = z.infer<typeof explorerNativeSupplySchema>;

export type GetProtocolTvlInput = z.infer<typeof marketGetProtocolTvlSchema>;
export type GetTopProtocolsInput = z.infer<typeof marketGetTopProtocolsSchema>;
export type GetChainTvlInput = z.infer<typeof marketGetChainTvlSchema>;
export type GetTokenPriceInput = z.infer<typeof marketGetTokenPriceSchema>;
export type GetTokenHistoryInput = z.infer<typeof marketGetTokenHistorySchema>;
export type GetGainersLosersInput = z.infer<typeof marketGetGainersLosersSchema>;
export type GetDexVolumeInput = z.infer<typeof marketGetDexVolumeSchema>;
export type GetStablecoinStatsInput = z.infer<typeof marketGetStablecoinStatsSchema>;
export type GetGlobalStatsInput = z.infer<typeof marketGetGlobalStatsSchema>;
export type GetCexFundFlowsInput = z.infer<typeof marketGetCexFundFlowsSchema>;
export type GetExchangeRankingsInput = z.infer<typeof marketGetExchangeRankingsSchema>;
export type GetSentimentInput = z.infer<typeof marketGetSentimentSchema>;
export type GetTrendingInput = z.infer<typeof marketGetTrendingSchema>;
export type GetTopTokensInput = z.infer<typeof marketGetTopTokensSchema>;
export type SearchTokenInput = z.infer<typeof marketSearchTokenSchema>;
export type GetCategoriesInput = z.infer<typeof marketGetCategoriesSchema>;
export type GetTickerInput = z.infer<typeof marketGetTickerSchema>;
export type GetKlinesInput = z.infer<typeof marketGetKlinesSchema>;
export type GetOrderBookInput = z.infer<typeof marketGetOrderBookSchema>;
export type GetFundingRatesInput = z.infer<typeof marketGetFundingRatesSchema>;

export type GetContractSecurityInput = z.infer<typeof researchContractSecuritySchema>;
export type GetTokenDueDiligenceInput = z.infer<typeof researchTokenDueDiligenceSchema>;
export type GetTokenHoldersInput = z.infer<typeof researchTokenHoldersSchema>;
export type GetYieldOpportunitiesInput = z.infer<typeof researchYieldOpportunitiesSchema>;
export type GetCompareYieldsInput = z.infer<typeof researchCompareYieldsSchema>;
export type GetProtocolInfoInput = z.infer<typeof researchProtocolInfoSchema>;
export type GetTokenUnlocksInput = z.infer<typeof researchTokenUnlocksSchema>;
export type GetHackHistoryInput = z.infer<typeof researchHackHistorySchema>;
export type GetFundRaisesInput = z.infer<typeof researchFundRaisesSchema>;
export type GetWhaleTransfersInput = z.infer<typeof researchWhaleTransfersSchema>;
export type GetGovernanceInput = z.infer<typeof researchGovernanceSchema>;
export type GetNewsInput = z.infer<typeof researchNewsSchema>;
export type GetAirdropsInput = z.infer<typeof researchAirdropsSchema>;

export type {
  CallToolResult,
  CreateRuntimeOptions,
  RuntimeHealth,
  RuntimeToolListener,
  ToolCatalogEntry,
  ToolCategory,
  ToolErrorPayload,
  ToolResultError,
  ToolResultPayload,
  ToolSource,
  ToolSuccessPayload,
  Web3AgentRuntime,
  RuntimeConfig,
  WalletState,
};
