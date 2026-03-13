import { http, createWalletClient } from "viem";
import type { Account, HttpTransport, WalletClient } from "viem";
import { getChainById } from "../chains/registry.js";
import type { RuntimeConfig } from "../types/config.js";
import { getConfig } from "./env.js";

const RELIABLE_FALLBACK_RPCS: Record<number, string> = {
  56: "https://bsc-dataseed.bnbchain.org",
};

export function getTransportForChain(chainId: number, config?: RuntimeConfig): HttpTransport {
  const resolvedConfig = config ?? getConfig();
  const perChainUrl = resolvedConfig.chainRpcUrls[chainId];
  if (perChainUrl) return http(perChainUrl);
  if (resolvedConfig.rpcUrl && chainId === resolvedConfig.chainId) {
    return http(resolvedConfig.rpcUrl);
  }
  const fallback = RELIABLE_FALLBACK_RPCS[chainId];
  if (fallback) return http(fallback);
  return http();
}

export function createWalletClientForChain(
  account: Account,
  chainId: number,
  config?: RuntimeConfig
): WalletClient {
  const chain = getChainById(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return createWalletClient({ account, chain, transport: getTransportForChain(chainId, config) });
}
