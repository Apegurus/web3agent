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
  confirmTtlMinutes: number;
  blockscoutMcpUrl: string;
  etherscanMcpUrl: string;
  etherscanApiKey?: string;
  lifiApiKey?: string;
  zeroxApiKey?: string;
  coingeckoApiKey?: string;
  orbsPartner?: string;
  acpContractAddress?: string; // ERC-8183 contract address (from ACP_CONTRACT_ADDRESS)
  acpPaymentToken?: string; // ERC-20 token for ACP escrow (from ACP_PAYMENT_TOKEN, default USDC)
  pinataJwt?: string; // Pinata JWT for IPFS pinning (from PINATA_JWT)
  erc8004AgentUri?: string; // Advertised MCP endpoint URI for ERC-8004 registration (from ERC8004_AGENT_URI)
  agdpApiUrl?: string; // aGDP API base URL (from AGDP_API_URL, default https://acpx.virtuals.io/api)

  // Treasury policy — set by user via env vars or CLI, read-only for the agent
  policyEnabled?: boolean;
  policyMaxSingleTransactionUsd?: number;
  policyMaxHourlyUsd?: number;
  policyMaxDailyUsd?: number;
  policyMinReserveUsd?: number;
  policyMaxX402PaymentUsd?: number;
}
