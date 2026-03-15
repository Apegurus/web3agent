import { z } from "zod";
import { addressSchema, hexSchema } from "./common.js";

export const orbsGetQuoteSchema = z.object({
  chainId: z.number().optional().describe("Chain ID (defaults to runtime config)"),
  fromToken: z.string({ required_error: "fromToken is required" }).describe("Source token address"),
  toToken: z
    .string({ required_error: "toToken is required" })
    .describe("Destination token address"),
  inAmount: z
    .string({ required_error: "inAmount is required" })
    .describe("Amount in smallest token units"),
  slippage: z.number().optional().describe("Slippage percentage (0.5 = 0.5%, default 0.5)"),
});

export const orbsSwapSchema = orbsGetQuoteSchema;

export const orbsPrepareSwapIntentSchema = orbsGetQuoteSchema.extend({
  account: addressSchema.describe("User wallet address"),
});

export const orbsGetRequiredApprovalsSchema = z.object({
  chainId: z.number().optional().describe("Chain ID (defaults to runtime config)"),
  fromToken: z.string({ required_error: "fromToken is required" }).describe("Source token address"),
  inAmount: z
    .string({ required_error: "inAmount is required" })
    .describe("Amount in smallest token units"),
  account: addressSchema.describe("User wallet address"),
});

export const orbsPlaceTwapSchema = z.object({
  chainId: z.number().optional().describe("Chain ID (defaults to runtime config)"),
  srcToken: z.string({ required_error: "srcToken is required" }).describe("Source token address"),
  dstToken: z
    .string({ required_error: "dstToken is required" })
    .describe("Destination token address"),
  srcAmount: z
    .string({ required_error: "srcAmount is required" })
    .describe("Total amount in smallest token units"),
  chunks: z.number({ required_error: "chunks is required" }).describe("Number of TWAP intervals"),
  fillDelay: z
    .number({ required_error: "fillDelay is required" })
    .describe("Delay between fills in seconds"),
});

export const orbsPrepareTwapIntentSchema = orbsPlaceTwapSchema.extend({
  account: addressSchema.describe("User wallet address"),
});

export const orbsPlaceLimitSchema = z.object({
  chainId: z.number().optional().describe("Chain ID (defaults to runtime config)"),
  srcToken: z.string({ required_error: "srcToken is required" }).describe("Source token address"),
  dstToken: z
    .string({ required_error: "dstToken is required" })
    .describe("Destination token address"),
  srcAmount: z
    .string({ required_error: "srcAmount is required" })
    .describe("Amount in smallest token units"),
  dstMinAmount: z
    .string({ required_error: "dstMinAmount is required" })
    .describe("Minimum output amount in smallest token units"),
  expiry: z.number().optional().describe("Order expiry as Unix timestamp"),
});

export const orbsPrepareLimitIntentSchema = orbsPlaceLimitSchema.extend({
  account: addressSchema.describe("User wallet address"),
});

export const orbsSubmitSignedSwapSchema = z.object({
  chainId: z.number().optional().describe("Chain ID (defaults to runtime config)"),
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
  chainId: z.number().optional().describe("Chain ID (defaults to runtime config)"),
  sessionId: z
    .string({ required_error: "sessionId is required" })
    .describe("Session ID from swap submission"),
  user: z.string({ required_error: "user is required" }).describe("User wallet address"),
  maxAttempts: z.number().optional().describe("Max polling attempts (default 20)"),
});

export const orbsListOrdersSchema = z.object({
  chainId: z.number().optional().describe("Chain ID (defaults to runtime config)"),
});
