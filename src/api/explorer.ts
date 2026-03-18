import {
  explorerGetAddressFundedBySchema,
  explorerGetAddressInfoSchema,
  explorerGetBlockByTimestampSchema,
  explorerGetBlockRewardsSchema,
  explorerGetBlockSchema,
  explorerGetBlocksByValidatorSchema,
  explorerGetContractAbiSchema,
  explorerGetContractCodeSchema,
  explorerGetContractCreatorSchema,
  explorerGetContractSourceSchema,
  explorerGetDailyStatsSchema,
  explorerGetEventLogsByTopicsSchema,
  explorerGetEventLogsSchema,
  explorerGetHistoricalBalanceSchema,
  explorerGetHistoricalPriceSchema,
  explorerGetHistoricalTokenBalanceSchema,
  explorerGetInternalTxsSchema,
  explorerGetNativePriceSchema,
  explorerGetNativeSupplySchema,
  explorerGetNftInventorySchema,
  explorerGetNftTransfersSchema,
  explorerGetTokenHoldersSchema,
  explorerGetTokenInfoSchema,
  explorerGetTokenSupplySchema,
  explorerGetTokenTransfersSchema,
  explorerGetTokensByAddressSchema,
  explorerGetTopTokenHoldersSchema,
  explorerGetTxDetailsSchema,
  explorerGetTxExecutionStatusSchema,
  explorerGetTxHistorySchema,
  explorerGetTxReceiptSchema,
} from "../tools/explorer/schemas.js";
import { getRuntime, invokeAndRequireData } from "./shared.js";
import type {
  ExplorerAddressInfo,
  ExplorerBlockByTimestamp,
  ExplorerBlockInfo,
  ExplorerBlockRewards,
  ExplorerContractAbi,
  ExplorerContractCode,
  ExplorerContractCreator,
  ExplorerContractSource,
  ExplorerDailyStats,
  ExplorerEventLogs,
  ExplorerHistoricalBalance,
  ExplorerHistoricalPrice,
  ExplorerInternalTxs,
  ExplorerNativePrice,
  ExplorerNativeSupply,
  ExplorerNftInventory,
  ExplorerTokenHolders,
  ExplorerTokenInfo,
  ExplorerTokenSupply,
  ExplorerTokenTransfers,
  ExplorerTokensByAddress,
  ExplorerTxDetails,
  ExplorerTxExecutionStatus,
  ExplorerTxHistory,
  ExplorerTxReceipt,
  RuntimeBoundOptions,
} from "./types.js";
import { parseInput } from "./validation.js";

/** Factory for daily stats SDK functions — all share the same schema and tool-name pattern */
function makeDailyStatsSDK(
  toolName: string
): (
  params: { chainId: number; startDate: string; endDate: string; sort?: "asc" | "desc" },
  options?: RuntimeBoundOptions
) => Promise<ExplorerDailyStats> {
  return async (params, options) => {
    const input = parseInput(explorerGetDailyStatsSchema, params);
    const runtime = await getRuntime(options);
    return invokeAndRequireData<ExplorerDailyStats>(runtime, toolName, input);
  };
}

