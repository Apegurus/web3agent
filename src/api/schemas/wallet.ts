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

export const walletInfoSchema = z.object({});

export const walletInfoOutputSchema = z.object({
  backend: z.enum(["ows", "legacy"]).describe("Active wallet backend type"),
  backendReason: z.string().describe("Human-readable reason this backend was selected"),
  vaultPath: z.string().nullable().describe("OWS vault path, or null when using legacy storage"),
  supportedChains: z
    .array(z.string())
    .describe("Wallet backend chain families supported by web3agent"),
  securityPosture: z
    .enum(["encrypted-at-rest", "legacy-wallet-json"])
    .describe("Storage security posture for the active wallet backend"),
  passphraseConfigured: z
    .boolean()
    .describe("Whether a non-empty OWS passphrase is configured in the environment"),
  state: z
    .object({
      mode: z.enum(["private-key", "mnemonic", "read-only"]).describe("Current wallet mode"),
      address: z.string().nullable().describe("Active wallet address, or null in read-only mode"),
      chainId: z.number().describe("Active chain ID"),
      accountIndex: z.number().describe("BIP-44 account index"),
      addressIndex: z.number().describe("BIP-44 address index"),
    })
    .describe("Current wallet state without secret material"),
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
