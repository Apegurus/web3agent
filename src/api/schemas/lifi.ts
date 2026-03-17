import { z } from "zod";
import { addressSchema, tokenAmountSchema } from "./common.js";

export const lifiGetQuoteSchema = tokenAmountSchema.extend({
  fromChainId: z.number({ required_error: "fromChainId is required" }).describe("Source chain ID"),
  toChainId: z.number({ required_error: "toChainId is required" }).describe("Destination chain ID"),
});

export const lifiExecuteBridgeSchema = lifiGetQuoteSchema;

export const lifiPrepareBridgeIntentSchema = lifiGetQuoteSchema.extend({
  account: addressSchema.describe("Sender wallet address"),
  approvalAmount: z.string().optional().describe("Optional override for the token approval amount"),
});
