import {
  explorerGetAddressFundedBySchema,
  explorerGetAddressInfoSchema,
  explorerGetBlockSchema,
  explorerGetContractAbiSchema,
  explorerGetContractSourceSchema,
  explorerGetHistoricalBalanceSchema,
  explorerGetHistoricalTokenBalanceSchema,
  explorerGetInternalTxsSchema,
  explorerGetNftInventorySchema,
  explorerGetNftTransfersSchema,
  explorerGetTokenTransfersSchema,
  explorerGetTokensByAddressSchema,
  explorerGetTxDetailsSchema,
  explorerGetTxExecutionStatusSchema,
  explorerGetTxHistorySchema,
  explorerGetTxReceiptSchema,
} from "../tools/explorer/schemas.js";
import { getRuntime, invokeAndRequireData } from "./shared.js";
import type {
  ExplorerAddressInfo,
  ExplorerBlockInfo,
  ExplorerContractAbi,
  ExplorerContractSource,
  ExplorerHistoricalBalance,
  ExplorerInternalTxs,
  ExplorerNftInventory,
  ExplorerTokenTransfers,
  ExplorerTokensByAddress,
  ExplorerTxDetails,
  ExplorerTxExecutionStatus,
  ExplorerTxHistory,
  ExplorerTxReceipt,
  RuntimeBoundOptions,
} from "./types.js";
import { parseInput } from "./validation.js";

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
    method?: string;
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
  params: { chainId: number; blockNumber: number; includeTxs?: boolean },
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
