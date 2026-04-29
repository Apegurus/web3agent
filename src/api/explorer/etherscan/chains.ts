const ETHERSCAN_SUPPORTED_CHAIN_IDS = [
  1, 10, 56, 100, 137, 324, 8453, 42161, 43114, 59144, 534352, 81457, 34443, 5000,
];

const ETHERSCAN_V2_API_URL = "https://api.etherscan.io/v2/api";

export function getEtherscanApiUrl(chainId: number): string | undefined {
  if (!ETHERSCAN_SUPPORTED_CHAIN_IDS.includes(chainId)) return undefined;
  return ETHERSCAN_V2_API_URL;
}

export function getEtherscanSupportedChainIds(): number[] {
  return [...ETHERSCAN_SUPPORTED_CHAIN_IDS];
}
