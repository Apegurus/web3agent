import { z } from "zod";
import { addressSchema } from "../../api/schemas/common.js";
import {
  explorerAddressSchema,
  explorerBaseSchema,
  explorerBlockSchema,
  explorerContractSchema,
  explorerDateRangeSchema,
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
  .merge(explorerPaginatedSchema);

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

// --- Token Info / Supply / Holders ---

export const explorerGetTokenInfoSchema = explorerContractSchema;

export const explorerGetTokenSupplySchema = explorerContractSchema.extend({
  blockNumber: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Block number for historical supply (omit for latest)"),
});

export const explorerGetTokenHoldersSchema = explorerContractSchema.merge(explorerPaginatedSchema);

export const explorerGetTopTokenHoldersSchema = explorerContractSchema.extend({
  count: z.number().optional().describe("Number of top holders (default 10)"),
});

// --- Blocks ---

export const explorerGetBlockSchema = explorerBlockSchema;

// --- Block Timestamp / Rewards / Validator ---

export const explorerGetBlockByTimestampSchema = explorerBaseSchema.extend({
  timestamp: z.number().describe("Unix timestamp"),
  closest: z.enum(["before", "after"]).describe("Find block before or after timestamp"),
});

export const explorerGetBlockRewardsSchema = explorerBaseSchema.extend({
  blockNumber: z.number().int().nonnegative().describe("Block number"),
});

export const explorerGetBlocksByValidatorSchema =
  explorerAddressSchema.merge(explorerPaginatedSchema);

// --- Contract Creator / Bytecode ---

export const explorerGetContractCreatorSchema = explorerContractSchema;

export const explorerGetContractCodeSchema = explorerContractSchema;

// --- Event Logs ---

export const explorerGetEventLogsSchema = explorerAddressSchema
  .merge(explorerTimeRangeSchema)
  .extend({
    topic0: z.string().optional().describe("First topic (event signature hash)"),
    topic1: z.string().optional().describe("Second topic"),
    topic2: z.string().optional().describe("Third topic"),
    topic3: z.string().optional().describe("Fourth topic"),
  });

export const explorerGetEventLogsByTopicsSchema = explorerBaseSchema
  .merge(explorerTimeRangeSchema)
  .extend({
    topic0: z.string().describe("First topic (event signature hash) — required"),
    topic1: z.string().optional().describe("Second topic"),
    topic2: z.string().optional().describe("Third topic"),
    topic3: z.string().optional().describe("Fourth topic"),
  });

// --- Network Statistics ---

export const explorerGetDailyStatsSchema = explorerDateRangeSchema;

// --- Price & Supply ---

export const explorerGetNativePriceSchema = explorerBaseSchema;

export const explorerGetHistoricalPriceSchema = explorerDateRangeSchema;

export const explorerGetNativeSupplySchema = explorerBaseSchema;
