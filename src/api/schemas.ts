import { z } from "zod";

export const resolveTokenSchema = z.object({
  symbol: z.string({ required_error: "symbol is required" }),
  chainId: z.number({ required_error: "chainId is required" }),
});

export const listChainTokensSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
});

export const lifiGetQuoteSchema = z.object({
  fromChainId: z.number({ required_error: "fromChainId is required" }),
  toChainId: z.number({ required_error: "toChainId is required" }),
  fromTokenAddress: z.string({ required_error: "fromTokenAddress is required" }),
  toTokenAddress: z.string({ required_error: "toTokenAddress is required" }),
  fromAmount: z.string({ required_error: "fromAmount is required" }),
});

export const lifiExecuteBridgeSchema = lifiGetQuoteSchema;

export const lifiPrepareBridgeIntentSchema = lifiGetQuoteSchema.extend({
  account: z.string({ required_error: "account is required" }),
});

export const orbsGetQuoteSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  fromToken: z.string({ required_error: "fromToken is required" }),
  toToken: z.string({ required_error: "toToken is required" }),
  inAmount: z.string({ required_error: "inAmount is required" }),
  slippage: z.number().optional(),
});

export const orbsSwapSchema = orbsGetQuoteSchema;

export const orbsPrepareSwapIntentSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  fromToken: z.string({ required_error: "fromToken is required" }),
  toToken: z.string({ required_error: "toToken is required" }),
  inAmount: z.string({ required_error: "inAmount is required" }),
  slippage: z.number().optional(),
  account: z.string({ required_error: "account is required" }),
});

export const orbsGetRequiredApprovalsSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  fromToken: z.string({ required_error: "fromToken is required" }),
  inAmount: z.string({ required_error: "inAmount is required" }),
  account: z.string({ required_error: "account is required" }),
});

export const orbsPlaceTwapSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  srcToken: z.string({ required_error: "srcToken is required" }),
  dstToken: z.string({ required_error: "dstToken is required" }),
  srcAmount: z.string({ required_error: "srcAmount is required" }),
  chunks: z.number({ required_error: "chunks is required" }),
  fillDelay: z.number({ required_error: "fillDelay is required" }),
});

export const orbsPrepareTwapIntentSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  srcToken: z.string({ required_error: "srcToken is required" }),
  dstToken: z.string({ required_error: "dstToken is required" }),
  srcAmount: z.string({ required_error: "srcAmount is required" }),
  chunks: z.number({ required_error: "chunks is required" }),
  fillDelay: z.number({ required_error: "fillDelay is required" }),
  account: z.string({ required_error: "account is required" }),
});

export const orbsPlaceLimitSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  srcToken: z.string({ required_error: "srcToken is required" }),
  dstToken: z.string({ required_error: "dstToken is required" }),
  srcAmount: z.string({ required_error: "srcAmount is required" }),
  dstMinAmount: z.string({ required_error: "dstMinAmount is required" }),
  expiry: z.number().optional(),
});

export const orbsPrepareLimitIntentSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  srcToken: z.string({ required_error: "srcToken is required" }),
  dstToken: z.string({ required_error: "dstToken is required" }),
  srcAmount: z.string({ required_error: "srcAmount is required" }),
  dstMinAmount: z.string({ required_error: "dstMinAmount is required" }),
  expiry: z.number().optional(),
  account: z.string({ required_error: "account is required" }),
});

export const orbsSubmitSignedSwapSchema = z.object({
  chainId: z.number({ required_error: "chainId is required" }),
  quote: z.record(z.unknown()),
  signature: z.string({ required_error: "signature is required" }),
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

export const operationActionResultSchema = z.union([
  z.object({
    type: z.literal("transaction"),
    txHash: z.string({ required_error: "txHash is required" }),
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

export const operationResumeStateSchema = z.object({
  version: z.literal(1),
  integration: z.enum(["orbs", "lifi", "goat"]),
  kind: z.string({ required_error: "kind is required" }),
  state: z.record(z.unknown()),
});

export const prepareOperationSchema = z.union([
  z.object({
    integration: z.literal("orbs"),
    kind: z.literal("swap"),
    chainId: z.number({ required_error: "chainId is required" }),
    fromToken: z.string({ required_error: "fromToken is required" }),
    toToken: z.string({ required_error: "toToken is required" }),
    inAmount: z.string({ required_error: "inAmount is required" }),
    slippage: z.number().optional(),
    account: z.string({ required_error: "account is required" }),
  }),
  z.object({
    integration: z.literal("orbs"),
    kind: z.literal("twap"),
    chainId: z.number({ required_error: "chainId is required" }),
    srcToken: z.string({ required_error: "srcToken is required" }),
    dstToken: z.string({ required_error: "dstToken is required" }),
    srcAmount: z.string({ required_error: "srcAmount is required" }),
    chunks: z.number({ required_error: "chunks is required" }),
    fillDelay: z.number({ required_error: "fillDelay is required" }),
    account: z.string({ required_error: "account is required" }),
  }),
  z.object({
    integration: z.literal("orbs"),
    kind: z.literal("limit"),
    chainId: z.number({ required_error: "chainId is required" }),
    srcToken: z.string({ required_error: "srcToken is required" }),
    dstToken: z.string({ required_error: "dstToken is required" }),
    srcAmount: z.string({ required_error: "srcAmount is required" }),
    dstMinAmount: z.string({ required_error: "dstMinAmount is required" }),
    expiry: z.number().optional(),
    account: z.string({ required_error: "account is required" }),
  }),
  z.object({
    integration: z.literal("lifi"),
    kind: z.literal("bridge"),
    fromChainId: z.number({ required_error: "fromChainId is required" }),
    toChainId: z.number({ required_error: "toChainId is required" }),
    fromTokenAddress: z.string({ required_error: "fromTokenAddress is required" }),
    toTokenAddress: z.string({ required_error: "toTokenAddress is required" }),
    fromAmount: z.string({ required_error: "fromAmount is required" }),
    account: z.string({ required_error: "account is required" }),
  }),
  z.object({
    integration: z.literal("goat"),
    kind: z.literal("tool"),
    toolName: z.string({ required_error: "toolName is required" }),
    params: z.record(z.unknown()).optional(),
    chainId: z.number({ required_error: "chainId is required" }),
    account: z.string({ required_error: "account is required" }),
  }),
]);

export const resumeOperationSchema = z.object({
  resumeState: operationResumeStateSchema,
  actionResults: operationActionResultsMapSchema.optional(),
});
