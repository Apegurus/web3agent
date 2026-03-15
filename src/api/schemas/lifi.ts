import { z } from "zod";
import { addressSchema } from "./common.js";

export const lifiGetQuoteSchema = z.object({
  fromChainId: z.number({ required_error: "fromChainId is required" }).describe("Source chain ID"),
  toChainId: z.number({ required_error: "toChainId is required" }).describe("Destination chain ID"),
  fromTokenAddress: z
    .string({ required_error: "fromTokenAddress is required" })
    .describe("Source token address"),
  toTokenAddress: z
    .string({ required_error: "toTokenAddress is required" })
    .describe("Destination token address"),
  fromAmount: z
    .string({ required_error: "fromAmount is required" })
    .describe("Amount in smallest token units"),
});

export const lifiExecuteBridgeSchema = lifiGetQuoteSchema;

export const lifiPrepareBridgeIntentSchema = lifiGetQuoteSchema.extend({
  account: addressSchema.describe("Sender wallet address"),
  approvalAmount: z.string().optional().describe("Optional override for the token approval amount"),
});
