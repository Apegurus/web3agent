import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Chain } from "viem";
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

export interface ResolveTokenInput {
  symbol: string;
  chainId: number;
}

export interface ListChainTokensInput {
  chainId: number;
}

export interface LifiQuoteInput {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
}

export type ExecuteBridgeInput = LifiQuoteInput;

export interface PrepareBridgeIntentInput extends LifiQuoteInput {
  account: string;
}

export interface OrbsQuoteInput {
  chainId: number;
  fromToken: string;
  toToken: string;
  inAmount: string;
  slippage?: number;
}

export type ExecuteSameChainSwapInput = OrbsQuoteInput;

export interface PrepareSwapIntentInput extends OrbsQuoteInput {
  account: string;
}

export interface GetRequiredApprovalsInput {
  chainId: number;
  fromToken: string;
  inAmount: string;
  account: string;
}

export interface PlaceTwapOrderInput {
  chainId: number;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  chunks: number;
  fillDelay: number;
}

export interface PrepareTwapIntentInput extends PlaceTwapOrderInput {
  account: string;
}

export interface PlaceLimitOrderInput {
  chainId: number;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstMinAmount: string;
  expiry?: number;
}

export interface PrepareLimitIntentInput extends PlaceLimitOrderInput {
  account: string;
}

export interface SubmitSignedSwapInput {
  chainId: number;
  quote: Record<string, unknown>;
  signature: string;
}

export interface SubmitSignedTwapOrderInput {
  order: Record<string, unknown>;
  signature: {
    v: number;
    r: string;
    s: string;
  };
}

export interface SwapStatusInput {
  chainId: number;
  sessionId: string;
  user: string;
  maxAttempts?: number;
}

export interface ListOrdersInput {
  chainId: number;
}

export interface WalletActivateInput {
  privateKey?: string;
  mnemonic?: string;
  accountIndex?: number;
  addressIndex?: number;
}

export interface WalletSetConfirmationInput {
  enabled: boolean;
}

export interface WalletFromMnemonicInput {
  mnemonic: string;
  accountIndex?: number;
  addressIndex?: number;
}

export interface WalletDeriveAddressesInput {
  mnemonic: string;
  count?: number;
}

export interface TransactionConfirmInput {
  id: string;
}

export type TransactionDenyInput = TransactionConfirmInput;

export interface SimulateTransactionInput {
  chainId: number;
  to: string;
  data: string;
  value?: string;
  from: string;
}

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

