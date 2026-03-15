import { z } from "zod";

export const evmChainIdParam = z
  .number()
  .optional()
  .describe("Chain ID (defaults to configured chain)");

export const evmGetBalanceSchema = z.object({
  address: z
    .string({ required_error: "address is required" })
    .describe("Wallet address or ENS name"),
  chainId: evmChainIdParam,
});

export const evmGetTokenBalanceSchema = z.object({
  tokenAddress: z
    .string({ required_error: "tokenAddress is required" })
    .describe("ERC-20 token contract address"),
  ownerAddress: z
    .string({ required_error: "ownerAddress is required" })
    .describe("Owner wallet address"),
  chainId: evmChainIdParam,
});

export const evmGetAllowanceSchema = z.object({
  tokenAddress: z
    .string({ required_error: "tokenAddress is required" })
    .describe("ERC-20 token contract address"),
  ownerAddress: z
    .string()
    .optional()
    .describe("Owner wallet address (defaults to active wallet when available)"),
  spenderAddress: z
    .string({ required_error: "spenderAddress is required" })
    .describe("Approved spender address"),
  chainId: evmChainIdParam,
});

export const evmGetBlockSchema = z.object({
  blockIdentifier: z
    .string({ required_error: "blockIdentifier is required" })
    .describe("Block number (decimal string) or 0x-prefixed block hash"),
  chainId: evmChainIdParam,
});

export const evmGetLatestBlockSchema = z.object({
  chainId: evmChainIdParam,
});

export const evmGetTransactionSchema = z.object({
  txHash: z.string({ required_error: "txHash is required" }).describe("Transaction hash"),
  chainId: evmChainIdParam,
});

export const evmGetTransactionReceiptSchema = evmGetTransactionSchema;

export const evmWaitForTransactionSchema = z.object({
  txHash: z.string({ required_error: "txHash is required" }).describe("Transaction hash"),
  confirmations: z.number().optional().describe("Required confirmation count"),
  chainId: evmChainIdParam,
});

export const evmGetGasPriceSchema = z.object({
  chainId: evmChainIdParam,
});

export const evmGetChainInfoSchema = z.object({
  chainId: evmChainIdParam,
});

export const evmResolveEnsSchema = z.object({
  ensName: z
    .string({ required_error: "ensName is required" })
    .describe("ENS name (for example vitalik.eth)"),
  chainId: evmChainIdParam,
});

export const evmLookupEnsSchema = z.object({
  address: z
    .string({ required_error: "address is required" })
    .describe("Address to reverse-resolve"),
  chainId: evmChainIdParam,
});

export const evmGetContractAbiSchema = z.object({
  contractAddress: z
    .string({ required_error: "contractAddress is required" })
    .describe("Contract address"),
  chainId: evmChainIdParam,
});

export const evmRegisterAbiSchema = z.object({
  label: z
    .string({ required_error: "label is required" })
    .describe("Short label to reference this ABI (e.g. 'uniswap-router', 'aave-pool')"),
  abiJson: z
    .string({ required_error: "abiJson is required" })
    .describe("Full contract ABI as JSON string"),
});

export const evmListRegisteredAbisSchema = z.object({});

export const evmReadContractSchema = z.object({
  contractAddress: z
    .string({ required_error: "contractAddress is required" })
    .describe("Contract address"),
  functionName: z
    .string({ required_error: "functionName is required" })
    .describe("Function name to call"),
  args: z.array(z.string()).optional().describe("Function arguments as strings"),
  abiJson: z.string().optional().describe("Optional ABI JSON string"),
  abiLabel: z.string().optional().describe("Label of a registered ABI (from evm_register_abi)"),
  chainId: evmChainIdParam,
});

export const evmWriteContractSchema = z.object({
  contractAddress: z
    .string({ required_error: "contractAddress is required" })
    .describe("Contract address"),
  functionName: z
    .string({ required_error: "functionName is required" })
    .describe("State-changing function name"),
  args: z.array(z.string()).optional().describe("Function arguments as strings"),
  value: z.string().optional().describe("Optional native amount in ether units"),
  abiJson: z.string().optional().describe("Optional ABI JSON string"),
  abiLabel: z.string().optional().describe("Label of a registered ABI (from evm_register_abi)"),
  chainId: evmChainIdParam,
});

export const evmTransferNativeSchema = z.object({
  to: z.string({ required_error: "to is required" }).describe("Recipient address or ENS name"),
  amount: z.string({ required_error: "amount is required" }).describe("Amount in ether units"),
  chainId: evmChainIdParam,
});

export const evmTransferErc20Schema = z.object({
  tokenAddress: z
    .string({ required_error: "tokenAddress is required" })
    .describe("ERC-20 token address"),
  to: z.string({ required_error: "to is required" }).describe("Recipient address or ENS name"),
  amount: z
    .string({ required_error: "amount is required" })
    .describe("Token amount in smallest units (wei-equivalent)"),
  chainId: evmChainIdParam,
});

export const evmApproveTokenSchema = z.object({
  tokenAddress: z
    .string({ required_error: "tokenAddress is required" })
    .describe("ERC-20 token address"),
  spenderAddress: z
    .string({ required_error: "spenderAddress is required" })
    .describe("Spender address or ENS name"),
  amount: z.string({ required_error: "amount is required" }).describe("Raw token allowance amount"),
  chainId: evmChainIdParam,
});

export const evmGetNftInfoSchema = z.object({
  tokenAddress: z
    .string({ required_error: "tokenAddress is required" })
    .describe("ERC-721 contract address"),
  tokenId: z.string({ required_error: "tokenId is required" }).describe("Token ID as string"),
  chainId: evmChainIdParam,
});

export const evmGetErc1155BalanceSchema = z.object({
  tokenAddress: z
    .string({ required_error: "tokenAddress is required" })
    .describe("ERC-1155 contract address"),
  tokenId: z.string({ required_error: "tokenId is required" }).describe("Token ID as string"),
  ownerAddress: z
    .string({ required_error: "ownerAddress is required" })
    .describe("Owner wallet address"),
  chainId: evmChainIdParam,
});

export const evmSignMessageSchema = z.object({
  message: z.string({ required_error: "message is required" }).describe("Message to sign"),
});

export const evmSignTypedDataSchema = z.object({
  domainJson: z
    .string({ required_error: "domainJson is required" })
    .describe("EIP-712 domain JSON string"),
  typesJson: z
    .string({ required_error: "typesJson is required" })
    .describe("EIP-712 types JSON string"),
  primaryType: z
    .string({ required_error: "primaryType is required" })
    .describe("Primary type name"),
  messageJson: z
    .string({ required_error: "messageJson is required" })
    .describe("Typed message JSON string"),
});

const multicallEntry = z.object({
  contractAddress: z.string().describe("Contract address"),
  functionName: z.string().describe("Function name to call"),
  args: z.array(z.string()).optional().describe("Function arguments as strings"),
  abiJson: z.string().optional().describe("Optional ABI JSON string"),
  abiLabel: z.string().optional().describe("Label of a registered ABI"),
});

export const evmMulticallSchema = z.object({
  calls: z
    .array(multicallEntry, { required_error: "calls is required" })
    .describe("Contract calls to execute"),
  allowFailure: z.boolean().optional().describe("Continue if individual call fails"),
  chainId: evmChainIdParam,
});
