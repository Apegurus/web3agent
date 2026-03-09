import { http, createWalletClient } from "viem";
import type { Account, HttpTransport, WalletClient } from "viem";
import { getChainById } from "../chains/registry.js";
import { getConfig } from "./env.js";

const RELIABLE_FALLBACK_RPCS: Record<number, string> = {
  56: "https://bsc-dataseed.bnbchain.org",
};

export function getTransportForChain(chainId: number): HttpTransport {
  const config = getConfig();
  const perChainUrl = config.chainRpcUrls[chainId];
  if (perChainUrl) return http(perChainUrl);
  if (config.rpcUrl && chainId === config.chainId) return http(config.rpcUrl);
  const fallback = RELIABLE_FALLBACK_RPCS[chainId];
  if (fallback) return http(fallback);
  return http();
}

export function createWalletClientForChain(account: Account, chainId: number): WalletClient {
  const chain = getChainById(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return createWalletClient({ account, chain, transport: getTransportForChain(chainId) });
}
