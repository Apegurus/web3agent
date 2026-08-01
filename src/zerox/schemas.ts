import { z } from "zod";
import { addressSchema, hexSchema } from "../api/schemas/common.js";

export const zeroExIntegerSchema = z
  .string()
  .regex(/^\d+$/)
  .describe("Non-negative integer encoded as a decimal string");

export const zeroExDecimalSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .describe("Non-negative decimal encoded without exponent notation");

export const zeroExAllowanceSchema = z.object({
  spender: addressSchema.describe("0x allowance-holder spender address"),
});

export const zeroExIssuesSchema = z.object({
  allowance: zeroExAllowanceSchema.nullable().optional().describe("ERC-20 allowance requirement"),
});

export const zeroExTransactionSchema = z.object({
  to: addressSchema.describe("0x transaction target address"),
  data: hexSchema.describe("0x transaction calldata"),
  value: zeroExIntegerSchema.describe("Native transaction value in wei"),
});

export const zeroExPriceResponseSchema = z
  .object({
    buyAmount: zeroExIntegerSchema.describe("Quoted output amount in base units"),
    sellAmount: zeroExIntegerSchema.describe("Quoted input amount in base units"),
    liquidityAvailable: z.boolean().describe("Whether 0x found executable liquidity"),
    price: zeroExDecimalSchema.describe("Quoted normalized execution price"),
    issues: zeroExIssuesSchema.describe("0x quote execution issues"),
  })
  .passthrough();

export const zeroExQuoteResponseSchema = zeroExPriceResponseSchema.extend({
  transaction: zeroExTransactionSchema.describe("Executable 0x transaction request"),
});

export const zeroExQuoteRequestSchema = z.object({
  apiKey: z.string().min(1).describe("0x API key"),
  chainId: z.number().int().describe("EVM chain ID"),
  fromToken: addressSchema.describe("Input token address"),
  toToken: addressSchema.describe("Output token address"),
  fromAmount: zeroExIntegerSchema.describe("Input amount in base units"),
  taker: addressSchema.describe("Wallet receiving and submitting the swap"),
  slippageBps: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .describe("Maximum slippage from 0 to 10000 basis points"),
  referencePrice: zeroExDecimalSchema.optional().describe("Reference price for exact impact math"),
});

export const zeroExErrorBodySchema = z
  .object({
    code: z.string().optional().describe("Provider machine-readable error code"),
  })
  .passthrough();

export type ZeroExPriceResponse = z.infer<typeof zeroExPriceResponseSchema>;
export type ZeroExQuoteResponse = z.infer<typeof zeroExQuoteResponseSchema>;
export type ZeroExQuoteRequest = z.infer<typeof zeroExQuoteRequestSchema>;
