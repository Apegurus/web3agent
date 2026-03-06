export const LIQUIDITY_HUB_CHAINS = [
  137, // Polygon
  56, // BSC
  8453, // Base
  59144, // Linea
  81457, // Blast
  42161, // Arbitrum
] as const;

export const TWAP_CHAINS = [
  1, // Ethereum
  137, // Polygon
  56, // BSC
  42161, // Arbitrum
  8453, // Base
  59144, // Linea
  324, // zkSync
  250, // Fantom
  43114, // Avalanche
  81457, // Blast
  146, // Sonic
  534352, // Scroll
] as const;

const LIQUIDITY_HUB_CHAIN_NAMES: Record<number, string> = {
  137: "Polygon",
  56: "BSC",
  8453: "Base",
  59144: "Linea",
  81457: "Blast",
  42161: "Arbitrum",
};

export function isLiquidityHubSupported(chainId: number): boolean {
  return (LIQUIDITY_HUB_CHAINS as readonly number[]).includes(chainId);
}

export function isTwapSupported(chainId: number): boolean {
  return (TWAP_CHAINS as readonly number[]).includes(chainId);
}

export function getLiquidityHubError(chainId: number): string {
  const names = LIQUIDITY_HUB_CHAINS.map(
    (id) => `${LIQUIDITY_HUB_CHAIN_NAMES[id]} (${id})`,
  ).join(", ");
  return `Orbs Liquidity Hub is not available on chain ${chainId}. Supported: ${names}`;
}

export function getTwapError(chainId: number): string {
  return `Orbs dTWAP/dLIMIT is not available on chain ${chainId}. Supported chain IDs: ${(TWAP_CHAINS as readonly number[]).join(", ")}`;
}
