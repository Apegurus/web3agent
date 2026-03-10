import { getChainById } from "../chains/registry.js";
import { type TokenEntry, getChainTokens, lookupToken } from "./registry.js";

export interface ResolvedToken extends TokenEntry {
  chainId: number;
  source: "registry" | "dexscreener";
  note?: string;
}

const NATIVE_ALIASES: Record<number, Record<string, string>> = {
  1: { ETH: "WETH" },
  56: { BNB: "WBNB" },
  137: { MATIC: "WMATIC", POL: "WMATIC" },
  42161: { ETH: "WETH" },
  10: { ETH: "WETH" },
  8453: { ETH: "WETH" },
  59144: { ETH: "WETH" },
  43114: { AVAX: "WAVAX" },
  81457: { ETH: "WETH" },
  324: { ETH: "WETH" },
  534352: { ETH: "WETH" },
  100: { XDAI: "WXDAI" },
  5000: { MNT: "WMNT" },
  34443: { ETH: "WETH" },
};

export async function resolveToken(symbol: string, chainId: number): Promise<ResolvedToken | null> {
  const entry = lookupToken(symbol, chainId);
  if (entry) {
    return { ...entry, chainId, source: "registry" };
  }

  const upperSymbol = symbol.toUpperCase();
  const chainAliases = NATIVE_ALIASES[chainId];
  if (chainAliases) {
    const wrappedSymbol = chainAliases[upperSymbol];
    if (wrappedSymbol) {
      const wrappedEntry = lookupToken(wrappedSymbol, chainId);
      if (wrappedEntry) {
        return {
          ...wrappedEntry,
          chainId,
          source: "registry",
          note: `${upperSymbol} is a native token; resolved to its wrapped equivalent ${wrappedSymbol}.`,
        };
      }
    }
  }

  return resolveViaDexScreener(symbol, chainId);
}

export function resolveTokenSync(symbol: string, chainId: number): ResolvedToken | null {
  const entry = lookupToken(symbol, chainId);
  if (entry) return { ...entry, chainId, source: "registry" };

  const upperSymbol = symbol.toUpperCase();
  const chainAliases = NATIVE_ALIASES[chainId];
  if (chainAliases) {
    const wrappedSymbol = chainAliases[upperSymbol];
    if (wrappedSymbol) {
      const wrappedEntry = lookupToken(wrappedSymbol, chainId);
      if (wrappedEntry) {
        return {
          ...wrappedEntry,
          chainId,
          source: "registry",
          note: `${upperSymbol} is a native token; resolved to its wrapped equivalent ${wrappedSymbol}.`,
        };
      }
    }
  }

  return null;
}

export function listTokens(chainId: number): TokenEntry[] {
  const tokens = getChainTokens(chainId);
  if (!tokens) return [];
  return Object.values(tokens);
}

const DEXSCREENER_CHAIN_SLUGS: Record<number, string> = {
  1: "ethereum",
  56: "bsc",
  137: "polygon",
  42161: "arbitrum",
  10: "optimism",
  8453: "base",
  59144: "linea",
  43114: "avalanche",
  81457: "blast",
  324: "zksync",
  534352: "scroll",
  100: "gnosis",
  42220: "celo",
  5000: "mantle",
  34443: "mode",
};

async function resolveViaDexScreener(
  symbol: string,
  chainId: number
): Promise<ResolvedToken | null> {
  const chainSlug = DEXSCREENER_CHAIN_SLUGS[chainId];
  if (!chainSlug) return null;

  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      pairs?: Array<{
        chainId: string;
        baseToken: { address: string; name: string; symbol: string };
        quoteToken: { address: string; name: string; symbol: string };
        liquidity?: { usd?: number };
      }>;
    };

    if (!data.pairs?.length) return null;

    const upperSymbol = symbol.toUpperCase();
    const candidates = data.pairs
      .filter((p) => p.chainId === chainSlug)
      .flatMap((p) => {
        const matches: Array<{
          address: string;
          name: string;
          symbol: string;
          liquidity: number;
        }> = [];
        if (p.baseToken.symbol.toUpperCase() === upperSymbol) {
          matches.push({ ...p.baseToken, liquidity: p.liquidity?.usd ?? 0 });
        }
        if (p.quoteToken.symbol.toUpperCase() === upperSymbol) {
          matches.push({ ...p.quoteToken, liquidity: p.liquidity?.usd ?? 0 });
        }
        return matches;
      });

    if (!candidates.length) return null;

    candidates.sort((a, b) => b.liquidity - a.liquidity);
    const best = candidates[0];

    const chain = getChainById(chainId);
    const decimals = await fetchDecimals(best.address, chainId, chain);

    if (decimals === null) {
      process.stderr.write(
        `[tokens] Could not fetch decimals for ${best.symbol} (${best.address}) on chain ${chainId} — refusing to resolve\n`
      );
      return null;
    }

    return {
      address: best.address,
      decimals,
      name: best.name,
      symbol: best.symbol,
      chainId,
      source: "dexscreener",
    };
  } catch (e: unknown) {
    process.stderr.write(`[tokens] DexScreener fallback failed: ${e}\n`);
    return null;
  }
}

async function fetchDecimals(
  tokenAddress: string,
  _chainId: number,
  chain?: { rpcUrls?: { default?: { http?: readonly string[] } } }
): Promise<number | null> {
  const rpcUrl = chain?.rpcUrls?.default?.http?.[0];
  if (!rpcUrl) return null;

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: tokenAddress, data: "0x313ce567" }, "latest"],
      }),
    });

    if (!response.ok) return null;

    const result = (await response.json()) as { result?: string };
    if (result.result && result.result !== "0x") {
      const decimals = Number.parseInt(result.result, 16);
      if (decimals < 0 || decimals > 77 || !Number.isFinite(decimals)) {
        return null;
      }
      return decimals;
    }
  } catch {
    /* RPC decimals() failure — return null */
  }

  return null;
}
