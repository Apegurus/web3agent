import { EVM, createConfig } from "@lifi/sdk";
import { getConfig } from "../config/env.js";
import { createWalletClientForChain } from "../config/wallet-factory.js";
import { getActiveAccount, getWalletState } from "../wallet/persistence.js";

let isConfigured = false;
let configuredApiKey: string | undefined;

export function initializeLifi(apiKey?: string): void {
  if (isConfigured && (configuredApiKey === apiKey || configuredApiKey !== undefined || !apiKey)) {
    return;
  }

  createConfig({
    integrator: "web3agent",
    ...(apiKey ? { apiKey } : {}),
    providers: [
      EVM({
        getWalletClient: async () => {
          const account = getActiveAccount();
          const walletState = getWalletState();
          // Return fresh wallet client for current default chain
          // biome-ignore lint/suspicious/noExplicitAny: LI.FI SDK expects loosely typed WalletClient
          return createWalletClientForChain(account, walletState.chainId) as any;
        },
        switchChain: async (chainId: number) => {
          // MUST create fresh wallet client — never reuse across chains
          const account = getActiveAccount();
          // biome-ignore lint/suspicious/noExplicitAny: LI.FI SDK expects loosely typed WalletClient
          return createWalletClientForChain(account, chainId) as any;
        },
      }),
    ],
  });

  isConfigured = true;
  configuredApiKey = apiKey;
}

export function ensureLifiInitialized(): void {
  try {
    initializeLifi(getConfig().lifiApiKey);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "Config not initialized — call setConfig() during startup"
    ) {
      initializeLifi();
      return;
    }

    throw error;
  }
}
