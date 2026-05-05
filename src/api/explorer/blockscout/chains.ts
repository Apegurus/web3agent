const BLOCKSCOUT_CHAIN_URLS: Record<number, string> = {
  1: "https://eth.blockscout.com",
  10: "https://optimism.blockscout.com",
  100: "https://gnosis.blockscout.com",
  137: "https://polygon.blockscout.com",
  324: "https://zksync.blockscout.com",
  8453: "https://base.blockscout.com",
  42161: "https://arbitrum.blockscout.com",
  534352: "https://scroll.blockscout.com",
};

export function getBlockscoutApiUrl(chainId: number): string | undefined {
  return BLOCKSCOUT_CHAIN_URLS[chainId];
}

export function getBlockscoutSupportedChainIds(): number[] {
  return Object.keys(BLOCKSCOUT_CHAIN_URLS).map(Number);
}
