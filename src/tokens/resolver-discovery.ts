import { getChainById } from "../chains/registry.js";
import { resilientFetch } from "../utils/resilient-fetch.js";
import { type CoinGeckoTopTokenSignals, getTopCoinGeckoSignals } from "./coingecko.js";
import { DEXSCREENER_CHAIN_SLUGS, REPUTATION_EQUIVALENTS } from "./resolver-chains.js";
import type { ResolvedToken } from "./resolver.js";
import { type TokenMetadataSignals, fetchTokenMetadata } from "./token-metadata.js";

const DISCOVERY_LIQUIDITY_WARNING_USD = 50_000;

type DexScreenerCandidate = {
  readonly address: string;
  readonly liquidity: number;
  readonly name: string;
  readonly quoteTokenAddress: string;
  readonly quoteTokenSymbol: string;
  readonly symbol: string;
};

function getCandidateReputationScore(
  candidate: DexScreenerCandidate,
  chainId: number,
  signals: CoinGeckoTopTokenSignals | null
): number {
  if (signals?.addressesByChain.get(chainId)?.has(candidate.quoteTokenAddress.toLowerCase()))
    return 2;
  const normalized = candidate.quoteTokenSymbol.toUpperCase();
  const aliases = REPUTATION_EQUIVALENTS[normalized] ?? [normalized];
  return aliases.some((alias) => signals?.symbols.has(alias)) ? 1 : 0;
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
    metadata.symbol.trim().replace(/\s+/g, "").toUpperCase() !==
      candidate.symbol.trim().replace(/\s+/g, "").toUpperCase()
  ) {
    warnings.push(
      `Onchain symbol (${metadata.symbol}) does not match DexScreener metadata (${candidate.symbol}).`
    );
  }
  if (
    metadata.name &&
    metadata.name.trim().replace(/\s+/g, " ").toLowerCase() !==
      candidate.name.trim().replace(/\s+/g, " ").toLowerCase()
  ) {
    warnings.push(
      `Onchain name (${metadata.name}) does not match DexScreener metadata (${candidate.name}).`
    );
  }
  return warnings.length > 0 ? warnings : undefined;
}

export async function resolveViaDexScreener(
  symbol: string,
  chainId: number
): Promise<ResolvedToken | null> {
  const chainSlug = DEXSCREENER_CHAIN_SLUGS[chainId];
  if (!chainSlug) return null;

  try {
    const response = await resilientFetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`,
      undefined,
      { label: "dexscreener" }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      readonly pairs?: readonly {
        readonly chainId: string;
        readonly baseToken: {
          readonly address: string;
          readonly name: string;
          readonly symbol: string;
        };
        readonly quoteToken: {
          readonly address: string;
          readonly name: string;
          readonly symbol: string;
        };
        readonly liquidity?: { readonly usd?: number };
      }[];
    };
    if (!data.pairs?.length) return null;

    const upperSymbol = symbol.toUpperCase();
    const reputableSignals = await getTopCoinGeckoSignals();
    const candidates = data.pairs
      .filter((pair) => pair.chainId === chainSlug)
      .flatMap((pair) => {
        const matches: DexScreenerCandidate[] = [];
        if (pair.baseToken.symbol.toUpperCase() === upperSymbol) {
          matches.push({
            ...pair.baseToken,
            liquidity: pair.liquidity?.usd ?? 0,
            quoteTokenAddress: pair.quoteToken.address,
            quoteTokenSymbol: pair.quoteToken.symbol,
          });
        }
        if (pair.quoteToken.symbol.toUpperCase() === upperSymbol) {
          matches.push({
            ...pair.quoteToken,
            liquidity: pair.liquidity?.usd ?? 0,
            quoteTokenAddress: pair.baseToken.address,
            quoteTokenSymbol: pair.baseToken.symbol,
          });
        }
        return matches;
      });
    if (candidates.length === 0) return null;

    candidates.sort((left, right) => {
      const reputationDelta =
        getCandidateReputationScore(right, chainId, reputableSignals) -
        getCandidateReputationScore(left, chainId, reputableSignals);
      return reputationDelta !== 0 ? reputationDelta : right.liquidity - left.liquidity;
    });
    const best = candidates[0];
    if (!best) return null;
    const metadata = await fetchTokenMetadata(best.address, getChainById(chainId));
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
  } catch (error: unknown) {
    process.stderr.write(`[tokens] DexScreener fallback failed: ${error}\n`);
    return null;
  }
}
