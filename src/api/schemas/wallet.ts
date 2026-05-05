import { z } from "zod";
import { addressSchema, hexSchema } from "./common.js";

export const walletFromMnemonicSchema = z.object({
  mnemonic: z
    .string({ required_error: "mnemonic is required" })
    .min(1, "mnemonic must not be empty")
    .describe("BIP-39 mnemonic phrase"),
  accountIndex: z.number().optional().describe("BIP-44 account index (default 0)"),
  addressIndex: z.number().optional().describe("BIP-44 address index (default 0)"),
});

export const walletDeriveAddressesSchema = z.object({
  mnemonic: z
    .string({ required_error: "mnemonic is required" })
    .min(1, "mnemonic must not be empty")
    .describe("BIP-39 mnemonic phrase"),
  count: z
    .number()
    .min(1)
    .max(20)
    .optional()
    .describe("Number of addresses to derive (1-20, default 5)"),
});

export const walletActivateSchema = z
  .object({
    privateKey: z.string().optional().describe("Hex-encoded private key (0x-prefixed)"),
    mnemonic: z.string().optional().describe("BIP-39 mnemonic phrase"),
    accountIndex: z.number().optional().describe("BIP-44 account index (default 0, mnemonic only)"),
    addressIndex: z.number().optional().describe("BIP-44 address index (default 0, mnemonic only)"),
  })
  .refine((data) => data.privateKey || data.mnemonic, {
    message: "Either privateKey or mnemonic must be provided",
  });

export const walletSetConfirmationSchema = z.object({
  enabled: z
    .boolean({ required_error: "enabled is required" })
    .describe("true to require confirmation for writes, false to execute immediately"),
});

export const transactionConfirmSchema = z.object({
  id: z
    .string({ required_error: "id is required" })
    .min(1, "id must not be empty")
    .describe("UUID of the pending operation to confirm"),
});

export const transactionDenySchema = transactionConfirmSchema;

export const transactionSimulateSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }).describe("Target chain ID"),
  to: addressSchema.describe("Destination contract or recipient address"),
  data: hexSchema.describe("Hex-encoded calldata"),
  value: z.string().optional().describe("Optional native value in wei"),
  from: addressSchema.describe("Sender address used for simulation"),
});
