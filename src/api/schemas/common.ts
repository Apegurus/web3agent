import { isAddress, isHex } from "viem";
import { z } from "zod";

export const addressSchema = z.string().refine((value) => isAddress(value), {
  message: "must be a valid EVM address",
}) as z.ZodType<`0x${string}`>;

export const hexSchema = z.string().refine((value) => isHex(value), {
  message: "must be a valid 0x-prefixed hex string",
}) as z.ZodType<`0x${string}`>;

export const typedDataPayloadSchema = z.object({
  domain: z.record(z.unknown()),
  types: z.record(
    z.array(
      z.object({
        name: z.string(),
        type: z.string(),
      })
    )
  ),
  primaryType: z.string(),
  message: z.record(z.unknown()),
});

export const preparedTransactionRequestSchema = z.object({
  to: addressSchema,
  chainId: z.number().int(),
  data: hexSchema.optional(),
  value: z.string().optional(),
  gasLimit: z.string().optional(),
});

export const preparedTransactionActionSchema = z.object({
  id: z.string(),
  type: z.literal("transaction"),
  label: z.string(),
  tx: preparedTransactionRequestSchema,
});

export const preparedSignTypedDataActionSchema = z.object({
  id: z.string(),
  type: z.literal("signTypedData"),
  label: z.string(),
  chainId: z.number().int(),
  eip712: typedDataPayloadSchema,
});

export const preparedSignMessageActionSchema = z.object({
  id: z.string(),
  type: z.literal("signMessage"),
  label: z.string(),
  chainId: z.number().int(),
  message: z.string(),
});

export const preparedActionSchema = z.union([
  preparedTransactionActionSchema,
  preparedSignTypedDataActionSchema,
  preparedSignMessageActionSchema,
]);

export const operationActionResultSchema = z.union([
  z.object({
    type: z.literal("transaction"),
    txHash: z.string({ required_error: "txHash is required" }),
    status: z.literal("confirmed"),
  }),
  z.object({
    type: z.literal("signature"),
    signature: z.string({ required_error: "signature is required" }),
  }),
  z.object({
    type: z.literal("messageSignature"),
    signature: z.string({ required_error: "signature is required" }),
  }),
]);

export const operationActionResultsMapSchema = z.record(operationActionResultSchema);

export const resumeStateBaseSchema = z.object({
  summary: z.string().optional(),
  intent: z.record(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
  actionResults: operationActionResultsMapSchema.optional(),
});