export interface TypedDataPayload {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface ApprovalStep {
  type: "wrap" | "approve";
  label: string;
  tx: {
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: string;
  };
}

export interface SwapIntent {
  eip712: TypedDataPayload;
  quote: {
    sessionId: string;
    inToken: string;
    outToken: string;
    inAmount: string;
    outAmount: string;
    minAmountOut: string;
    user: string;
    [key: string]: unknown;
  };
  requiredApprovals: ApprovalStep[];
  chainId: number;
}

export interface TwapIntent {
  eip712: TypedDataPayload;
  order: Record<string, unknown>;
  chainId: number;
  meta: {
    chunks: number;
    fillDelaySeconds: number;
    durationSeconds: number;
    srcAmountPerChunk: string;
  };
}

export interface LimitIntent {
  eip712: TypedDataPayload;
  order: Record<string, unknown>;
  chainId: number;
  meta: {
    expirySeconds: number;
    dstMinAmount: string;
  };
}

export interface PreparedTransactionRequest {
  to: `0x${string}`;
  chainId: number;
  data?: `0x${string}`;
  value?: string;
  gasLimit?: string;
}

export interface PreparedTransactionAction {
  id: string;
  type: "transaction";
  label: string;
  tx: PreparedTransactionRequest;
}

export interface PreparedSignTypedDataAction {
  id: string;
  type: "signTypedData";
  label: string;
  chainId: number;
  eip712: TypedDataPayload;
}

export interface PreparedSignMessageAction {
  id: string;
  type: "signMessage";
  label: string;
  chainId: number;
  message: string;
}

export type PreparedAction =
  | PreparedTransactionAction
  | PreparedSignTypedDataAction
  | PreparedSignMessageAction;

export type PreparedOperationIntegration = "orbs" | "lifi" | "goat";

export interface OperationResumeState {
  version: 1;
  integration: PreparedOperationIntegration;
  kind: string;
  state: Record<string, unknown>;
}

export interface PreparedOperation {
  integration: PreparedOperationIntegration;
  kind: string;
  summary: string;
  actions: PreparedAction[];
  resumeState: OperationResumeState;
  meta?: Record<string, unknown>;
}

export interface OperationTransactionResult {
  type: "transaction";
  txHash: string;
}

export interface OperationSignatureResult {
  type: "signature";
  signature: string;
}

export interface OperationMessageSignatureResult {
  type: "messageSignature";
  signature: string;
}

export type OperationActionResult =
  | OperationTransactionResult
  | OperationSignatureResult
  | OperationMessageSignatureResult;

export interface OrbsSwapOperationInput {
  integration: "orbs";
  kind: "swap";
  chainId: number;
  fromToken: string;
  toToken: string;
  inAmount: string;
  slippage?: number;
  account: string;
}

export interface OrbsTwapOperationInput {
  integration: "orbs";
  kind: "twap";
  chainId: number;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  chunks: number;
  fillDelay: number;
  account: string;
}

export interface OrbsLimitOperationInput {
  integration: "orbs";
  kind: "limit";
  chainId: number;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstMinAmount: string;
  expiry?: number;
  account: string;
}

export interface LifiBridgeOperationInput {
  integration: "lifi";
  kind: "bridge";
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
  account: string;
}

export interface GoatToolOperationInput {
  integration: "goat";
  kind: "tool";
  toolName: string;
  params?: Record<string, unknown>;
  chainId: number;
  account: string;
}

export type PrepareOperationInput =
  | OrbsSwapOperationInput
  | OrbsTwapOperationInput
  | OrbsLimitOperationInput
  | LifiBridgeOperationInput
  | GoatToolOperationInput;

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

export interface BridgeTxStep {
  type: "approval" | "bridge";
  label: string;
  tx: PreparedTransactionRequest;
}

export interface BridgeIntent {
  steps: BridgeTxStep[];
  estimate: {
    fromToken: string;
    toToken: string;
    fromAmount: string;
    fromAmountUSD?: string;
    toAmount: string;
    toAmountUSD?: string;
    toAmountMin: string;
    gasCostUSD?: string;
    estimatedDurationSeconds?: number;
  };
  fromChainId: number;
  toChainId: number;
}

export interface BalanceChange {
  token: `0x${string}`;
  symbol: string | null;
  decimals: number | null;
  amount: string;
  direction: "in" | "out";
}

export interface SimulationResult {
  success: boolean;
  gasEstimate: string;
  error?: string;
  balanceChanges: BalanceChange[];
}

export interface SwapSubmissionResult {
  sessionId: string;
  txHash?: string;
  status: "submitted" | "completed" | "failed";
  error?: string;
}

export interface TwapOrderResult {
  orderId: string;
  status: string;
  txHash?: string;
}

export interface CompletedOperationResult {
  status?: string;
  message?: string;
  txHash?: string;
  [key: string]: unknown;
}

export type WriteOperationResult = PendingConfirmationResult | CompletedOperationResult;

export interface SameChainSwapQuoteResult {
  kind: "same-chain";
  provider: "orbs";
  chainId: number;
  quote: Record<string, unknown>;
}

export interface CrossChainSwapQuoteSummary {
  fromChainId: number;
  toChainId: number;
  fromToken?: string;
  toToken?: string;
  fromAmount: string;
  fromAmountUSD?: string;
  toAmount?: string;
  toAmountUSD?: string;
  toAmountMin?: string;
  gasCostUSD?: string;
  estimatedDurationSeconds?: number;
  includedSteps?: Array<{ type?: string; tool?: string }>;
}

export interface CrossChainSwapQuoteResult {
  kind: "cross-chain";
  provider: "lifi";
  quote: CrossChainSwapQuoteSummary;
}

export type SwapQuoteResult = SameChainSwapQuoteResult | CrossChainSwapQuoteResult;

export interface TokenSwappableResult {
  swappable: boolean;
  provider: "orbs" | "lifi";
  kind: "same-chain" | "cross-chain";
  reason?: string;
}

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
    srcToken: string;
    dstToken: string;
    srcAmount: string;
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
