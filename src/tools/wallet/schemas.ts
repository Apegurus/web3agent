import { z } from "zod";

export const walletFromMnemonicSchema = z.object({
  mnemonic: z
    .string({ required_error: "mnemonic is required" })
    .min(1, "mnemonic must not be empty"),
  accountIndex: z.number().optional(),
  addressIndex: z.number().optional(),
});

export const walletDeriveAddressesSchema = z.object({
  mnemonic: z
    .string({ required_error: "mnemonic is required" })
    .min(1, "mnemonic must not be empty"),
  count: z.number().min(1).max(20).optional(),
});

export const walletActivateSchema = z
  .object({
    privateKey: z.string().optional(),
    mnemonic: z.string().optional(),
    accountIndex: z.number().optional(),
    addressIndex: z.number().optional(),
  })
  .refine((data) => data.privateKey || data.mnemonic, {
    message: "Either privateKey or mnemonic must be provided",
  });

export const walletSetConfirmationSchema = z.object({
  enabled: z.boolean({ required_error: "enabled is required" }),
});

export const transactionConfirmSchema = z.object({
  id: z.string({ required_error: "id is required" }).min(1, "id must not be empty"),
});

export const transactionDenySchema = transactionConfirmSchema;
