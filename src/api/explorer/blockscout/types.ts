export interface BlockscoutAddress {
  hash: string;
  coin_balance: string | null;
  exchange_rate: string | null;
  is_contract: boolean;
  is_verified: boolean;
  name: string | null;
  ens_domain_name: string | null;
  public_tags: Array<{ label: string; display_name: string }>;
  has_tokens: boolean;
  has_token_transfers: boolean;
  implementations: Array<{ address_hash: string; name: string }>;
  proxy_type: string | null;
}

export interface BlockscoutToken {
  address: string;
  symbol: string | null;
  name: string | null;
  decimals: string | null;
  type: string;
  balance: string;
  exchange_rate: string | null;
}

export interface BlockscoutTokenList {
  items: BlockscoutToken[];
  next_page_params: Record<string, string> | null;
}

export interface BlockscoutTransaction {
  hash: string;
  block: number;
  timestamp: string;
  from: { hash: string };
  to: { hash: string } | null;
  value: string;
  gas_used: string;
  gas_price: string;
  fee: { value: string } | null;
  status: string;
  method: string | null;
  nonce: number;
  result: string;
  tx_types: string[];
  decoded_input: {
    method_call: string;
    parameters: Array<{ name: string; type: string; value: string }>;
  } | null;
  token_transfers: BlockscoutTokenTransfer[] | null;
  raw_input: string | null;
}

export interface BlockscoutTransactionList {
  items: BlockscoutTransaction[];
  next_page_params: Record<string, string> | null;
}

export interface BlockscoutTokenTransfer {
  block_hash: string;
  block_number: number;
  timestamp: string;
  from: { hash: string };
  to: { hash: string };
  token: {
    address: string;
    symbol: string | null;
    name: string | null;
    decimals: string | null;
    type: string;
  };
  total: { value: string; decimals: string };
  tx_hash: string;
}

export interface BlockscoutTokenTransferList {
  items: BlockscoutTokenTransfer[];
  next_page_params: Record<string, string> | null;
}

export interface BlockscoutBlock {
  height: number;
  hash: string;
  timestamp: string;
  parent_hash: string;
  miner: { hash: string };
  gas_used: string;
  gas_limit: string;
  base_fee_per_gas: string | null;
  tx_count: number;
  rewards: Array<{ type: string; value: string }> | null;
}

export interface BlockscoutSmartContract {
  name: string | null;
  compiler_version: string | null;
  optimization_enabled: boolean;
  source_code: string;
  abi: unknown[];
  constructor_args: string | null;
  additional_sources: Array<{ file_path: string; source_code: string }>;
  is_proxy: boolean;
  implementations: Array<{ address: string; name: string }>;
}

export interface BlockscoutNft {
  token: {
    address: string;
    name: string | null;
    symbol: string | null;
    type: string;
  };
  id: string;
  value: string;
  metadata: Record<string, unknown> | null;
}

export interface BlockscoutNftList {
  items: BlockscoutNft[];
  next_page_params: Record<string, string> | null;
}
