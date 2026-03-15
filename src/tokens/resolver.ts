import type { Hex } from "viem";
import { decodeAbiParameters, hexToString } from "viem";
import { getChainById } from "../chains/registry.js";
import { type CoinGeckoTopTokenSignals, getTopCoinGeckoSignals } from "./coingecko.js";
import { type TokenEntry, getChainTokens, lookupToken } from "./registry.js";

export interface ResolvedToken extends TokenEntry {
  chainId: number;
  source: "registry" | "dexscreener";
  note?: string;
  warnings?: string[];
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

const REPUTATION_EQUIVALENTS: Record<string, string[]> = {
  ETH: ["ETH", "WETH"],
  WETH: ["WETH", "ETH"],
  BTC: ["BTC", "WBTC"],
  WBTC: ["WBTC", "BTC"],
  BNB: ["BNB", "WBNB"],
  WBNB: ["WBNB", "BNB"],
  MATIC: ["MATIC", "WMATIC", "POL", "WPOL"],
  WMATIC: ["WMATIC", "MATIC", "POL", "WPOL"],
  POL: ["POL", "WPOL", "WMATIC", "MATIC"],
  WPOL: ["WPOL", "POL", "WMATIC", "MATIC"],
  AVAX: ["AVAX", "WAVAX"],
  WAVAX: ["WAVAX", "AVAX"],
  MNT: ["MNT", "WMNT"],
  WMNT: ["WMNT", "MNT"],
  XDAI: ["XDAI", "WXDAI", "DAI"],
  WXDAI: ["WXDAI", "XDAI", "DAI"],
  USDC: ["USDC", "USDC.E"],
  "USDC.E": ["USDC.E", "USDC"],
};

const DISCOVERY_LIQUIDITY_WARNING_USD = 50_000;

interface DexScreenerCandidate {
  address: string;
  liquidity: number;
  name: string;
  quoteTokenAddress: string;
  quoteTokenSymbol: string;
  symbol: string;
}

interface TokenMetadataSignals {
  decimals: number | null;
  name?: string;
  symbol?: string;
}

function isReputableQuoteTokenSymbol(
  symbol: string,
  reputableSymbols: ReadonlySet<string> | undefined
): boolean {
  if (!reputableSymbols) return false;
  const normalized = symbol.toUpperCase();
  const aliases = REPUTATION_EQUIVALENTS[normalized] ?? [normalized];
  return aliases.some((alias) => reputableSymbols.has(alias));
}

function isReputableQuoteTokenAddress(
  address: string,
  chainId: number,
  signals: CoinGeckoTopTokenSignals | null
): boolean {
  return signals?.addressesByChain.get(chainId)?.has(address.toLowerCase()) ?? false;
}

function normalizeSymbolLike(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeNameLike(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getCandidateReputationScore(
  candidate: DexScreenerCandidate,
  chainId: number,
  signals: CoinGeckoTopTokenSignals | null
): number {
  if (isReputableQuoteTokenAddress(candidate.quoteTokenAddress, chainId, signals)) {
    return 2;
  }

  if (isReputableQuoteTokenSymbol(candidate.quoteTokenSymbol, signals?.symbols)) {
    return 1;
  }

  return 0;
}

function getDiscoveryWarnings(
  candidate: DexScreenerCandidate,
  chainId: number,
  signals: CoinGeckoTopTokenSignals | null,
  metadata: TokenMetadataSignals
): string[] | undefined {
  const warnings: string[] = [];

  if (candidate.liquidity < DISCOVERY_LIQUIDITY_WARNING_USD) {
    warnings.push(
      `Selected DexScreener pair has low reported liquidity ($${Math.round(candidate.liquidity).toLocaleString()} USD).`
    );
  }

  if (signals && getCandidateReputationScore(candidate, chainId, signals) === 0) {
    warnings.push(
      `Selected DexScreener pair is not quoted against a CoinGecko top-100 token (quote token: ${candidate.quoteTokenSymbol}).`
    );
  }

  if (
    metadata.symbol &&
    normalizeSymbolLike(metadata.symbol) !== normalizeSymbolLike(candidate.symbol)
  ) {
    warnings.push(
      `Onchain symbol (${metadata.symbol}) does not match DexScreener metadata (${candidate.symbol}).`
    );
  }

  if (metadata.name && normalizeNameLike(metadata.name) !== normalizeNameLike(candidate.name)) {
    warnings.push(
      `Onchain name (${metadata.name}) does not match DexScreener metadata (${candidate.name}).`
    );
  }

  return warnings.length > 0 ? warnings : undefined;
}

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
    const reputableSignals = await getTopCoinGeckoSignals();
    const candidates = data.pairs
      .filter((p) => p.chainId === chainSlug)
      .flatMap((p) => {
        const matches: DexScreenerCandidate[] = [];
        if (p.baseToken.symbol.toUpperCase() === upperSymbol) {
          matches.push({
            ...p.baseToken,
            liquidity: p.liquidity?.usd ?? 0,
            quoteTokenAddress: p.quoteToken.address,
            quoteTokenSymbol: p.quoteToken.symbol,
          });
        }
        if (p.quoteToken.symbol.toUpperCase() === upperSymbol) {
          matches.push({
            ...p.quoteToken,
            liquidity: p.liquidity?.usd ?? 0,
            quoteTokenAddress: p.baseToken.address,
            quoteTokenSymbol: p.baseToken.symbol,
          });
        }
        return matches;
      });

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      const reputableDelta =
        getCandidateReputationScore(b, chainId, reputableSignals) -
        getCandidateReputationScore(a, chainId, reputableSignals);
      if (reputableDelta !== 0) return reputableDelta;
      return b.liquidity - a.liquidity;
    });
    const best = candidates[0];

