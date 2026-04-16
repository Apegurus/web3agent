import { z } from "zod";

// --- Accounts ---
export const explorerAddressInfoSchema = z.object({
  address: z.string().describe("Address hash"),
  balance: z.string().describe("Native token balance in wei"),
  balanceUsd: z.string().optional().describe("Balance value in USD"),
  isContract: z.boolean().describe("Whether the address is a contract"),
  isVerified: z.boolean().optional().describe("Whether the contract is verified"),
  name: z.string().optional().describe("Contract or ENS name"),
  ensDomain: z.string().optional().describe("ENS domain name"),
  tags: z.array(z.string()).optional().describe("Public tags/labels"),
  tokenHoldings: z.number().optional().describe("Number of distinct token types held"),
});

export const explorerTokenHoldingSchema = z.object({
  contractAddress: z.string().describe("Token contract address"),
  symbol: z.string().optional().describe("Token symbol"),
  name: z.string().optional().describe("Token name"),
  decimals: z.number().optional().describe("Token decimals"),
  balance: z.string().describe("Token balance in smallest units"),
  balanceUsd: z.string().optional().describe("Balance value in USD"),
  type: z.enum(["ERC-20", "ERC-721", "ERC-1155"]).describe("Token standard"),
});

export const explorerTokensByAddressSchema = z.object({
  address: z.string().describe("Queried address"),
  tokens: z.array(explorerTokenHoldingSchema).describe("Token holdings"),
  hasMore: z.boolean().optional().describe("Whether more pages are available"),
});

