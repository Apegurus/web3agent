export interface RuntimeConfig {
  chainId: number;
  privateKey?: string;
  mnemonic?: string;
  walletAccountIndex: number;
  walletAddressIndex: number;
  rpcUrl?: string;
  confirmWrites: boolean;
  blockscoutMcpUrl: string;
  etherscanApiKey?: string;
  lifiApiKey?: string;
  zeroxApiKey?: string;
  coingeckoApiKey?: string;
  orbsPartner?: string;
}
