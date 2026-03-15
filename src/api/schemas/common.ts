import { isAddress, isHex } from "viem";
import { z } from "zod";

export const addressSchema = z.string().refine((value) => isAddress(value), {
  message: "must be a valid EVM address",
}) as z.ZodType<`0x${string}`>;

export const hexSchema = z.string().refine((value) => isHex(value), {
  message: "must be a valid 0x-prefixed hex string",
}) as z.ZodType<`0x${string}`>;

export const typedDataPayloadSchema = z.object({
  domain: z.record(z.unknown()).describe("EIP-712 domain object"),
  types: z
    .record(
      z.array(
        z.object({
          name: z.string(),
          type: z.string(),
        })
      )
    )
    .describe("EIP-712 type definitions"),
  primaryType: z.string().describe("Primary type name"),
  message: z.record(z.unknown()).describe("Typed data message"),
});

export const preparedTransactionRequestSchema = z.object({
  to: addressSchema.describe("Target contract address"),
  chainId: z.number().int().describe("Chain ID"),
  data: hexSchema.optional().describe("Transaction calldata"),
  value: z.string().optional().describe("Native value to send"),
  gasLimit: z.string().optional().describe("Gas limit"),
});

export const preparedTransactionActionSchema = z.object({
  id: z.string().describe("Unique action identifier"),
  type: z.literal("transaction").describe("Action type"),
  label: z.string().describe("Human-readable description"),
  tx: preparedTransactionRequestSchema.describe("Transaction to execute"),
});

export const preparedSignTypedDataActionSchema = z.object({
  id: z.string().describe("Unique action identifier"),
  type: z.literal("signTypedData").describe("Action type"),
  label: z.string().describe("Human-readable description"),
  chainId: z.number().int().describe("Chain ID for signing"),
  eip712: typedDataPayloadSchema.describe("EIP-712 typed data payload"),
});

export const preparedSignMessageActionSchema = z.object({
  id: z.string().describe("Unique action identifier"),
  type: z.literal("signMessage").describe("Action type"),
  label: z.string().describe("Human-readable description"),
  chainId: z.number().int().describe("Chain ID for signing"),
  message: z.string().describe("Message to sign"),
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
  summary: z.string().optional().describe("Operation summary"),
  intent: z.record(z.unknown()).optional().describe("Original intent data"),
  meta: z.record(z.unknown()).optional().describe("Operation metadata"),
  actionResults: operationActionResultsMapSchema.optional().describe("Completed action results"),
});
