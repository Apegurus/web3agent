import { createPublicClient, formatUnits } from "viem";
import type { Address } from "viem";
import { getChainById } from "../chains/registry.js";
import { getTransportForChain } from "../config/wallet-factory.js";
import { resilientFetch } from "../utils/resilient-fetch.js";

export const BALANCE_CACHE_TTL_MS = 60_000;

interface BalanceCacheEntry {
  usd: number;
  updatedAt: number;
}

const cachedBalances = new Map<string, BalanceCacheEntry>();

function balanceCacheKey(address: string, chainId: number): string {
  return `${address.toLowerCase()}:${chainId}`;
}

export function getCachedBalanceUsd(address?: string, chainId?: number): number | null {
  if (!address || chainId === undefined) return null;

  const key = balanceCacheKey(address, chainId);
  const entry = cachedBalances.get(key);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > BALANCE_CACHE_TTL_MS) {
    cachedBalances.delete(key);
    return null;
  }
  return entry.usd;
}

export async function refreshBalanceUsd(address: string, chainId: number): Promise<number | null> {
  const key = balanceCacheKey(address, chainId);
  try {
    const chain = getChainById(chainId);
    if (!chain) return null;

    const transport = getTransportForChain(chainId);
    const client = createPublicClient({ chain, transport });
    const balanceWei = await client.getBalance({ address: address as Address });
    const decimals = chain.nativeCurrency?.decimals ?? 18;
    const balanceNative = Number(formatUnits(balanceWei, decimals));

    if (balanceNative === 0) {
      cachedBalances.set(key, { usd: 0, updatedAt: Date.now() });
      return 0;
    }

    const nativeSymbol = chain.nativeCurrency?.symbol?.toLowerCase() ?? "eth";
    const priceUsd = await fetchNativeTokenPrice(nativeSymbol);
    if (priceUsd === null) {
      cachedBalances.delete(key);
      return null;
    }

    const usd = balanceNative * priceUsd;
    cachedBalances.set(key, { usd, updatedAt: Date.now() });
    return usd;
  } catch (e: unknown) {
    process.stderr.write(`[policy] Failed to refresh wallet balance: ${e}\n`);
    cachedBalances.delete(key);
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
  cachedBalances.clear();
}
