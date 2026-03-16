import { z } from "zod";
import { addressSchema, chainIdOptionalSchema, hexSchema, tokenAmountSchema } from "./common.js";

export const orbsGetQuoteSchema = tokenAmountSchema.extend({
  chainId: chainIdOptionalSchema,
  slippage: z.number().optional().describe("Slippage percentage (0.5 = 0.5%, default 0.5)"),
});

export const orbsSwapSchema = orbsGetQuoteSchema;

export const orbsPrepareSwapIntentSchema = orbsGetQuoteSchema.extend({
  account: addressSchema.describe("User wallet address"),
});

export const orbsGetRequiredApprovalsSchema = z.object({
  chainId: chainIdOptionalSchema,
  fromToken: z.string({ required_error: "fromToken is required" }).describe("Source token address"),
  fromAmount: z
    .string({ required_error: "fromAmount is required" })
    .describe("Amount in smallest token units"),
  account: addressSchema.describe("User wallet address"),
});

export const orbsPlaceTwapSchema = tokenAmountSchema.extend({
  chainId: chainIdOptionalSchema,
  chunks: z.number({ required_error: "chunks is required" }).describe("Number of TWAP intervals"),
  fillDelay: z
    .number({ required_error: "fillDelay is required" })
    .describe("Delay between fills in seconds"),
});

export const orbsPrepareTwapIntentSchema = orbsPlaceTwapSchema.extend({
  account: addressSchema.describe("User wallet address"),
});

export const orbsPlaceLimitSchema = tokenAmountSchema.extend({
  chainId: chainIdOptionalSchema,
  toMinAmount: z
    .string({ required_error: "toMinAmount is required" })
    .describe("Minimum output amount in smallest token units"),
  expiry: z.number().optional().describe("Order expiry as Unix timestamp"),
});

export const orbsPrepareLimitIntentSchema = orbsPlaceLimitSchema.extend({
  account: addressSchema.describe("User wallet address"),
});

export const orbsSubmitSignedSwapSchema = z.object({
  chainId: chainIdOptionalSchema,
  quote: z.record(z.unknown()).describe("Quote object from orbs_get_quote"),
  signature: hexSchema
    .refine((v) => v.length >= 132, {
      message: "signature must be at least 65 bytes (132 hex characters + 0x prefix)",
    })
    .describe("Hex-encoded signature of the permit2 typed data"),
});

export const orbsSubmitSignedTwapOrderSchema = z.object({
  order: z.record(z.unknown()).describe("Order object from orbs_place_twap"),
  signature: z
    .object({
      v: z.number({ required_error: "signature.v is required" }).describe("Recovery parameter"),
      r: z.string({ required_error: "signature.r is required" }).describe("ECDSA r value"),
      s: z.string({ required_error: "signature.s is required" }).describe("ECDSA s value"),
    })
    .describe("EIP-712 signature components"),
});

export const orbsSwapStatusSchema = z.object({
  chainId: chainIdOptionalSchema,
  sessionId: z
    .string({ required_error: "sessionId is required" })
    .describe("Session ID from swap submission"),
  user: z.string({ required_error: "user is required" }).describe("User wallet address"),
  maxAttempts: z.number().optional().describe("Max polling attempts (default 20)"),
});

export const orbsListOrdersSchema = z.object({
  chainId: chainIdOptionalSchema,
});

export const orbsPlaceOrderSchema = tokenAmountSchema.extend({
  chainId: chainIdOptionalSchema,
  fromMaxAmount: z
    .string()
    .optional()
    .describe("Total input amount for chunked orders (defaults to fromAmount for single orders)"),
  epoch: z
    .number()
    .optional()
    .describe("Seconds between chunk fills (0 for single, 60 default for chunked)"),
  slippage: z.number().optional().describe("Slippage tolerance in BPS (default 500 = 5%)"),
  outputLimit: z
    .string()
    .optional()
    .describe("Minimum output per chunk in output token units (0 = market order)"),
  outputTriggerLower: z
    .string()
    .optional()
    .describe("Lower trigger price per chunk for stop-loss orders"),
  outputTriggerUpper: z
    .string()
    .optional()
    .describe("Upper trigger price per chunk for take-profit orders"),
  start: z.number().optional().describe("Order start time as Unix timestamp (default: now)"),
  deadline: z
    .number()
    .optional()
    .describe("Order deadline as Unix timestamp (default: auto-calculated)"),
});

export const orbsPrepareOrderIntentSchema = orbsPlaceOrderSchema.extend({
  account: addressSchema.describe("Swapper wallet address"),
});

export const orbsSubmitSignedOrderSchema = z.object({
  submitUrl: z.string().describe("Submit URL from prepare step"),
  order: z.record(z.unknown()).describe("Order witness object from prepare step"),
  signature: hexSchema
    .refine((v) => v.length >= 132, {
      message: "signature must be at least 65 bytes (132 hex characters + 0x prefix)",
    })
    .describe("Hex-encoded EIP-712 signature"),
});

export const orbsQueryOrdersSchema = z
  .object({
    swapper: addressSchema.optional().describe("Filter orders by swapper address"),
    hash: z.string().optional().describe("Filter orders by order hash (0x-prefixed 32 bytes)"),
    chainId: chainIdOptionalSchema,
  })
  .refine((data) => data.swapper || data.hash, {
    message: "At least one of swapper or hash is required",
  });

export const orbsCancelOrderSchema = z.object({
  chainId: chainIdOptionalSchema,
  digest: hexSchema.describe("RePermit digest to cancel (from prepare step or query)"),
});
