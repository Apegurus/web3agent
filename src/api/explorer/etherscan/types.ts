export interface EtherscanStandardResponse<T = unknown> {
  status: "0" | "1";
  message: string;
  result: T;
}

export interface EtherscanProxyResponse<T = unknown> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

/** Etherscan returns standard format for most endpoints, JSON-RPC for proxy module */
export type EtherscanApiResponse<T = unknown> =
  | EtherscanStandardResponse<T>
  | EtherscanProxyResponse<T>;

/** Typed proxy response for eth_getTransactionReceipt */
export interface EtherscanProxyReceipt {
  blockNumber: string;
  status: string;
  gasUsed: string;
  effectiveGasPrice?: string;
  cumulativeGasUsed?: string;
  contractAddress?: string;
  logs: Array<Record<string, unknown>>;
}

export interface EtherscanTransaction {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  isError: "0" | "1";
  txreceipt_status: "" | "0" | "1";
  input: string;
  methodId: string;
  functionName: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  confirmations: string;
}

export interface EtherscanTokenTransfer {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  from: string;
  to: string;
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  value: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
}

export interface EtherscanContractSource {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: "0" | "1";
  Runs: string;
  ConstructorArguments: string;
  EVMVersion: string;
  Library: string;
  LicenseType: string;
  Proxy: "0" | "1";
  Implementation: string;
  SwarmSource: string;
}

/** Phase 2: used by explorer_get_block_rewards */
export interface EtherscanBlock {
  blockNumber: string;
  timeStamp: string;
  blockMiner: string;
  blockReward: string;
  uncles: Array<{ miner: string; unclePosition: string; blockreward: string }>;
  uncleInclusionReward: string;
}

/** Phase 2: used by explorer_get_tx_execution_status */
export interface EtherscanTxStatus {
  isError: "0" | "1";
  errDescription: string;
}

/** Phase 2: used by explorer_get_tx_execution_status */
export interface EtherscanTxReceiptStatus {
  status: "" | "0" | "1";
}

/** Phase 2: used by explorer_get_contract_creator */
export interface EtherscanContractCreator {
  contractAddress: string;
  contractCreator: string;
  txHash: string;
}

/** Phase 2: used by explorer_get_internal_txs */
export interface EtherscanInternalTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasUsed: string;
  isError: "0" | "1";
  type: string;
  traceId: string;
  errCode: string;
  contractAddress: string;
  input: string;
}

/** Phase 2: used by explorer_get_nft_transfers */
export interface EtherscanNftTransfer {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  from: string;
  to: string;
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  tokenID: string;
  value: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
}

/** Phase 2: used by explorer_get_token_info */
export interface EtherscanTokenInfo {
  contractAddress: string;
  tokenName: string;
  symbol: string;
  divisor: string;
  tokenType: string;
  totalSupply: string;
  blueCheckmark: string;
  description: string;
  website: string;
  email: string;
  blog: string;
  reddit: string;
  slack: string;
  facebook: string;
  twitter: string;
  bitcointalk: string;
  github: string;
  telegram: string;
  wechat: string;
  linkedin: string;
  discord: string;
  whitepaper: string;
  tokenPriceUSD: string;
  tokenPriceETH: string;
}

/** Phase 2: used by explorer_get_token_holders */
export interface EtherscanTokenHolder {
  TokenHolderAddress: string;
  TokenHolderQuantity: string;
}

/** Phase 2: used by explorer_get_historical_balance */
export interface EtherscanBalance {
  account: string;
  balance: string;
}

/** Phase 3: used by explorer_get_event_logs */
export interface EtherscanEventLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
  gasPrice: string;
  gasUsed: string;
  logIndex: string;
  transactionHash: string;
  transactionIndex: string;
}

/** Phase 3: used by explorer_get_native_price */
export interface EtherscanPrice {
  ethbtc: string;
  ethbtc_timestamp: string;
  ethusd: string;
  ethusd_timestamp: string;
}

/** Phase 3: used by explorer_get_historical_price */
export interface EtherscanHistoricalPrice {
  UTCDate: string;
  value: string;
}

/** Phase 3: used by explorer_get_native_supply */
export interface EtherscanSupply {
  EthSupply: string;
  Eth2Staking: string;
  BurntFees: string;
  WithdrawnTotal: string;
}