// --- Transactions ---
export const explorerTransactionSchema = z.object({
  hash: z.string().describe("Transaction hash"),
  blockNumber: z.number().describe("Block number"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  from: z.string().describe("Sender address"),
  to: z.string().optional().describe("Recipient address (null for contract creation)"),
  value: z.string().describe("Value transferred in wei"),
  gasUsed: z.string().optional().describe("Gas used"),
  gasPrice: z.string().optional().describe("Gas price in wei"),
  fee: z.string().optional().describe("Transaction fee in wei"),
  status: z.enum(["success", "failed", "pending"]).describe("Execution status"),
  method: z.string().optional().describe("Decoded method name"),
  nonce: z.number().optional().describe("Transaction nonce"),
});

export const explorerTxHistorySchema = z.object({
  transactions: z.array(explorerTransactionSchema).describe("Transaction list"),
  hasMore: z.boolean().optional().describe("Whether more pages are available"),
});

export const explorerTxDetailsSchema = explorerTransactionSchema.extend({
  input: z.string().optional().describe("Raw input data"),
  decodedInput: z.record(z.unknown()).optional().describe("Decoded function call parameters"),
  tokenTransfers: z
    .array(
      z.object({
        token: z.string().describe("Token contract address"),
        symbol: z.string().optional().describe("Token symbol"),
        from: z.string().describe("Transfer sender"),
        to: z.string().describe("Transfer recipient"),
        value: z.string().describe("Transfer amount"),
        type: z.string().optional().describe("Token type (ERC-20, ERC-721, etc.)"),
      })
    )
    .optional()
    .describe("Token transfers within this transaction"),
  logs: z.number().optional().describe("Number of event logs emitted"),
});

export const explorerTxReceiptSchema = z.object({
  hash: z.string().describe("Transaction hash"),
  status: z.enum(["success", "failed", "pending"]).describe("Execution status"),
  blockNumber: z.number().describe("Block number"),
  gasUsed: z.string().describe("Gas used"),
  effectiveGasPrice: z.string().optional().describe("Effective gas price"),
  cumulativeGasUsed: z.string().optional().describe("Cumulative gas used in block"),
  contractAddress: z
    .string()
    .optional()
    .describe("Created contract address (if contract creation)"),
  logsCount: z.number().optional().describe("Number of logs emitted"),
  revertReason: z.string().optional().describe("Revert reason (if failed)"),
});

// --- Token Transfers ---
export const explorerTokenTransferSchema = z.object({
  hash: z.string().describe("Transaction hash"),
  blockNumber: z.number().describe("Block number"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  from: z.string().describe("Sender address"),
  to: z.string().describe("Recipient address"),
  token: z.string().describe("Token contract address"),
  symbol: z.string().optional().describe("Token symbol"),
  decimals: z.number().optional().describe("Token decimals"),
  value: z.string().describe("Transfer amount in smallest units (or token ID for NFTs)"),
  type: z.string().optional().describe("Token type (ERC-20, ERC-721, ERC-1155)"),
});

export const explorerTokenTransfersSchema = z.object({
  transfers: z.array(explorerTokenTransferSchema).describe("Token transfer list"),
  hasMore: z.boolean().optional().describe("Whether more pages are available"),
});

export const explorerNftItemSchema = z.object({
  contractAddress: z.string().describe("NFT contract address"),
  name: z.string().optional().describe("Collection name"),
  symbol: z.string().optional().describe("Collection symbol"),
  tokenId: z.string().describe("Token ID"),
  tokenType: z.enum(["ERC-721", "ERC-1155"]).describe("Token standard"),
  balance: z.string().optional().describe("Balance (for ERC-1155)"),
  metadata: z.record(z.unknown()).optional().describe("Token metadata"),
});

export const explorerNftInventorySchema = z.object({
  address: z.string().describe("Queried address"),
  nfts: z.array(explorerNftItemSchema).describe("NFT holdings"),
  hasMore: z.boolean().optional().describe("Whether more pages are available"),
});

// --- Contracts ---
export const explorerContractAbiSchema = z.object({
  contractAddress: z.string().describe("Contract address"),
  abi: z.array(z.record(z.unknown())).describe("Contract ABI as JSON array"),
  name: z.string().optional().describe("Contract name"),
  compiler: z.string().optional().describe("Compiler version"),
  isProxy: z.boolean().optional().describe("Whether the contract is a proxy"),
  implementationAddress: z.string().optional().describe("Implementation address (if proxy)"),
});

export const explorerContractSourceSchema = z.object({
  contractAddress: z.string().describe("Contract address"),
  name: z.string().optional().describe("Contract name"),
  compiler: z.string().optional().describe("Compiler version"),
  optimizationEnabled: z.boolean().optional().describe("Whether optimization was enabled"),
  sourceCode: z.string().describe("Verified source code (main file or flattened)"),
  additionalSources: z
    .array(
      z.object({
        filename: z.string().describe("Source file name"),
        code: z.string().describe("Source code content"),
      })
    )
    .optional()
    .describe("Additional source files"),
  constructorArgs: z.string().optional().describe("Constructor arguments (hex-encoded)"),
});

// --- Historical Balance ---
export const explorerHistoricalBalanceSchema = z.object({
  address: z.string().describe("Address hash"),
  balance: z.string().describe("Balance in wei at the given block"),
  blockNumber: z.number().describe("Block number queried"),
  chainId: z.number().describe("Chain ID"),
});

// --- Internal Transactions ---
export const explorerInternalTxSchema = z.object({
  hash: z.string().describe("Parent transaction hash"),
  blockNumber: z.number().describe("Block number"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  from: z.string().describe("Sender address"),
  to: z.string().describe("Recipient address"),
  value: z.string().describe("Value transferred in wei"),
  gasUsed: z.string().describe("Gas used by internal call"),
  type: z.string().describe("Internal transaction type (e.g. call, create, delegatecall)"),
  traceId: z.string().describe("Trace ID within the transaction"),
  errCode: z.string().optional().describe("Error code if the internal tx failed"),
  isError: z.boolean().describe("Whether the internal transaction failed"),
});

export const explorerInternalTxsSchema = z.object({
  transactions: z.array(explorerInternalTxSchema).describe("Internal transaction list"),
  hasMore: z.boolean().optional().describe("Whether more pages are available"),
});

// --- Execution Status ---
export const explorerTxExecutionStatusSchema = z.object({
  isError: z.boolean().describe("Whether the transaction execution failed"),
  errDescription: z.string().optional().describe("Error description if execution failed"),
});

// --- Token Info ---
export const explorerTokenInfoSchema = z.object({
  contractAddress: z.string().describe("Token contract address"),
  name: z.string().describe("Token name"),
  symbol: z.string().describe("Token symbol"),
  decimals: z.number().describe("Token decimals (derived from divisor)"),
  totalSupply: z.string().describe("Total token supply in smallest units"),
  tokenType: z.string().describe("Token standard (e.g. ERC-20, ERC-721)"),
  website: z.string().optional().describe("Project website URL"),
  description: z.string().optional().describe("Token description"),
  socialProfiles: z
    .record(z.string())
    .optional()
    .describe("Social media links (twitter, discord, telegram, github, etc.)"),
});

export const explorerTokenSupplySchema = z.object({
  contractAddress: z.string().describe("Token contract address"),
  totalSupply: z.string().describe("Total token supply in smallest units"),
  decimals: z.number().optional().describe("Token decimals (derived from divisor)"),
});

export const explorerTokenHolderSchema = z.object({
  address: z.string().describe("Token holder address"),
  balance: z.string().describe("Token balance in smallest units"),
  share: z.number().optional().describe("Percentage share of total supply"),
});

export const explorerTokenHoldersSchema = z.object({
  holders: z.array(explorerTokenHolderSchema).describe("Token holders list"),
  hasMore: z.boolean().optional().describe("Whether more pages are available"),
});

// --- Block Timestamp / Rewards ---
export const explorerBlockByTimestampSchema = z.object({
  blockNumber: z.number().describe("Block number closest to the given timestamp"),
});

export const explorerBlockRewardUncleSchema = z.object({
  miner: z.string().describe("Uncle block miner address"),
  unclePosition: z.number().describe("Uncle position in the block"),
  blockreward: z.string().describe("Uncle block reward in wei"),
});

export const explorerBlockRewardsSchema = z.object({
  blockNumber: z.number().describe("Block number"),
  miner: z.string().describe("Block miner/validator address"),
  blockReward: z.string().describe("Block reward in wei"),
  uncleInclusionReward: z.string().describe("Uncle inclusion reward in wei"),
  uncles: z.array(explorerBlockRewardUncleSchema).describe("Uncle blocks included in this block"),
});

// --- Contract Creator / Bytecode ---
export const explorerContractCreatorSchema = z.object({
  contractAddress: z.string().describe("Contract address"),
  creatorAddress: z.string().describe("Address that deployed the contract"),
  txHash: z.string().describe("Contract creation transaction hash"),
});

export const explorerContractCodeSchema = z.object({
  contractAddress: z.string().describe("Contract address"),
  bytecode: z.string().describe("Deployed bytecode (hex-encoded)"),
});

// --- Event Logs ---
export const explorerEventLogSchema = z.object({
  address: z.string().describe("Contract address that emitted the event"),
  topics: z.array(z.string()).describe("Event topics (indexed parameters)"),
  data: z.string().describe("Event data (non-indexed parameters)"),
  blockNumber: z.number().describe("Block number"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  txHash: z.string().describe("Transaction hash"),
  logIndex: z.number().describe("Log index within the block"),
});

export const explorerEventLogsSchema = z.object({
  logs: z.array(explorerEventLogSchema).describe("Event logs"),
  hasMore: z.boolean().optional().describe("Whether more logs are available"),
});

// --- Network Statistics ---
export const explorerDailyStatSchema = z.object({
  date: z.string().describe("Date (YYYY-MM-DD)"),
  value: z.string().describe("Statistic value for the day"),
});

export const explorerDailyStatsSchema = z.object({
  stats: z.array(explorerDailyStatSchema).describe("Daily statistics"),
  metric: z.string().describe("Name of the metric"),
});

// --- Price & Supply ---
export const explorerNativePriceSchema = z.object({
  priceUsd: z.string().describe("Current price in USD"),
  priceBtc: z.string().describe("Current price in BTC"),
  timestamp: z.string().describe("Price timestamp"),
});

export const explorerHistoricalPriceEntrySchema = z.object({
  date: z.string().describe("Date (YYYY-MM-DD)"),
  priceUsd: z.string().describe("Price in USD"),
});

export const explorerHistoricalPriceSchema = z.object({
  prices: z.array(explorerHistoricalPriceEntrySchema).describe("Historical daily prices"),
});

export const explorerNativeSupplySchema = z.object({
  totalSupply: z.string().describe("Total native token supply"),
  stakedAmount: z.string().optional().describe("ETH2 staking amount"),
  burnedFees: z.string().optional().describe("EIP-1559 burned fees"),
  withdrawnTotal: z.string().optional().describe("Total withdrawn from beacon chain"),
});

// --- Blocks ---
export const explorerBlockInfoSchema = z.object({
  number: z.number().describe("Block number"),
  hash: z.string().describe("Block hash"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  parentHash: z.string().describe("Parent block hash"),
  miner: z.string().describe("Miner/validator address"),
  gasUsed: z.string().describe("Total gas used"),
  gasLimit: z.string().describe("Block gas limit"),
  baseFeePerGas: z.string().optional().describe("Base fee per gas (EIP-1559)"),
  txCount: z.number().describe("Number of transactions"),
  reward: z.string().optional().describe("Block reward in wei"),
});
