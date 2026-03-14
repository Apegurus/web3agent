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

export const transactionSimulateSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  to: z.string({ required_error: "to is required" }).min(1, "to must not be empty"),
  data: z.string({ required_error: "data is required" }).min(1, "data must not be empty"),
  value: z.string().optional(),
  from: z.string({ required_error: "from is required" }).min(1, "from must not be empty"),
});
