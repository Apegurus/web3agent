import { z } from "zod";
import { addressSchema, hexSchema } from "./common.js";

export const orbsGetQuoteSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  fromToken: z.string({ required_error: "fromToken is required" }),
  toToken: z.string({ required_error: "toToken is required" }),
  inAmount: z.string({ required_error: "inAmount is required" }),
  slippage: z.number().optional(),
});

export const orbsSwapSchema = orbsGetQuoteSchema;

export const orbsPrepareSwapIntentSchema = orbsGetQuoteSchema.extend({
  account: addressSchema,
});

export const orbsGetRequiredApprovalsSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  fromToken: z.string({ required_error: "fromToken is required" }),
  inAmount: z.string({ required_error: "inAmount is required" }),
  account: addressSchema,
});

export const orbsPlaceTwapSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  srcToken: z.string({ required_error: "srcToken is required" }),
  dstToken: z.string({ required_error: "dstToken is required" }),
  srcAmount: z.string({ required_error: "srcAmount is required" }),
  chunks: z.number({ required_error: "chunks is required" }),
  fillDelay: z.number({ required_error: "fillDelay is required" }),
});

export const orbsPrepareTwapIntentSchema = orbsPlaceTwapSchema.extend({
  account: addressSchema,
});

export const orbsPlaceLimitSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  srcToken: z.string({ required_error: "srcToken is required" }),
  dstToken: z.string({ required_error: "dstToken is required" }),
  srcAmount: z.string({ required_error: "srcAmount is required" }),
  dstMinAmount: z.string({ required_error: "dstMinAmount is required" }),
  expiry: z.number().optional(),
});

export const orbsPrepareLimitIntentSchema = orbsPlaceLimitSchema.extend({
  account: addressSchema,
});

export const orbsSubmitSignedSwapSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  quote: z.record(z.unknown()),
  signature: hexSchema.refine((v) => v.length >= 132, {
    message: "signature must be at least 65 bytes (132 hex characters + 0x prefix)",
  }),
});

export const orbsSubmitSignedTwapOrderSchema = z.object({
  order: z.record(z.unknown()),
  signature: z.object({
    v: z.number({ required_error: "signature.v is required" }),
    r: z.string({ required_error: "signature.r is required" }),
    s: z.string({ required_error: "signature.s is required" }),
  }),
});

export const orbsSwapStatusSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  sessionId: z.string({ required_error: "sessionId is required" }),
  user: z.string({ required_error: "user is required" }),
  maxAttempts: z.number().optional(),
});

export const orbsListOrdersSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
});
