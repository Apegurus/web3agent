import { type TokenEntry, getChainTokens, lookupToken } from "./registry.js";
import { NATIVE_ALIASES } from "./resolver-chains.js";
import { resolveViaDexScreener } from "./resolver-discovery.js";

export interface ResolvedToken extends TokenEntry {
  chainId: number;
  source: "registry" | "dexscreener";
  note?: string;
  warnings?: string[];
}

function resolveCanonicalTokenInternal(symbol: string, chainId: number): ResolvedToken | null {
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

  return null;
}

/** Resolve a token from the canonical (built-in) registry only. Async for API symmetry with {@link resolveToken}. */
export async function resolveCanonicalToken(
  symbol: string,
  chainId: number
): Promise<ResolvedToken | null> {
  return resolveCanonicalTokenInternal(symbol, chainId);
}

/** Synchronous canonical-registry-only resolution. Equivalent to the async {@link resolveCanonicalToken}. */
export function resolveCanonicalTokenSync(symbol: string, chainId: number): ResolvedToken | null {
  return resolveCanonicalTokenInternal(symbol, chainId);
}

/**
 * Resolve a token by symbol — checks the canonical registry first, then falls
 * back to DexScreener discovery for long-tail assets. Use this when you want
 * the broadest possible resolution.
 */
export async function resolveToken(symbol: string, chainId: number): Promise<ResolvedToken | null> {
  const canonical = resolveCanonicalTokenInternal(symbol, chainId);
  if (canonical) {
    return canonical;
  }

  return resolveViaDexScreener(symbol, chainId);
}

/**
 * Synchronous token resolution — canonical registry only (same as
 * {@link resolveCanonicalTokenSync}). DexScreener discovery requires network
 * I/O, so use the async {@link resolveToken} when you need discovery fallback.
 */
export function resolveTokenSync(symbol: string, chainId: number): ResolvedToken | null {
  return resolveCanonicalTokenInternal(symbol, chainId);
}

export function listTokens(chainId: number): TokenEntry[] {
  const tokens = getChainTokens(chainId);
  if (!tokens) return [];
  return Object.values(tokens);
}
