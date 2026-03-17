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
  txHash: z.string().describe("Transaction hash (0x-prefixed)"),
});

export const explorerContractSchema = explorerBaseSchema.extend({
  contractAddress: addressSchema.describe("Contract address (0x-prefixed)"),
});

export const explorerBlockSchema = explorerBaseSchema.extend({
  blockNumber: z.number().describe("Block number"),
  includeTxs: z.boolean().optional().describe("Include full transaction objects (default false)"),
});
