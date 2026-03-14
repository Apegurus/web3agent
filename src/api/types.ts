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
import type { lifiExecuteBridgeSchema, lifiGetQuoteSchema } from "../tools/lifi/schemas.js";
import type { lifiPrepareBridgeIntentSchema } from "../tools/lifi/schemas.js";
import type {
  orbsGetQuoteSchema,
  orbsGetRequiredApprovalsSchema,
  orbsListOrdersSchema,
  orbsPlaceLimitSchema,
  orbsPlaceTwapSchema,
  orbsPrepareLimitIntentSchema,
  orbsPrepareSwapIntentSchema,
  orbsPrepareTwapIntentSchema,
  orbsSubmitSignedSwapSchema,
  orbsSubmitSignedTwapOrderSchema,
  orbsSwapSchema,
  orbsSwapStatusSchema,
} from "../tools/orbs/schemas.js";
import type { listChainTokensSchema, resolveTokenSchema } from "../tools/tokens/schemas.js";
import type {
  transactionConfirmSchema,
  transactionDenySchema,
  transactionSimulateSchema,
  walletActivateSchema,
  walletDeriveAddressesSchema,
  walletFromMnemonicSchema,
  walletSetConfirmationSchema,
} from "../tools/wallet/schemas.js";
import type { RuntimeConfig } from "../types/config.js";
import type { WalletState } from "../types/wallet.js";

export type ResolveTokenInput = z.infer<typeof resolveTokenSchema>;
export type ListChainTokensInput = z.infer<typeof listChainTokensSchema>;
export type LifiQuoteInput = z.infer<typeof lifiGetQuoteSchema>;
export type ExecuteBridgeInput = z.infer<typeof lifiExecuteBridgeSchema>;
export type PrepareBridgeIntentInput = z.infer<typeof lifiPrepareBridgeIntentSchema>;
export type OrbsQuoteInput = z.infer<typeof orbsGetQuoteSchema>;
export type ExecuteSameChainSwapInput = z.infer<typeof orbsSwapSchema>;
export type PrepareSwapIntentInput = z.infer<typeof orbsPrepareSwapIntentSchema>;
export type GetRequiredApprovalsInput = z.infer<typeof orbsGetRequiredApprovalsSchema>;
export type PlaceTwapOrderInput = z.infer<typeof orbsPlaceTwapSchema>;
export type PlaceLimitOrderInput = z.infer<typeof orbsPlaceLimitSchema>;
export type PrepareTwapIntentInput = z.infer<typeof orbsPrepareTwapIntentSchema>;
export type PrepareLimitIntentInput = z.infer<typeof orbsPrepareLimitIntentSchema>;
export type SubmitSignedSwapInput = z.infer<typeof orbsSubmitSignedSwapSchema>;
export type SubmitSignedTwapOrderInput = z.infer<typeof orbsSubmitSignedTwapOrderSchema>;
export type SwapStatusInput = z.infer<typeof orbsSwapStatusSchema>;
export type ListOrdersInput = z.infer<typeof orbsListOrdersSchema>;
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
  eip712: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  };
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
  eip712: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  };
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
  eip712: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  };
  order: Record<string, unknown>;
  chainId: number;
  meta: {
    expirySeconds: number;
    dstMinAmount: string;
  };
}

export interface BridgeTxStep {
  type: "approval" | "bridge";
  label: string;
  tx: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    chainId: number;
    gasLimit?: string;
  };
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
