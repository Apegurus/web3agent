/**
 * Chain support tier classification.
 *
 * Computes which chains have full, partial, or minimal support based on
 * the intersection of: token registry, DexScreener slugs, and
 * Orbs/GOAT integrations.
 *
 * Phase 4.6 of the remediation plan.
 */

import { RESTRICTED_PLUGIN_CHAINS } from "../goat/dispatch.js";
import { LIQUIDITY_HUB_CHAINS } from "../orbs/chains.js";
import { getRegisteredChainIds } from "../tokens/registry.js";

// DexScreener-supported chain IDs — mirrored from resolver.ts to avoid
// importing a runtime-only mapping.  Keep in sync with DEXSCREENER_CHAIN_SLUGS.
const DEXSCREENER_CHAIN_IDS: ReadonlySet<number> = new Set([
  1, // Ethereum
  56, // BSC
  137, // Polygon
  42161, // Arbitrum
  10, // Optimism
  8453, // Base
  59144, // Linea
  43114, // Avalanche
  81457, // Blast
  324, // zkSync
  534352, // Scroll
  100, // Gnosis
  42220, // Celo
  5000, // Mantle
  34443, // Mode
]);

/**
 * All chain IDs that have GOAT plugin integrations (union of all plugins).
 */
const GOAT_CHAIN_IDS: ReadonlySet<number> = new Set(Object.values(RESTRICTED_PLUGIN_CHAINS).flat());

/**
 * All chain IDs that have Orbs Liquidity Hub support.
 */
const ORBS_CHAIN_IDS: ReadonlySet<number> = new Set(LIQUIDITY_HUB_CHAINS);

/**
 * Chain IDs in the token registry.
 * Computed once at module load.
 */
const REGISTRY_CHAIN_IDS: ReadonlySet<number> = new Set(getRegisteredChainIds());

/**
 * A chain is "fully supported" when it has entries in both the token
 * registry and DexScreener slug mapping.
 */
const FULLY_SUPPORTED_CHAIN_IDS: ReadonlySet<number> = new Set(
  [...REGISTRY_CHAIN_IDS].filter((id) => DEXSCREENER_CHAIN_IDS.has(id))
);

/**
 * Returns true if the chain has both token registry entries and
 * DexScreener slug coverage.
 */
export function isFullySupported(chainId: number): boolean {
  return FULLY_SUPPORTED_CHAIN_IDS.has(chainId);
}

export type SupportTier = "full" | "partial" | "minimal";

/**
 * Classify a chain's support tier:
 *
 * - **full** — token registry + DexScreener + at least one of Orbs/GOAT
 * - **partial** — token registry + DexScreener but no Orbs/GOAT integration
 * - **minimal** — anything less (basic EVM support only)
 */
export function getSupportTier(chainId: number): SupportTier {
  const hasRegistry = REGISTRY_CHAIN_IDS.has(chainId);
  const hasDexScreener = DEXSCREENER_CHAIN_IDS.has(chainId);
  const hasOrbs = ORBS_CHAIN_IDS.has(chainId);
  const hasGoat = GOAT_CHAIN_IDS.has(chainId);

  if (hasRegistry && hasDexScreener && (hasOrbs || hasGoat)) {
    return "full";
  }
  if (hasRegistry && hasDexScreener) {
    return "partial";
  }
  return "minimal";
}

/**
 * Returns all chain IDs that qualify as fully supported.
 */
export function getFullySupportedChainIds(): readonly number[] {
  return [...FULLY_SUPPORTED_CHAIN_IDS];
}

/**
 * Returns a breakdown of all known chain IDs grouped by support tier.
 */
export function getChainsByTier(): Record<SupportTier, number[]> {
  const result: Record<SupportTier, number[]> = {
    full: [],
    partial: [],
    minimal: [],
  };

  // Collect all unique chain IDs from every source.
  const allChainIds = new Set([
    ...REGISTRY_CHAIN_IDS,
    ...DEXSCREENER_CHAIN_IDS,
    ...ORBS_CHAIN_IDS,
    ...GOAT_CHAIN_IDS,
  ]);

  for (const id of allChainIds) {
    result[getSupportTier(id)].push(id);
  }

  return result;
}
