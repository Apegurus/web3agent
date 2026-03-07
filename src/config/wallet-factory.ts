import { http, createWalletClient } from "viem";
import type { Account, WalletClient } from "viem";
import { getChainById } from "../chains/registry.js";
import { getConfig } from "./env.js";

export function createWalletClientForChain(account: Account, chainId: number): WalletClient {
  const chain = getChainById(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  const config = getConfig();
  const transport = config.rpcUrl && chainId === config.chainId ? http(config.rpcUrl) : http();
  return createWalletClient({ account, chain, transport });
}
