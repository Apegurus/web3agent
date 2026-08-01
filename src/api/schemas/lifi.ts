import { z } from "zod";
import { addressSchema, tokenAmountSchema } from "./common.js";

export const lifiGetQuoteSchema = tokenAmountSchema.extend({
  fromChainId: z.number({ required_error: "fromChainId is required" }).describe("Source chain ID"),
  toChainId: z.number({ required_error: "toChainId is required" }).describe("Destination chain ID"),
  slippagePct: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Maximum slippage percentage (0.5 = 0.5%)"),
});

export const lifiExecuteBridgeSchema = lifiGetQuoteSchema;

export const lifiPrepareBridgeIntentSchema = lifiGetQuoteSchema.extend({
  account: addressSchema.describe("Sender wallet address"),
  approvalAmount: z.string().optional().describe("Optional override for the token approval amount"),
});

export const lifiPrepareSameChainSwapSchema = tokenAmountSchema.extend({
  fromChainId: z.literal(4663).describe("Robinhood source chain ID"),
  toChainId: z.literal(4663).describe("Robinhood destination chain ID"),
  account: addressSchema.describe("Sender wallet address"),
  approvalAmount: z.string().optional().describe("Optional override for the token approval amount"),
  slippagePct: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Maximum slippage percentage (0.5 = 0.5%)"),
});
