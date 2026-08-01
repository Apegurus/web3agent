import { z } from "zod";
import { chainIdOptionalSchema, tokenAmountSchema } from "./common.js";

export const zeroExSwapSchema = tokenAmountSchema.extend({
  chainId: chainIdOptionalSchema,
  slippageBps: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .describe("Maximum slippage from 0 to 10000 basis points"),
  referencePrice: z
    .string()
    .regex(/^\d+(?:\.\d+)?$/)
    .optional()
    .describe("Optional normalized reference price for exact price-impact reporting"),
});
