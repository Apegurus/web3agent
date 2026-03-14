import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { RuntimeConfig } from "../types/config.js";
import type { BackendStatus, HealthStatus } from "../types/health.js";
import type { WalletMode } from "../types/wallet.js";

export type ToolSource =
  | "wallet"
  | "transaction"
  | "utility"
  | "tokens"
  | "lifi"
  | "orbs"
  | "goat"
  | "blockscout"
  | "etherscan"
  | "evm"
  | "x402"
  | "acp"
  | "agdp"
  | "erc8004";

export type ToolCategory =
  | "wallet"
  | "transaction"
  | "status"
  | "tokens"
  | "swap"
  | "orders"
  | "onchain"
  | "explorer"
  | "agenticEconomy";

export interface ToolCatalogEntry {
  name: string;
  description: string;
  inputSchema: Tool["inputSchema"];
  source: ToolSource;
  category: ToolCategory;
  dynamic: boolean;
  annotations?: Tool["annotations"];
}

export interface ToolResultError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ToolSuccessPayload<T = unknown> {
  ok: true;
  data: T;
}

export interface ToolErrorPayload {
  ok: false;
  error: ToolResultError;
}

export type ToolResultPayload<T = unknown> = ToolSuccessPayload<T> | ToolErrorPayload;

export interface RuntimeHealth {
  activeChainId: number;
  walletMode: WalletMode;
  walletAddress?: string;
  confirmWrites: boolean;
  toolCount: number;
  backends: {
    blockscout: BackendStatus;
    etherscan: BackendStatus;
    evm: BackendStatus;
    goat: BackendStatus;
    lifi: BackendStatus;
    orbs: BackendStatus;
    agenticEconomy: BackendStatus;
  };
}

/**
 * Derive a {@link HealthStatus} from a {@link RuntimeHealth}, suitable for
 * `createStartupReport()`. This is the single source of truth for the `core`
 * degradation check so that `startup.ts` and `refreshHealthStatus()` never
 * diverge.
 */
export function toHealthStatus(health: RuntimeHealth): HealthStatus {
  const isDegraded = Object.values(health.backends).some(
    (backend) => backend.status !== "ok" && backend.status !== "not_configured"
  );
  return {
    core: isDegraded ? "degraded" : "ok",
    blockscout: health.backends.blockscout,
    etherscan: health.backends.etherscan,
    evm: health.backends.evm,
    goat: health.backends.goat,
    lifi: health.backends.lifi,
    orbs: health.backends.orbs,
    agenticEconomy: health.backends.agenticEconomy,
  };
}

export type RuntimeToolListener = () => void;

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

export interface WalletActiveResult {
  mode: string;
  chainId: number;
  address?: string;
}

export interface WalletDeactivationResult {
  mode: string;
  message: string;
}

export interface WalletConfirmationResult {
  confirmationRequired: boolean;
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

export interface TransactionConfirmResult {
  confirmed: true;
  id: string;
  [key: string]: unknown;
}

export interface TransactionDenyResult {
  denied: true;
  id: string;
  message: string;
}

export interface Web3AgentRuntime {
  readonly config: RuntimeConfig;
  listTools(): ToolCatalogEntry[];
  getTool(name: string): ToolCatalogEntry | undefined;
  invokeTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  getHealth(): RuntimeHealth;
  shutdown(): Promise<void>;
  wallet: {
    generate(): Promise<WalletGenerateResult>;
    generateMnemonic(): Promise<WalletGenerateMnemonicResult>;
    fromMnemonic(params: Record<string, unknown>): Promise<WalletAddressDerivationResult>;
    deriveAddresses(params: Record<string, unknown>): Promise<WalletDerivedAddressEntry[]>;
    getActive(): Promise<WalletActiveResult>;
    activate(params: Record<string, unknown>): Promise<WalletActiveResult>;
    deactivate(): Promise<WalletDeactivationResult>;
    setConfirmation(params: Record<string, unknown>): Promise<WalletConfirmationResult>;
  };
  transactions: {
    list(): Promise<TransactionListResult>;
    confirm(id: string): Promise<TransactionConfirmResult>;
    deny(id: string): Promise<TransactionDenyResult>;
  };
  status: {
    server(): Promise<RuntimeHealth>;
    supportedChains(): Promise<unknown>;
  };
}

export interface CreateRuntimeOptions {
  config?: RuntimeConfig;
  env?: Partial<Record<string, string>>;
}
