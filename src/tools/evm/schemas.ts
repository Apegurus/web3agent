import { z } from "zod";

export const evmChainIdParam = z
  .number()
  .optional()
  .describe("Chain ID (defaults to configured chain)");

export const evmGetBalanceSchema = z.object({
  address: z.string({ required_error: "address is required" }),
  chainId: evmChainIdParam,
});

export const evmGetTokenBalanceSchema = z.object({
  tokenAddress: z.string({ required_error: "tokenAddress is required" }),
  ownerAddress: z.string({ required_error: "ownerAddress is required" }),
  chainId: evmChainIdParam,
});

export const evmGetAllowanceSchema = z.object({
  tokenAddress: z.string({ required_error: "tokenAddress is required" }),
  ownerAddress: z.string().optional(),
  spenderAddress: z.string({ required_error: "spenderAddress is required" }),
  chainId: evmChainIdParam,
});

export const evmGetBlockSchema = z.object({
  blockIdentifier: z.string({ required_error: "blockIdentifier is required" }),
  chainId: evmChainIdParam,
});

export const evmGetLatestBlockSchema = z.object({
  chainId: evmChainIdParam,
});

export const evmGetTransactionSchema = z.object({
  txHash: z.string({ required_error: "txHash is required" }),
  chainId: evmChainIdParam,
});

export const evmGetTransactionReceiptSchema = evmGetTransactionSchema;

export const evmWaitForTransactionSchema = z.object({
  txHash: z.string({ required_error: "txHash is required" }),
  confirmations: z.number().optional(),
  chainId: evmChainIdParam,
});

export const evmGetGasPriceSchema = z.object({
  chainId: evmChainIdParam,
});

export const evmGetChainInfoSchema = z.object({
  chainId: evmChainIdParam,
});

export const evmResolveEnsSchema = z.object({
  ensName: z.string({ required_error: "ensName is required" }),
  chainId: evmChainIdParam,
});

export const evmLookupEnsSchema = z.object({
  address: z.string({ required_error: "address is required" }),
  chainId: evmChainIdParam,
});

export const evmGetContractAbiSchema = z.object({
  contractAddress: z.string({ required_error: "contractAddress is required" }),
  chainId: evmChainIdParam,
});

export const evmRegisterAbiSchema = z.object({
  label: z.string({ required_error: "label is required" }),
  abiJson: z.string({ required_error: "abiJson is required" }),
});

export const evmListRegisteredAbisSchema = z.object({});

export const evmReadContractSchema = z.object({
  contractAddress: z.string({ required_error: "contractAddress is required" }),
  functionName: z.string({ required_error: "functionName is required" }),
  args: z.array(z.string()).optional(),
  abiJson: z.string().optional(),
  abiLabel: z.string().optional(),
  chainId: evmChainIdParam,
});

export const evmWriteContractSchema = z.object({
  contractAddress: z.string({ required_error: "contractAddress is required" }),
  functionName: z.string({ required_error: "functionName is required" }),
  args: z.array(z.string()).optional(),
  value: z.string().optional(),
  abiJson: z.string().optional(),
  abiLabel: z.string().optional(),
  chainId: evmChainIdParam,
});

export const evmTransferNativeSchema = z.object({
  to: z.string({ required_error: "to is required" }),
  amount: z.string({ required_error: "amount is required" }),
  chainId: evmChainIdParam,
});

export const evmTransferErc20Schema = z.object({
  tokenAddress: z.string({ required_error: "tokenAddress is required" }),
  to: z.string({ required_error: "to is required" }),
  amount: z.string({ required_error: "amount is required" }),
  chainId: evmChainIdParam,
});

export const evmApproveTokenSchema = z.object({
  tokenAddress: z.string({ required_error: "tokenAddress is required" }),
  spenderAddress: z.string({ required_error: "spenderAddress is required" }),
  amount: z.string({ required_error: "amount is required" }),
  chainId: evmChainIdParam,
});

export const evmGetNftInfoSchema = z.object({
  tokenAddress: z.string({ required_error: "tokenAddress is required" }),
  tokenId: z.string({ required_error: "tokenId is required" }),
  chainId: evmChainIdParam,
});

export const evmGetErc1155BalanceSchema = z.object({
  tokenAddress: z.string({ required_error: "tokenAddress is required" }),
  tokenId: z.string({ required_error: "tokenId is required" }),
  ownerAddress: z.string({ required_error: "ownerAddress is required" }),
  chainId: evmChainIdParam,
});

export const evmSignMessageSchema = z.object({
  message: z.string({ required_error: "message is required" }),
});

export const evmSignTypedDataSchema = z.object({
  domainJson: z.string({ required_error: "domainJson is required" }),
  typesJson: z.string({ required_error: "typesJson is required" }),
  primaryType: z.string({ required_error: "primaryType is required" }),
  messageJson: z.string({ required_error: "messageJson is required" }),
});

const multicallEntry = z.object({
  contractAddress: z.string(),
  functionName: z.string(),
  args: z.array(z.string()).optional(),
  abiJson: z.string().optional(),
  abiLabel: z.string().optional(),
});

export const evmMulticallSchema = z.object({
  calls: z.array(multicallEntry, { required_error: "calls is required" }),
  allowFailure: z.boolean().optional(),
  chainId: evmChainIdParam,
});
