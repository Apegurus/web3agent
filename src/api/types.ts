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
import type { RuntimeConfig } from "../types/config.js";
import type { WalletState } from "../types/wallet.js";
import type {
  lifiExecuteBridgeSchema,
  lifiGetQuoteSchema,
  lifiPrepareBridgeIntentSchema,
  listChainTokensSchema,
  operationActionResultSchema,
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
  approvalStepSchema,
  balanceChangeSchema,
  bridgeIntentSchema,
  bridgeTxStepSchema,
  crossChainSwapQuoteResultSchema,
  crossChainSwapQuoteSummarySchema,
  limitIntentSchema,
  preparedOperationSchema,
  sameChainSwapQuoteResultSchema,
  simulationResultSchema,
  spotOrderIntentSchema,
  swapIntentSchema,
  swapQuoteResultSchema,
  swapSubmissionResultSchema,
  tokenSwappableResultSchema,
  twapIntentSchema,
} from "./schemas/outputs.js";

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

export interface OperationResumeState {
  version: 1;
  integration: PreparedOperationIntegration;
  kind: string;
  state: Record<string, unknown>;
}

export type PreparedOperation = z.infer<typeof preparedOperationSchema>;

export interface OperationTransactionResult {
  type: "transaction";
  txHash: string;
  status: "confirmed";
}

export interface OperationSignatureResult {
  type: "signature";
  signature: string;
}

export interface OperationMessageSignatureResult {
  type: "messageSignature";
  signature: string;
}

export type OperationActionResult = z.infer<typeof operationActionResultSchema>;
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
