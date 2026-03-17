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
  mode: z
    .enum(["swap", "order"])
    .optional()
    .default("swap")
    .describe("Approval mode: 'swap' checks Permit2, 'order' checks RePermit"),
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
  exactApproval: z
    .boolean()
    .optional()
    .describe("If true, approve only the exact amount needed instead of unlimited"),
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
  digest: hexSchema
    .refine((v) => v.length === 66, {
      message: "digest must be a 32-byte hex value (66 characters with 0x prefix)",
    })
    .describe("RePermit digest to cancel (from prepare step or query)"),
});
