import { type Hex, isAddress, isHex } from "viem";
import { z } from "zod";

export const addressSchema = z
  .string()
  .describe("Valid EVM address (0x-prefixed, checksummed)")
  .refine((value) => isAddress(value), {
    message: "must be a valid EVM address",
  }) as z.ZodType<Hex>;

export const hexSchema = z
  .string()
  .describe("Hex-encoded data (0x-prefixed)")
  .refine((value) => isHex(value), {
    message: "must be a valid 0x-prefixed hex string",
  }) as z.ZodType<Hex>;

export const typedDataPayloadSchema = z.object({
  domain: z.record(z.unknown()).describe("EIP-712 domain object"),
  types: z
    .record(
      z.array(
        z.object({
          name: z.string().describe("Field name"),
          type: z.string().describe("Solidity type"),
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
    type: z.literal("transaction").describe("Action type discriminator"),
    txHash: z
      .string({ required_error: "txHash is required" })
      .describe("Confirmed transaction hash"),
    status: z.literal("confirmed").describe("Transaction confirmation status"),
  }),
  z.object({
    type: z.literal("signature").describe("Action type discriminator"),
    signature: z
      .string({ required_error: "signature is required" })
      .describe("EIP-712 typed-data signature"),
  }),
  z.object({
    type: z.literal("messageSignature").describe("Action type discriminator"),
    signature: z
      .string({ required_error: "signature is required" })
      .describe("Personal message signature"),
  }),
]);

export const operationActionResultsMapSchema = z.record(operationActionResultSchema);

// --- Shared base schemas ---

export const chainIdOptionalSchema = z
  .number()
  .optional()
  .describe("Chain ID (defaults to runtime config)");

export const chainIdRequiredSchema = z
  .number()
  .int()
  .describe("Chain ID for the target network (required — no default for indexed data)");

export const tokenPairSchema = z.object({
  fromToken: z.string().describe("Source token address"),
  toToken: z.string().describe("Destination token address"),
});

export const tokenAmountSchema = tokenPairSchema.extend({
  fromAmount: z.string().describe("Amount in smallest token units"),
});

export const tokenEstimateSchema = tokenPairSchema.extend({
  fromDecimals: z.number().optional().describe("Source token decimals"),
  toDecimals: z.number().optional().describe("Destination token decimals"),
  fromAmount: z.string().describe("Input amount"),
  fromAmountUSD: z.string().optional().describe("Input value in USD"),
  toAmount: z.string().describe("Output amount"),
  toAmountUSD: z.string().optional().describe("Output value in USD"),
});

export const emptyInputSchema = z.object({});

export const resumeStateBaseSchema = z.object({
  summary: z.string().optional().describe("Operation summary"),
  intent: z.record(z.unknown()).optional().describe("Original intent data"),
  meta: z.record(z.unknown()).optional().describe("Operation metadata"),
  actionResults: operationActionResultsMapSchema.optional().describe("Completed action results"),
});