export async function getAddressInfo(
  params: { chainId: number; address: string },
  options?: RuntimeBoundOptions
): Promise<ExplorerAddressInfo> {
  const input = parseInput(explorerGetAddressInfoSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerAddressInfo>(runtime, "explorer_get_address_info", input);
}

export async function getTokensByAddress(
  params: { chainId: number; address: string; page?: number; pageSize?: number },
  options?: RuntimeBoundOptions
): Promise<ExplorerTokensByAddress> {
  const input = parseInput(explorerGetTokensByAddressSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerTokensByAddress>(
    runtime,
    "explorer_get_tokens_by_address",
    input
  );
}

export async function getTransactionHistory(
  params: {
    chainId: number;
    address: string;
    startBlock?: number;
    endBlock?: number;
    page?: number;
    pageSize?: number;
  },
  options?: RuntimeBoundOptions
): Promise<ExplorerTxHistory> {
  const input = parseInput(explorerGetTxHistorySchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerTxHistory>(runtime, "explorer_get_tx_history", input);
}

export async function getTransactionDetails(
  params: { chainId: number; txHash: string },
  options?: RuntimeBoundOptions
): Promise<ExplorerTxDetails> {
  const input = parseInput(explorerGetTxDetailsSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerTxDetails>(runtime, "explorer_get_tx_details", input);
}

export async function getTransactionReceipt(
  params: { chainId: number; txHash: string },
  options?: RuntimeBoundOptions
): Promise<ExplorerTxReceipt> {
  const input = parseInput(explorerGetTxReceiptSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerTxReceipt>(runtime, "explorer_get_tx_receipt", input);
}

export async function getTokenTransfers(
  params: {
    chainId: number;
    address: string;
    tokenContract?: string;
    startBlock?: number;
    endBlock?: number;
    page?: number;
    pageSize?: number;
  },
  options?: RuntimeBoundOptions
): Promise<ExplorerTokenTransfers> {
  const input = parseInput(explorerGetTokenTransfersSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerTokenTransfers>(
    runtime,
    "explorer_get_token_transfers",
    input
  );
}

export async function getNftInventory(
  params: { chainId: number; address: string; page?: number; pageSize?: number },
  options?: RuntimeBoundOptions
): Promise<ExplorerNftInventory> {
  const input = parseInput(explorerGetNftInventorySchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerNftInventory>(runtime, "explorer_get_nft_inventory", input);
}

export async function getContractAbi(
  params: { chainId: number; contractAddress: string },
  options?: RuntimeBoundOptions
): Promise<ExplorerContractAbi> {
  const input = parseInput(explorerGetContractAbiSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerContractAbi>(runtime, "explorer_get_contract_abi", input);
}

export async function getContractSource(
  params: { chainId: number; contractAddress: string },
  options?: RuntimeBoundOptions
): Promise<ExplorerContractSource> {
  const input = parseInput(explorerGetContractSourceSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerContractSource>(
    runtime,
    "explorer_get_contract_source",
    input
  );
}

export async function getBlock(
  params: { chainId: number; blockNumber: number },
  options?: RuntimeBoundOptions
): Promise<ExplorerBlockInfo> {
  const input = parseInput(explorerGetBlockSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerBlockInfo>(runtime, "explorer_get_block", input);
}

export async function getHistoricalBalance(
  params: { chainId: number; address: string; blockNumber: number },
  options?: RuntimeBoundOptions
): Promise<ExplorerHistoricalBalance> {
  const input = parseInput(explorerGetHistoricalBalanceSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerHistoricalBalance>(
    runtime,
    "explorer_get_historical_balance",
    input
  );
}

export async function getHistoricalTokenBalance(
  params: { chainId: number; address: string; blockNumber: number; contractAddress: string },
  options?: RuntimeBoundOptions
): Promise<ExplorerHistoricalBalance> {
  const input = parseInput(explorerGetHistoricalTokenBalanceSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerHistoricalBalance>(
    runtime,
    "explorer_get_historical_token_balance",
    input
  );
}

export async function getAddressFundedBy(
  params: { chainId: number; address: string },
  options?: RuntimeBoundOptions
): Promise<ExplorerTxHistory> {
  const input = parseInput(explorerGetAddressFundedBySchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerTxHistory>(runtime, "explorer_get_address_funded_by", input);
}

export async function getInternalTransactions(
  params: {
    chainId: number;
    address: string;
    startBlock?: number;
    endBlock?: number;
    page?: number;
    pageSize?: number;
  },
  options?: RuntimeBoundOptions
): Promise<ExplorerInternalTxs> {
  const input = parseInput(explorerGetInternalTxsSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerInternalTxs>(runtime, "explorer_get_internal_txs", input);
}

export async function getTransactionExecutionStatus(
  params: { chainId: number; txHash: string },
  options?: RuntimeBoundOptions
): Promise<ExplorerTxExecutionStatus> {
  const input = parseInput(explorerGetTxExecutionStatusSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerTxExecutionStatus>(
    runtime,
    "explorer_get_tx_execution_status",
    input
  );
}

export async function getNftTransfers(
  params: {
    chainId: number;
    address: string;
    tokenContract?: string;
    startBlock?: number;
    endBlock?: number;
    page?: number;
    pageSize?: number;
  },
  options?: RuntimeBoundOptions
): Promise<ExplorerTokenTransfers> {
  const input = parseInput(explorerGetNftTransfersSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerTokenTransfers>(runtime, "explorer_get_nft_transfers", input);
}

export async function getTokenInfo(
  params: { chainId: number; contractAddress: string },
  options?: RuntimeBoundOptions
): Promise<ExplorerTokenInfo> {
  const input = parseInput(explorerGetTokenInfoSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerTokenInfo>(runtime, "explorer_get_token_info", input);
}

export async function getTokenSupply(
  params: { chainId: number; contractAddress: string; blockNumber?: number },
  options?: RuntimeBoundOptions
): Promise<ExplorerTokenSupply> {
  const input = parseInput(explorerGetTokenSupplySchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerTokenSupply>(runtime, "explorer_get_token_supply", input);
}

export async function getTokenHolders(
  params: { chainId: number; contractAddress: string; page?: number; pageSize?: number },
  options?: RuntimeBoundOptions
): Promise<ExplorerTokenHolders> {
  const input = parseInput(explorerGetTokenHoldersSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerTokenHolders>(runtime, "explorer_get_token_holders", input);
}

export async function getTopTokenHolders(
  params: { chainId: number; contractAddress: string; count?: number },
  options?: RuntimeBoundOptions
): Promise<ExplorerTokenHolders> {
  const input = parseInput(explorerGetTopTokenHoldersSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerTokenHolders>(
    runtime,
    "explorer_get_top_token_holders",
    input
  );
}

export async function getBlockByTimestamp(
  params: { chainId: number; timestamp: number; closest: "before" | "after" },
  options?: RuntimeBoundOptions
): Promise<ExplorerBlockByTimestamp> {
  const input = parseInput(explorerGetBlockByTimestampSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerBlockByTimestamp>(
    runtime,
    "explorer_get_block_by_timestamp",
    input
  );
}

export async function getBlockRewards(
  params: { chainId: number; blockNumber: number },
  options?: RuntimeBoundOptions
): Promise<ExplorerBlockRewards> {
  const input = parseInput(explorerGetBlockRewardsSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerBlockRewards>(runtime, "explorer_get_block_rewards", input);
}

export async function getBlocksByValidator(
  params: { chainId: number; address: string; page?: number; pageSize?: number },
  options?: RuntimeBoundOptions
): Promise<{ blocks: ExplorerBlockInfo[]; hasMore: boolean }> {
  const input = parseInput(explorerGetBlocksByValidatorSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<{ blocks: ExplorerBlockInfo[]; hasMore: boolean }>(
    runtime,
    "explorer_get_blocks_by_validator",
    input
  );
}

export async function getContractCreator(
  params: { chainId: number; contractAddress: string },
  options?: RuntimeBoundOptions
): Promise<ExplorerContractCreator> {
  const input = parseInput(explorerGetContractCreatorSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerContractCreator>(
    runtime,
    "explorer_get_contract_creator",
    input
  );
}

export async function getContractCode(
  params: { chainId: number; contractAddress: string },
  options?: RuntimeBoundOptions
): Promise<ExplorerContractCode> {
  const input = parseInput(explorerGetContractCodeSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerContractCode>(runtime, "explorer_get_contract_code", input);
}

export async function getEventLogs(
  params: {
    chainId: number;
    address: string;
    startBlock?: number;
    endBlock?: number;
    topic0?: string;
    topic1?: string;
    topic2?: string;
    topic3?: string;
  },
  options?: RuntimeBoundOptions
): Promise<ExplorerEventLogs> {
  const input = parseInput(explorerGetEventLogsSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerEventLogs>(runtime, "explorer_get_event_logs", input);
}

export async function getEventLogsByTopics(
  params: {
    chainId: number;
    startBlock?: number;
    endBlock?: number;
    topic0: string;
    topic1?: string;
    topic2?: string;
    topic3?: string;
  },
  options?: RuntimeBoundOptions
): Promise<ExplorerEventLogs> {
  const input = parseInput(explorerGetEventLogsByTopicsSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerEventLogs>(
    runtime,
    "explorer_get_event_logs_by_topics",
    input
  );
}

export const getDailyTxCount = makeDailyStatsSDK("explorer_get_daily_tx_count");
export const getDailyGasUsed = makeDailyStatsSDK("explorer_get_daily_gas_used");
export const getDailyNewAddresses = makeDailyStatsSDK("explorer_get_daily_new_addresses");
export const getDailyBlockRewards = makeDailyStatsSDK("explorer_get_daily_block_rewards");
export const getNetworkUtilization = makeDailyStatsSDK("explorer_get_network_utilization");

export async function getNativePrice(
  params: { chainId: number },
  options?: RuntimeBoundOptions
): Promise<ExplorerNativePrice> {
  const input = parseInput(explorerGetNativePriceSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerNativePrice>(runtime, "explorer_get_native_price", input);
}

export async function getHistoricalPrice(
  params: { chainId: number; startDate: string; endDate: string; sort?: "asc" | "desc" },
  options?: RuntimeBoundOptions
): Promise<ExplorerHistoricalPrice> {
  const input = parseInput(explorerGetHistoricalPriceSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerHistoricalPrice>(
    runtime,
    "explorer_get_historical_price",
    input
  );
}

export async function getNativeSupply(
  params: { chainId: number },
  options?: RuntimeBoundOptions
): Promise<ExplorerNativeSupply> {
  const input = parseInput(explorerGetNativeSupplySchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ExplorerNativeSupply>(runtime, "explorer_get_native_supply", input);
}
