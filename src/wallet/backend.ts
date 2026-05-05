import type { Account } from "viem";
import type { WalletState } from "../types/wallet.js";

export type WalletCredential = string | undefined;

export interface WalletBackendInfo {
  readonly type: "ows" | "legacy";
  readonly reason: string;
}

export interface WalletBackend {
  readonly info: WalletBackendInfo;
  initialize(config: {
    chainId: number;
    accountIndex: number;
    addressIndex: number;
    privateKey?: string;
    mnemonic?: string;
  }): Promise<void>;
  getState(): WalletState;
  getAccount(): Account;
  activate(params: {
    privateKey?: string;
    mnemonic?: string;
    accountIndex?: number;
    addressIndex?: number;
  }): Promise<WalletState>;
  deactivate(): Promise<void>;
  getKeyForSubprocess(): Promise<string | null>;
}
