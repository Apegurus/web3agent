import type { Account, PublicClient } from "viem";
import { createPublicClient } from "viem";
import { getConfig, parseEnv } from "../config/env.js";
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

  try {
    return getConfig();
  } catch (error: unknown) {
    if (error instanceof Error) {
      return getFallbackProcessConfig(chainId);
    }
    throw error;
  }
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

export class ChainAccess {
  constructor(private readonly config?: RuntimeConfig) {}

  getChain(chainId: number) {
    return getChainForRuntime(chainId);
  }

  getConfig(chainId: number): RuntimeConfig {
    return getRuntimeConfigForChain(chainId, this.config);
  }

  getTransport(chainId: number) {
    return getTransportForRuntimeChain(chainId, this.config);
  }

  getRpcUrl(chainId: number): string | undefined {
    return getRpcUrlForRuntimeChain(chainId, this.config);
  }

  createPublicClient(chainId: number): PublicClient {
    return createPublicClientForRuntimeChain(chainId, this.config);
  }

  createWalletClient(account: Account, chainId: number) {
    return createWalletClientForRuntimeChain(account, chainId, this.config);
  }
}
