import { Configs } from "@orbs-network/twap-sdk";
import { getChainById } from "../chains/registry.js";
import { getSupportedSpotChainIds, isSpotChainSupported } from "./spot-config.js";

// Liquidity Hub SDK does not expose supported chains — hardcoded list required.
// Source: @orbs-network/liquidity-hub-sdk internal getApiUrl() switch statement.
export const LIQUIDITY_HUB_CHAINS = [
  137, // Polygon
  56, // BSC
  8453, // Base
  59144, // Linea
  81457, // Blast
  42161, // Arbitrum
] as const;

const TWAP_CHAIN_IDS = new Set(Object.values(Configs).map((c) => c.chainId));

export function isLiquidityHubSupported(chainId: number): boolean {
  return (LIQUIDITY_HUB_CHAINS as readonly number[]).includes(chainId);
}

export function isTwapSupported(chainId: number): boolean {
  return TWAP_CHAIN_IDS.has(chainId);
}

export function getLiquidityHubError(chainId: number): string {
  const names = LIQUIDITY_HUB_CHAINS.map(
    (id) => `${getChainById(id)?.name ?? String(id)} (${id})`
  ).join(", ");
  return `Orbs Liquidity Hub is not available on chain ${chainId}. Supported: ${names}`;
}

export function getTwapError(chainId: number): string {
  return `Orbs dTWAP/dLIMIT is not available on chain ${chainId}. Use isTwapSupported() to check availability.`;
}

export function isSpotSupported(chainId: number): boolean {
  return isSpotChainSupported(chainId);
}

export function getSpotError(chainId: number): string {
  const supported = getSupportedSpotChainIds()
    .map((id) => `${getChainById(id)?.name ?? String(id)} (${id})`)
    .join(", ");
  return `Spot orders are not available on chain ${chainId}. Supported: ${supported}`;
}
