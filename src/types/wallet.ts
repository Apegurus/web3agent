export type WalletMode = "private-key" | "mnemonic" | "read-only";

export interface WalletState {
  mode: WalletMode;
  address?: string;
  chainId: number;
  accountIndex: number;
  addressIndex: number;
}

export interface PendingOperation {
  id: string;
  type: string;
  description: string;
  params: Record<string, unknown>;
  createdAt: Date;
  ttlMs: number;
}

export interface ConfirmationQueue {
  operations: Map<string, PendingOperation>;
  enabled: boolean;
}
