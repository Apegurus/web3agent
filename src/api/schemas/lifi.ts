import { z } from "zod";
import { addressSchema } from "./common.js";

export const lifiGetQuoteSchema = z.object({
  fromChainId: z.number({ required_error: "fromChainId is required" }),
  toChainId: z.number({ required_error: "toChainId is required" }),
  fromTokenAddress: z.string({ required_error: "fromTokenAddress is required" }),
  toTokenAddress: z.string({ required_error: "toTokenAddress is required" }),
  fromAmount: z.string({ required_error: "fromAmount is required" }),
});

export const lifiExecuteBridgeSchema = lifiGetQuoteSchema;

export const lifiPrepareBridgeIntentSchema = lifiGetQuoteSchema.extend({
  account: addressSchema,
  approvalAmount: z.string().optional(),
});
