import { createPublicClient } from "viem";
import type { Account, PublicClient } from "viem";
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

export class ChainAccess {
  constructor(private readonly config?: RuntimeConfig) {}

  getChain(chainId: number) {
    return assertChainSupported(chainId);
  }

  getConfig(chainId: number): RuntimeConfig {
    return resolveRuntimeConfig(chainId, this.config);
  }

  getTransport(chainId: number) {
    return getTransportForChain(chainId, this.getConfig(chainId));
  }

  getRpcUrl(chainId: number): string | undefined {
    const config = this.getConfig(chainId);
    return config.chainRpcUrls[chainId] ?? (config.chainId === chainId ? config.rpcUrl : undefined);
  }

  createPublicClient(chainId: number): PublicClient {
    return createPublicClient({
      chain: this.getChain(chainId),
      transport: this.getTransport(chainId),
    });
  }

  createWalletClient(account: Account, chainId: number) {
    return createWalletClientForChain(account, chainId, this.getConfig(chainId));
  }
}
