import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RiskLevel } from "../policy/types.js";

export type WalletMode = "private-key" | "mnemonic" | "read-only";

export interface WalletState {
  mode: WalletMode;
  address?: string;
  chainId: number;
  accountIndex: number;
  addressIndex: number;
}

export type OperationExecutor = (params: Record<string, unknown>) => Promise<CallToolResult>;

export interface PendingOperation {
  id: string;
  type: string;
  description: string;
  params: Record<string, unknown>;
  executor: OperationExecutor;
  createdAt: Date;
  ttlMs: number;
  walletAddress?: string;
  riskLevel?: RiskLevel;
}

export interface ConfirmationQueue {
  operations: Map<string, PendingOperation>;
  enabled: boolean;
}
