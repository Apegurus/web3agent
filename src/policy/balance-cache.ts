import { createPublicClient } from "viem";
import type { Address } from "viem";
import { getChainById } from "../chains/registry.js";
import { getTransportForChain } from "../config/wallet-factory.js";
import { resilientFetch } from "../utils/resilient-fetch.js";

let cachedBalanceUsd: number | null = null;

export function getCachedBalanceUsd(): number | null {
  return cachedBalanceUsd;
}

export async function refreshBalanceUsd(address: string, chainId: number): Promise<number | null> {
  try {
    const chain = getChainById(chainId);
    if (!chain) return null;

    const transport = getTransportForChain(chainId);
    const client = createPublicClient({ chain, transport });
    const balanceWei = await client.getBalance({ address: address as Address });
    const decimals = chain.nativeCurrency?.decimals ?? 18;
    const balanceNative = Number(balanceWei) / 10 ** decimals;

    if (balanceNative === 0) {
      cachedBalanceUsd = 0;
      return 0;
    }

    const nativeSymbol = chain.nativeCurrency?.symbol?.toLowerCase() ?? "eth";
    const priceUsd = await fetchNativeTokenPrice(nativeSymbol);
    if (priceUsd === null) {
      cachedBalanceUsd = null;
      return null;
    }

    cachedBalanceUsd = balanceNative * priceUsd;
    return cachedBalanceUsd;
  } catch (e: unknown) {
    process.stderr.write(`[policy] Failed to refresh wallet balance: ${e}\n`);
    cachedBalanceUsd = null;
    return null;
  }
}

const COINGECKO_SYMBOL_MAP: Record<string, string> = {
  eth: "ethereum",
  matic: "matic-network",
  pol: "matic-network",
  bnb: "binancecoin",
  avax: "avalanche-2",
  ftm: "fantom",
  op: "optimism",
  arb: "arbitrum",
};

async function fetchNativeTokenPrice(symbol: string): Promise<number | null> {
  const coinId = COINGECKO_SYMBOL_MAP[symbol] ?? symbol;
  try {
    const response = await resilientFetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      undefined,
      { label: "coingecko-price", retry: { maxRetries: 1 } }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, { usd?: number }>;
    return data[coinId]?.usd ?? null;
  } catch (e: unknown) {
    process.stderr.write(`[policy] Native token price fetch failed for ${symbol}: ${e}\n`);
    return null;
  }
}

export function resetBalanceCache(): void {
  cachedBalanceUsd = null;
}
