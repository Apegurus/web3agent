import { z } from "zod";
import { addressSchema } from "../../api/schemas/common.js";
import {
  explorerAddressSchema,
  explorerBlockSchema,
  explorerContractSchema,
  explorerPaginatedSchema,
  explorerTimeRangeSchema,
  explorerTxHashSchema,
} from "../../api/schemas/explorer.js";

// --- Accounts ---

export const explorerGetAddressInfoSchema = explorerAddressSchema;

export const explorerGetTokensByAddressSchema =
  explorerAddressSchema.merge(explorerPaginatedSchema);

// --- Historical Balance ---

export const explorerGetHistoricalBalanceSchema = explorerAddressSchema.extend({
  blockNumber: z.number().int().nonnegative().describe("Block number for historical query"),
});

export const explorerGetHistoricalTokenBalanceSchema = explorerAddressSchema.extend({
  blockNumber: z.number().int().nonnegative().describe("Block number for historical query"),
  contractAddress: addressSchema.describe("Token contract address"),
});

export const explorerGetAddressFundedBySchema = explorerAddressSchema;

// --- Transactions ---

export const explorerGetTxHistorySchema = explorerAddressSchema
  .merge(explorerTimeRangeSchema)
  .merge(explorerPaginatedSchema)
  .extend({
    method: z.string().optional().describe("Filter by method name"),
  });

export const explorerGetInternalTxsSchema = explorerAddressSchema
  .merge(explorerTimeRangeSchema)
  .merge(explorerPaginatedSchema);

export const explorerGetTxExecutionStatusSchema = explorerTxHashSchema;

export const explorerGetTxDetailsSchema = explorerTxHashSchema;

export const explorerGetTxReceiptSchema = explorerTxHashSchema;

// --- Token Transfers ---

export const explorerGetTokenTransfersSchema = explorerAddressSchema
  .merge(explorerTimeRangeSchema)
  .merge(explorerPaginatedSchema)
  .extend({
    tokenContract: addressSchema.optional().describe("Filter by token contract address"),
  });

export const explorerGetNftTransfersSchema = explorerAddressSchema
  .merge(explorerTimeRangeSchema)
  .merge(explorerPaginatedSchema)
  .extend({
    tokenContract: addressSchema.optional().describe("Filter by NFT contract address"),
  });

export const explorerGetNftInventorySchema = explorerAddressSchema.merge(explorerPaginatedSchema);

// --- Contracts ---

export const explorerGetContractAbiSchema = explorerContractSchema;

export const explorerGetContractSourceSchema = explorerContractSchema;

// --- Blocks ---

export const explorerGetBlockSchema = explorerBlockSchema;
