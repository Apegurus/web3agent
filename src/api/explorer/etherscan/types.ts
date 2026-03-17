export interface EtherscanResponse<T = unknown> {
  status: "0" | "1";
  message: string;
  result: T;
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

export interface EtherscanBlock {
  blockNumber: string;
  timeStamp: string;
  blockMiner: string;
  blockReward: string;
  uncles: Array<{ miner: string; unclePosition: string; blockreward: string }>;
  uncleInclusionReward: string;
}

export interface EtherscanTxStatus {
  isError: "0" | "1";
  errDescription: string;
}

export interface EtherscanTxReceiptStatus {
  status: "" | "0" | "1";
}

export interface EtherscanContractCreator {
  contractAddress: string;
  contractCreator: string;
  txHash: string;
}

export interface EtherscanBalance {
  account: string;
  balance: string;
}
