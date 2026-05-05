import type { WalletBackend } from "./backend.js";
import {
  activateWalletInternal,
  deactivateWalletInternal,
  getActiveAccountInternal,
  getPersistedKeyForSubprocessInternal,
  getWalletStateInternal,
  initializeWalletInternal,
} from "./persistence-internal.js";

export class LegacyWalletBackend implements WalletBackend {
  readonly info = {
    type: "legacy",
    reason: "OWS wallet backend unavailable; using legacy persistence fallback",
  } as const;

  async initialize(config: {
    chainId: number;
    accountIndex: number;
    addressIndex: number;
    privateKey?: string;
    mnemonic?: string;
  }): Promise<void> {
    await initializeWalletInternal(config);
  }

  getState() {
    return getWalletStateInternal();
  }

  getAccount() {
    return getActiveAccountInternal();
  }

  async activate(params: {
    privateKey?: string;
    mnemonic?: string;
    accountIndex?: number;
    addressIndex?: number;
  }) {
    return activateWalletInternal(params);
  }

  async deactivate(): Promise<void> {
    await deactivateWalletInternal();
  }

  async getKeyForSubprocess(): Promise<string | null> {
    return getPersistedKeyForSubprocessInternal();
  }
}
