import type { Account } from "viem";
import type { WalletMode, WalletState } from "../types/wallet.js";
import { NO_WALLET_BACKEND_SELECTED_MESSAGE, getWalletBackend } from "./backend-selector.js";
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

function isNoBackendSelectedError(error: unknown): boolean {
  return error instanceof Error && error.message === NO_WALLET_BACKEND_SELECTED_MESSAGE;
}

function getSelectedWalletBackendOrNull() {
  try {
    return getWalletBackend();
  } catch (error: unknown) {
    if (isNoBackendSelectedError(error)) {
      return null;
    }
    throw error;
  }
}

export function getWalletState(): WalletState {
  const backend = getSelectedWalletBackendOrNull();
  return backend ? backend.getState() : getWalletStateInternal();
}

export function getActiveAccount(): Account {
  const backend = getSelectedWalletBackendOrNull();
  return backend ? backend.getAccount() : getActiveAccountInternal();
}

export async function initializeWallet(config: {
  chainId: number;
  accountIndex: number;
  addressIndex: number;
  privateKey?: string;
  mnemonic?: string;
}): Promise<void> {
  const backend = getSelectedWalletBackendOrNull();
  if (backend) {
    await backend.initialize(config);
    return;
  }
  await initializeWalletInternal(config);
}

export async function activateWallet(params: {
  privateKey?: string;
  mnemonic?: string;
  accountIndex?: number;
  addressIndex?: number;
}): Promise<WalletState> {
  const backend = getSelectedWalletBackendOrNull();
  return backend ? backend.activate(params) : activateWalletInternal(params);
}

export async function getPersistedKeyForSubprocess(): Promise<string | null> {
  const backend = getSelectedWalletBackendOrNull();
  return backend ? backend.getKeyForSubprocess() : getPersistedKeyForSubprocessInternal();
}

export async function deactivateWallet(): Promise<void> {
  const backend = getSelectedWalletBackendOrNull();
  if (backend) {
    await backend.deactivate();
    return;
  }
  await deactivateWalletInternal();
}

export function hasPersistedWalletKey(): boolean {
  return hasPersistedWalletKeyInternal();
}