    const chain = getChainById(chainId);
    const metadata = await fetchTokenMetadata(best.address, chain);

    if (metadata.decimals === null) {
      process.stderr.write(
        `[tokens] Could not fetch decimals for ${best.symbol} (${best.address}) on chain ${chainId} — refusing to resolve\n`
      );
      return null;
    }

    return {
      address: best.address,
      decimals: metadata.decimals,
      name: best.name,
      symbol: best.symbol,
      chainId,
      source: "dexscreener",
      warnings: getDiscoveryWarnings(best, chainId, reputableSignals, metadata),
    };
  } catch (e: unknown) {
    process.stderr.write(`[tokens] DexScreener fallback failed: ${e}\n`);
    return null;
  }
}

async function fetchTokenMetadata(
  tokenAddress: string,
  chain?: { rpcUrls?: { default?: { http?: readonly string[] } } }
): Promise<TokenMetadataSignals> {
  const rpcUrl = chain?.rpcUrls?.default?.http?.[0];
  if (!rpcUrl) {
    return { decimals: null };
  }

  const [decimalsResult, symbolResult, nameResult] = await Promise.all([
    callContract(rpcUrl, tokenAddress, "0x313ce567"),
    callContract(rpcUrl, tokenAddress, "0x95d89b41"),
    callContract(rpcUrl, tokenAddress, "0x06fdde03"),
  ]);

  return {
    decimals: decodeDecimals(decimalsResult),
    symbol: decodeTokenString(symbolResult),
    name: decodeTokenString(nameResult),
  };
}

async function callContract(
  rpcUrl: string,
  tokenAddress: string,
  data: Hex
): Promise<string | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: tokenAddress, data }, "latest"],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const result = (await response.json()) as { result?: unknown };
    return typeof result.result === "string" ? result.result : null;
  } catch (error: unknown) {
    process.stderr.write(`[tokens] RPC token metadata lookup failed: ${error}\n`);
    return null;
  }
}

function decodeDecimals(result: string | null): number | null {
  if (!result || result === "0x") {
    return null;
  }

  const decimals = Number.parseInt(result, 16);
  if (decimals < 0 || decimals > 77 || !Number.isFinite(decimals)) {
    return null;
  }

  return decimals;
}

function decodeTokenString(result: string | null): string | undefined {
  if (!result || result === "0x") {
    return undefined;
  }

  const abiDecoded = decodeAbiEncodedString(result);
  if (abiDecoded) {
    return abiDecoded;
  }

  return decodeBytes32String(result) ?? undefined;
}

function decodeAbiEncodedString(result: string): string | null {
  try {
    const [decoded] = decodeAbiParameters([{ type: "string" }], result as Hex);
    const normalized = decoded.trim();
    return normalized.length > 0 ? normalized : null;
  } catch (_error: unknown) {
    return null;
  }
}

function decodeBytes32String(result: string): string | null {
  if (result.length !== 66) {
    return null;
  }

  try {
    const decoded = hexToString(result as Hex, { size: 32 })
      .replaceAll("\0", "")
      .trim();
    return decoded.length > 0 ? decoded : null;
  } catch (_error: unknown) {
    return null;
  }
}
