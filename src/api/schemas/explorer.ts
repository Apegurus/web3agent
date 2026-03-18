import { z } from "zod";
import { addressSchema, chainIdRequiredSchema } from "./common.js";

export const explorerBaseSchema = z.object({
  chainId: chainIdRequiredSchema,
});

export const explorerAddressSchema = explorerBaseSchema.extend({
  address: addressSchema.describe("Target address (0x-prefixed)"),
});

export const explorerPaginatedSchema = z.object({
  page: z.number().optional().describe("Page number (starts at 1)"),
  pageSize: z.number().optional().describe("Results per page (default varies by endpoint)"),
});

export const explorerTimeRangeSchema = z.object({
  startBlock: z.number().optional().describe("Start block number"),
  endBlock: z.number().optional().describe("End block number"),
});

export const explorerTxHashSchema = explorerBaseSchema.extend({
  txHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .describe("Transaction hash (0x-prefixed, 64 hex chars)"),
});

export const explorerContractSchema = explorerBaseSchema.extend({
  contractAddress: addressSchema.describe("Contract address (0x-prefixed)"),
});

export const explorerDateRangeSchema = explorerBaseSchema.extend({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort order (default asc)"),
});

export const explorerBlockSchema = explorerBaseSchema.extend({
  blockNumber: z.number().int().nonnegative().describe("Block number"),
});
