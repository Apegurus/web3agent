export interface EnvVars {
  CHAIN_ID?: string;
  PRIVATE_KEY?: string;
  MNEMONIC?: string;
  WALLET_ACCOUNT_INDEX?: string;
  WALLET_ADDRESS_INDEX?: string;
  RPC_URL?: string;
  CONFIRM_WRITES?: string;
  BLOCKSCOUT_MCP_URL?: string;
  ETHERSCAN_API_KEY?: string;
  LIFI_API_KEY?: string;
  ZEROX_API_KEY?: string;
  COINGECKO_API_KEY?: string;
}

export interface SupportedChain {
  id: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface ChainConfig extends SupportedChain {
  rpcUrls: {
    default: { http: string[] };
  };
}

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
}
