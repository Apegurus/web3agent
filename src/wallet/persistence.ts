import type { Account } from "viem";
import type { WalletMode, WalletState } from "../types/wallet.js";
import {
  activateWalletInternal,
  deactivateWalletInternal,
  getActiveAccountInternal,
  getPersistedKeyForSubprocessInternal,
  getWalletStateInternal,
  hasPersistedWalletKeyInternal,
  initializeWalletInternal,
} from "./persistence-internal.js";

export type { WalletMode };

export function getWalletState(): WalletState {
  return getWalletStateInternal();
}

export function getActiveAccount(): Account {
  return getActiveAccountInternal();
}

export async function initializeWallet(config: {
  chainId: number;
  accountIndex: number;
  addressIndex: number;
  privateKey?: string;
  mnemonic?: string;
}): Promise<void> {
  await initializeWalletInternal(config);
}

export async function activateWallet(params: {
  privateKey?: string;
  mnemonic?: string;
  accountIndex?: number;
  addressIndex?: number;
}): Promise<WalletState> {
  return activateWalletInternal(params);
}

export async function getPersistedKeyForSubprocess(): Promise<string | null> {
  return getPersistedKeyForSubprocessInternal();
}

export async function deactivateWallet(): Promise<void> {
  await deactivateWalletInternal();
}

export function hasPersistedWalletKey(): boolean {
  return hasPersistedWalletKeyInternal();
}
