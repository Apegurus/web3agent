import type { Account, PublicClient } from "viem";
import { createPublicClient } from "viem";
import { parseEnv, tryGetConfig } from "../config/env.js";
import { createWalletClientForChain, getTransportForChain } from "../config/wallet-factory.js";
import type { RuntimeConfig } from "../types/config.js";
import { assertChainSupported } from "./validation.js";

function getFallbackProcessConfig(chainId: number): RuntimeConfig {
  return parseEnv({
    ...(process.env as Partial<Record<string, string>>),
    CHAIN_ID: String(chainId),
  });
}

export function resolveRuntimeConfig(chainId: number, config?: RuntimeConfig): RuntimeConfig {
  if (config) {
    return config;
  }

  return tryGetConfig() ?? getFallbackProcessConfig(chainId);
}

export function getChainForRuntime(chainId: number) {
  return assertChainSupported(chainId);
}

export function getRuntimeConfigForChain(chainId: number, config?: RuntimeConfig): RuntimeConfig {
  return resolveRuntimeConfig(chainId, config);
}

export function getTransportForRuntimeChain(chainId: number, config?: RuntimeConfig) {
  return getTransportForChain(chainId, getRuntimeConfigForChain(chainId, config));
}

export function getRpcUrlForRuntimeChain(
  chainId: number,
  config?: RuntimeConfig
): string | undefined {
  const resolvedConfig = getRuntimeConfigForChain(chainId, config);
  return (
    resolvedConfig.chainRpcUrls[chainId] ??
    (resolvedConfig.chainId === chainId ? resolvedConfig.rpcUrl : undefined)
  );
}

export function createPublicClientForRuntimeChain(
  chainId: number,
  config?: RuntimeConfig
): PublicClient {
  return createPublicClient({
    chain: getChainForRuntime(chainId),
    transport: getTransportForRuntimeChain(chainId, config),
  });
}

export function createWalletClientForRuntimeChain(
  account: Account,
  chainId: number,
  config?: RuntimeConfig
) {
  return createWalletClientForChain(account, chainId, getRuntimeConfigForChain(chainId, config));
}
