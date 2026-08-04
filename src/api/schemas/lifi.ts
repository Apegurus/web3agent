import { z } from "zod";
import { addressSchema, tokenAmountSchema } from "./common.js";

const lifiBridgeFields = {
  fromChainId: z.number({ required_error: "fromChainId is required" }).describe("Source chain ID"),
  toChainId: z.number({ required_error: "toChainId is required" }).describe("Destination chain ID"),
  slippagePct: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Maximum slippage percentage (0.5 = 0.5%)"),
};

const requireCrossChain = <T extends { fromChainId: number; toChainId: number }>(input: T) =>
  input.fromChainId !== input.toChainId;

export const lifiGetQuoteSchema = tokenAmountSchema
  .extend(lifiBridgeFields)
  .refine(requireCrossChain, {
    message: "LI.FI bridge source and destination chains must differ",
    path: ["toChainId"],
  });

export const lifiExecuteBridgeSchema = lifiGetQuoteSchema;

export const lifiPrepareBridgeIntentBaseSchema = tokenAmountSchema.extend({
  ...lifiBridgeFields,
  account: addressSchema.describe("Sender wallet address"),
  approvalAmount: z.string().optional().describe("Optional override for the token approval amount"),
});

export const lifiPrepareBridgeIntentSchema = lifiPrepareBridgeIntentBaseSchema.refine(
  requireCrossChain,
  {
    message: "LI.FI bridge source and destination chains must differ",
    path: ["toChainId"],
  }
);

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
