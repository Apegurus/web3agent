export interface RuntimeConfig {
  chainId: number;
  privateKey?: string;
  mnemonic?: string;
  walletAccountIndex: number;
  walletAddressIndex: number;
  rpcUrl?: string;
  /** Per-chain RPC overrides keyed by chain ID, parsed from RPC_URL_<chainId> env vars. */
  chainRpcUrls: Record<number, string>;
  confirmWrites: boolean;
  blockscoutMcpUrl: string;
  etherscanMcpUrl: string;
  etherscanApiKey?: string;
  lifiApiKey?: string;
  zeroxApiKey?: string;
  coingeckoApiKey?: string;
  orbsPartner?: string;
}
