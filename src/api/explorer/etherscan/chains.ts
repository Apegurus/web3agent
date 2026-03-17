const ETHERSCAN_CHAIN_URLS: Record<number, string> = {
  1: "https://api.etherscan.io",
  10: "https://api-optimistic.etherscan.io",
  56: "https://api.bscscan.com",
  100: "https://api.gnosisscan.io",
  137: "https://api.polygonscan.com",
  324: "https://api-era.zksync.network",
  8453: "https://api.basescan.org",
  42161: "https://api.arbiscan.io",
  43114: "https://api.snowscan.xyz",
  59144: "https://api.lineascan.build",
  534352: "https://api.scrollscan.com",
  81457: "https://api.blastscan.io",
  34443: "https://api.routescan.io/v2/network/mainnet/evm/34443/etherscan",
  5000: "https://api.mantlescan.xyz",
};

export function getEtherscanApiUrl(chainId: number, baseUrlOverride?: string): string | undefined {
  if (baseUrlOverride && chainId === 1) return baseUrlOverride;
  return ETHERSCAN_CHAIN_URLS[chainId];
}

export function getEtherscanSupportedChainIds(): number[] {
  return Object.keys(ETHERSCAN_CHAIN_URLS).map(Number);
}
