import { AsyncLocalStorage } from "node:async_hooks";
import { EVM, createConfig } from "@lifi/sdk";
import type { Address } from "viem";
import { Web3AgentError } from "../api/errors.js";
import { tryGetConfig } from "../config/env.js";
import { createWalletClientForChain } from "../config/wallet-factory.js";
import { getActiveAccount, getWalletState } from "../wallet/persistence.js";

let isConfigured = false;
let configuredApiKey: string | undefined;
const executionAccountContext = new AsyncLocalStorage<Address>();

export function withLifiExecutionAccount<T>(
  account: Address,
  execute: () => Promise<T>
): Promise<T> {
  return executionAccountContext.run(account, execute);
}

function getExecutionAccount() {
  const account = getActiveAccount();
  const expected = executionAccountContext.getStore();
  if (expected && account.address.toLowerCase() !== expected.toLowerCase()) {
    throw new Web3AgentError({
      code: "LIFI_WALLET_MISMATCH",
      message: `LI.FI execution was confirmed for wallet ${expected} but active wallet is ${account.address}`,
    });
  }
  return account;
}

export function initializeLifi(apiKey?: string): void {
  if (isConfigured && (configuredApiKey === apiKey || !apiKey)) {
    return;
  }

  createConfig({
    integrator: "web3agent",
    ...(apiKey ? { apiKey } : {}),
    providers: [
      EVM({
        getWalletClient: async () => {
          const account = getExecutionAccount();
          const walletState = getWalletState();
          // Return fresh wallet client for current default chain
          // biome-ignore lint/suspicious/noExplicitAny: LI.FI SDK expects loosely typed WalletClient
          return createWalletClientForChain(account, walletState.chainId) as any;
        },
        switchChain: async (chainId: number) => {
          // MUST create fresh wallet client — never reuse across chains
          const account = getExecutionAccount();
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
  initializeLifi(tryGetConfig()?.lifiApiKey);
}
