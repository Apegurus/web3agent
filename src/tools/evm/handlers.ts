import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AbiFunction, Address, Chain, Hex, PublicClient } from "viem";
import * as viemChains from "viem/chains";
import type { ZodType } from "zod";
import { getRequiredChain } from "../../chains/registry.js";
import { createWalletClientForChain } from "../../config/wallet-factory.js";
import {
  ERC20_BALANCE_ABI,
  ERC721_ABI,
  ERC1155_ABI,
  fetchContractAbi,
  formatEther,
  formatUnits,
  getPublicClientCached,
  getTokenMetadata,
  isSupported,
  listRegisteredAbis,
  parseAbiJson,
  parseEther,
  registerAbi,
  resolveAbiFunction,
  resolveAddressOrEns,
} from "../../evm/services.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { serializeBigInts } from "../../utils/serialize.js";
import {
  requireActiveWallet,
  resolveChainIdFromData,
  withToolErrorHandler,
} from "../../utils/tool-helpers.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getActiveAccount, getWalletState } from "../../wallet/persistence.js";
import {
  evmApproveTokenSchema,
  evmGetAllowanceSchema,
  evmGetBalanceSchema,
  evmGetBlockSchema,
  evmGetChainInfoSchema,
  evmGetContractAbiSchema,
  evmGetErc1155BalanceSchema,
  evmGetGasPriceSchema,
  evmGetLatestBlockSchema,
  evmGetNftInfoSchema,
  evmGetTokenBalanceSchema,
  evmGetTransactionReceiptSchema,
  evmGetTransactionSchema,
  evmListRegisteredAbisSchema,
  evmLookupEnsSchema,
  evmMulticallSchema,
  evmReadContractSchema,
  evmRegisterAbiSchema,
  evmResolveEnsSchema,
  evmSignMessageSchema,
  evmSignTypedDataSchema,
  evmTransferErc20Schema,
  evmTransferNativeSchema,
  evmWaitForTransactionSchema,
  evmWriteContractSchema,
} from "./schemas.js";

type ReadContext<T> = { data: T; chainId: number; publicClient: PublicClient };

function validatedRead<T extends { chainId?: number }>(
  schema: ZodType<T>,
  params: Record<string, unknown>
): ReadContext<T> | CallToolResult {
  const v = validateInput(schema, params);
  if (!v.success) return v.error;
  const chainId = resolveChainIdFromData(v.data);
  return { data: v.data, chainId, publicClient: getPublicClientCached(chainId) };
}

function isValidated<T>(result: ReadContext<T> | CallToolResult): result is ReadContext<T> {
  return "data" in result && "chainId" in result && "publicClient" in result;
}

interface WriteContext {
  chainId: number;
  chain: Chain;
  account: ReturnType<typeof getActiveAccount>;
  walletClient: ReturnType<typeof createWalletClientForChain>;
}

function prepareWriteContext(
  toolName: string,
  params: Record<string, unknown>
): WriteContext | CallToolResult {
  const walletError = requireActiveWallet(toolName);
  if (walletError) return walletError;
  const chainId = resolveChainIdFromData(params as { chainId?: number });
  const chain = getRequiredChain(chainId);
  const account = getActiveAccount();
  const walletClient = createWalletClientForChain(account, chainId);
  return { chainId, chain, account, walletClient };
}

function isWriteContext(result: WriteContext | CallToolResult): result is WriteContext {
  return "chainId" in result && "chain" in result && "account" in result;
}

function parseJsonString(value: string, fieldName: string): unknown {
  try {
    return JSON.parse(value);
  } catch (e: unknown) {
    throw new Error(
      `${fieldName} must be valid JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

async function coerceAbiArg(type: string, value: string, chainId: number): Promise<unknown> {
  if (type === "address") {
    return resolveAddressOrEns(value, chainId);
  }
  if (type === "bool") {
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`Expected boolean string for ABI type bool, received: ${value}`);
  }
  if (type.startsWith("uint") || type.startsWith("int")) {
    return BigInt(value);
  }
  if (type.endsWith("]")) {
    const parsed = parseJsonString(value, "args item");
    if (!Array.isArray(parsed)) {
      throw new Error(`Expected JSON array for ABI array type ${type}`);
    }
    const baseType = type.slice(0, type.indexOf("["));
    const out: unknown[] = [];
    for (const item of parsed) {
      if (typeof item === "string") {
        out.push(await coerceAbiArg(baseType, item, chainId));
      } else if (typeof item === "number" || typeof item === "boolean" || item === null) {
        out.push(item);
      } else {
        out.push(item);
      }
    }
    return out;
  }
  if (type === "bytes" || type.startsWith("bytes") || type === "string") {
    return value;
  }
  if (type === "tuple" || type.startsWith("tuple")) {
    return parseJsonString(value, `argument of type ${type}`);
  }
  return value;
}

async function coerceAbiArgs(
  functionAbi: AbiFunction,
  args: string[] | undefined,
  chainId: number
): Promise<readonly unknown[]> {
  const rawArgs = args ?? [];
  const inputs = functionAbi.inputs ?? [];
  if (rawArgs.length !== inputs.length) {
    throw new Error(
      `Function ${functionAbi.name} expects ${inputs.length} argument(s) but received ${rawArgs.length}`
    );
  }

  const out: unknown[] = [];
  for (let i = 0; i < rawArgs.length; i += 1) {
    const input = inputs[i];
    if (!input || !("type" in input)) {
      throw new Error(`Could not resolve ABI input at position ${i}`);
    }
    out.push(await coerceAbiArg(input.type, rawArgs[i], chainId));
  }
  return out;
}

export async function evmGetWalletAddress(
  _params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_WALLET_ADDRESS_ERROR", async () => {
    const walletState = getWalletState();
    return formatToolResponse({
      address: walletState.address ?? null,
      mode: walletState.mode,
      chainId: walletState.chainId,
    });
  });
}

export async function evmGetChainInfo(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_CHAIN_INFO_ERROR", async () => {
    const ctx = validatedRead(evmGetChainInfoSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { chainId, publicClient } = ctx;

    const chain = getRequiredChain(chainId);
    const blockNumber = await publicClient.getBlockNumber();

    return formatToolResponse({
      chainId,
      name: chain.name,
      blockNumber: blockNumber.toString(),
      nativeCurrency: chain.nativeCurrency,
    });
  });
}

export async function evmGetSupportedNetworks(
  _params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_SUPPORTED_NETWORKS_ERROR", async () => {
    const byId = new Map<number, { chainId: number; name: string; nativeCurrency: string }>();
    for (const value of Object.values(viemChains)) {
      if (!value || typeof value !== "object" || !("id" in value) || !("name" in value)) continue;
      const chain = value as { id: number; name: string; nativeCurrency?: { symbol?: string } };
      if (!isSupported(chain.id)) continue;
      byId.set(chain.id, {
        chainId: chain.id,
        name: chain.name,
        nativeCurrency: chain.nativeCurrency?.symbol ?? "UNKNOWN",
      });
    }
    const networks = [...byId.values()].sort((a, b) => a.chainId - b.chainId);
    return formatToolResponse({ count: networks.length, networks });
  });
}

export async function evmGetGasPrice(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_GAS_PRICE_ERROR", async () => {
    const ctx = validatedRead(evmGetGasPriceSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { chainId, publicClient } = ctx;

    const gasPrice = await publicClient.getGasPrice();
    let maxPriorityFeePerGas: bigint | null = null;
    try {
      maxPriorityFeePerGas = await publicClient.estimateMaxPriorityFeePerGas();
    } catch (e: unknown) {
      process.stderr.write(`[evm] estimateMaxPriorityFeePerGas failed on chain ${chainId}: ${e}\n`);
    }

    return formatToolResponse({
      chainId,
      gasPriceWei: gasPrice.toString(),
      gasPriceGwei: formatUnits(gasPrice, 9),
      maxPriorityFeePerGasWei: maxPriorityFeePerGas?.toString() ?? null,
      maxPriorityFeePerGasGwei:
        maxPriorityFeePerGas === null ? null : formatUnits(maxPriorityFeePerGas, 9),
    });
  });
}

export async function evmResolveEnsName(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_RESOLVE_ENS_ERROR", async () => {
    const ctx = validatedRead(evmResolveEnsSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId } = ctx;

    const address = await resolveAddressOrEns(data.ensName, chainId);
    return formatToolResponse({
      chainId,
      ensName: data.ensName,
      address,
    });
  });
}

export async function evmLookupEnsAddress(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_LOOKUP_ENS_ERROR", async () => {
    const ctx = validatedRead(evmLookupEnsSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId, publicClient } = ctx;

    const address = await resolveAddressOrEns(data.address, chainId);
    const ensName = await publicClient.getEnsName({ address });

    return formatToolResponse({
      chainId,
      address,
      ensName,
    });
  });
}

export async function evmGetBlock(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_BLOCK_ERROR", async () => {
    const ctx = validatedRead(evmGetBlockSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId, publicClient } = ctx;

    const blockIdentifier = data.blockIdentifier;
    const block =
      blockIdentifier.startsWith("0x") && blockIdentifier.length === 66
        ? await publicClient.getBlock({ blockHash: blockIdentifier as Hex })
        : await publicClient.getBlock({ blockNumber: BigInt(blockIdentifier) });

    return formatToolResponse({
      chainId,
      block: serializeBigInts(block),
    });
  });
}

export async function evmGetLatestBlock(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_LATEST_BLOCK_ERROR", async () => {
    const ctx = validatedRead(evmGetLatestBlockSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { chainId, publicClient } = ctx;

    const block = await publicClient.getBlock();

    return formatToolResponse({
      chainId,
      block: serializeBigInts(block),
    });
  });
}

export async function evmGetTransaction(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_TRANSACTION_ERROR", async () => {
    const ctx = validatedRead(evmGetTransactionSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId, publicClient } = ctx;

    const tx = await publicClient.getTransaction({ hash: data.txHash as Hex });

    return formatToolResponse({
      chainId,
      transaction: serializeBigInts(tx),
    });
  });
}

export async function evmGetTransactionReceipt(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_TRANSACTION_RECEIPT_ERROR", async () => {
    const ctx = validatedRead(evmGetTransactionReceiptSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId, publicClient } = ctx;

    const receipt = await publicClient.getTransactionReceipt({ hash: data.txHash as Hex });

    return formatToolResponse({
      chainId,
      receipt: serializeBigInts(receipt),
    });
  });
}

export async function evmWaitForTransaction(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_WAIT_FOR_TRANSACTION_ERROR", async () => {
    const ctx = validatedRead(evmWaitForTransactionSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId, publicClient } = ctx;

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: data.txHash as Hex,
      confirmations: data.confirmations,
    });

    return formatToolResponse({
      chainId,
      receipt: serializeBigInts(receipt),
    });
  });
}

export async function evmGetBalance(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_BALANCE_ERROR", async () => {
    const ctx = validatedRead(evmGetBalanceSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId, publicClient } = ctx;

    const address = await resolveAddressOrEns(data.address, chainId);
    const balance = await publicClient.getBalance({ address });

    return formatToolResponse({
      chainId,
      address,
      balance: {
        wei: balance.toString(),
        ether: formatEther(balance),
      },
    });
  });
}

export async function evmGetTokenBalance(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_TOKEN_BALANCE_ERROR", async () => {
    const ctx = validatedRead(evmGetTokenBalanceSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId, publicClient } = ctx;

    const tokenAddress = await resolveAddressOrEns(data.tokenAddress, chainId);
    const ownerAddress = await resolveAddressOrEns(data.ownerAddress, chainId);
    const [balance, { symbol, decimals }] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [ownerAddress],
      }),
      getTokenMetadata(publicClient, tokenAddress),
    ]);

    return formatToolResponse({
      chainId,
      tokenAddress,
      ownerAddress,
      symbol,
      decimals,
      balance: {
        raw: balance.toString(),
        formatted: formatUnits(balance, decimals),
      },
    });
  });
}

export async function evmGetAllowance(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_ALLOWANCE_ERROR", async () => {
    const ctx = validatedRead(evmGetAllowanceSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId, publicClient } = ctx;

    const tokenAddress = await resolveAddressOrEns(data.tokenAddress, chainId);
    const spenderAddress = await resolveAddressOrEns(data.spenderAddress, chainId);
    const ownerAddressInput = data.ownerAddress ?? getWalletState().address;
    if (!ownerAddressInput) {
      return formatToolError(
        "INVALID_PARAMS",
        "ownerAddress is required when there is no active wallet address"
      );
    }
    const ownerAddress = await resolveAddressOrEns(ownerAddressInput, chainId);
    const [allowance, { symbol, decimals }] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_BALANCE_ABI,
        functionName: "allowance",
        args: [ownerAddress, spenderAddress],
      }),
      getTokenMetadata(publicClient, tokenAddress),
    ]);

    return formatToolResponse({
      chainId,
      tokenAddress,
      ownerAddress,
      spenderAddress,
      symbol,
      decimals,
      allowance: {
        raw: allowance.toString(),
        formatted: formatUnits(allowance, decimals),
      },
    });
  });
}

export async function evmRegisterAbi(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_REGISTER_ABI_ERROR", async () => {
    const v = validateInput(evmRegisterAbiSchema, params);
    if (!v.success) return v.error;

    const abi = parseAbiJson(v.data.abiJson);
    registerAbi(v.data.label, abi);

    const functionCount = abi.filter((item) => item.type === "function").length;
    const eventCount = abi.filter((item) => item.type === "event").length;

    return formatToolResponse({
      label: v.data.label,
      functionCount,
      eventCount,
      totalEntries: abi.length,
    });
  });
}

export async function evmListRegisteredAbis(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_LIST_REGISTERED_ABIS_ERROR", async () => {
    const v = validateInput(evmListRegisteredAbisSchema, params);
    if (!v.success) return v.error;

    return formatToolResponse({ labels: listRegisteredAbis() });
  });
}

export async function evmGetContractAbi(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_CONTRACT_ABI_ERROR", async () => {
    const ctx = validatedRead(evmGetContractAbiSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId } = ctx;

    const contractAddress = await resolveAddressOrEns(data.contractAddress, chainId);
    const abi = await fetchContractAbi(contractAddress, chainId);

    return formatToolResponse({
      chainId,
      contractAddress,
      abi,
    });
  });
}

export async function evmReadContract(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_READ_CONTRACT_ERROR", async () => {
    const ctx = validatedRead(evmReadContractSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId, publicClient } = ctx;

    const contractAddress = await resolveAddressOrEns(data.contractAddress, chainId);
    const resolved = await resolveAbiFunction(
      contractAddress,
      data.functionName,
      chainId,
      data.abiJson,
      data.abiLabel
    );
    const args = await coerceAbiArgs(resolved.functionAbi, data.args, chainId);

    const result = await publicClient.readContract({
      address: contractAddress,
      abi: [resolved.functionAbi],
      functionName: resolved.functionAbi.name,
      args,
    });

    return formatToolResponse({
      chainId,
      contractAddress,
      functionName: resolved.functionAbi.name,
      abiSource: resolved.source,
      result: serializeBigInts(result),
    });
  });
}

export async function evmGetNftInfo(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_NFT_INFO_ERROR", async () => {
    const ctx = validatedRead(evmGetNftInfoSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId, publicClient } = ctx;

    const tokenAddress = await resolveAddressOrEns(data.tokenAddress, chainId);
    const tokenId = BigInt(data.tokenId);

    const [name, symbol] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC721_ABI,
        functionName: "name",
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC721_ABI,
        functionName: "symbol",
      }),
    ]);

    let ownerOf: Address | null = null;
    try {
      ownerOf = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC721_ABI,
        functionName: "ownerOf",
        args: [tokenId],
      });
    } catch (e: unknown) {
      process.stderr.write(`[evm] ownerOf failed for ${tokenAddress}#${tokenId}: ${e}\n`);
    }

    let tokenUri: string | null = null;
    try {
      tokenUri = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC721_ABI,
        functionName: "tokenURI",
        args: [tokenId],
      });
    } catch (e: unknown) {
      process.stderr.write(`[evm] tokenURI failed for ${tokenAddress}#${tokenId}: ${e}\n`);
    }

    return formatToolResponse({
      chainId,
      tokenAddress,
      tokenId: tokenId.toString(),
      name,
      symbol,
      owner: ownerOf,
      tokenUri,
    });
  });
}

export async function evmGetErc1155Balance(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_GET_ERC1155_BALANCE_ERROR", async () => {
    const ctx = validatedRead(evmGetErc1155BalanceSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId, publicClient } = ctx;

    const tokenAddress = await resolveAddressOrEns(data.tokenAddress, chainId);
    const ownerAddress = await resolveAddressOrEns(data.ownerAddress, chainId);
    const tokenId = BigInt(data.tokenId);

    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC1155_ABI,
      functionName: "balanceOf",
      args: [ownerAddress, tokenId],
    });

    let uri: string | null = null;
    try {
      uri = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC1155_ABI,
        functionName: "uri",
        args: [tokenId],
      });
    } catch (e: unknown) {
      process.stderr.write(`[evm] uri failed for ERC-1155 ${tokenAddress}#${tokenId}: ${e}\n`);
    }

    return formatToolResponse({
      chainId,
      tokenAddress,
      ownerAddress,
      tokenId: tokenId.toString(),
      balance: balance.toString(),
      uri,
    });
  });
}

export async function evmMulticall(params: Record<string, unknown>): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_MULTICALL_ERROR", async () => {
    const ctx = validatedRead(evmMulticallSchema, params);
    if (!isValidated(ctx)) return ctx;
    const { data, chainId, publicClient } = ctx;

    const contracts: Array<{
      address: Address;
      abi: readonly [AbiFunction];
      functionName: string;
      args: readonly unknown[];
    }> = [];

    for (const call of data.calls) {
      const contractAddress = await resolveAddressOrEns(call.contractAddress, chainId);
      const resolved = await resolveAbiFunction(
        contractAddress,
        call.functionName,
        chainId,
        call.abiJson,
        call.abiLabel
      );
      const args = await coerceAbiArgs(resolved.functionAbi, call.args, chainId);
      contracts.push({
        address: contractAddress,
        abi: [resolved.functionAbi],
        functionName: resolved.functionAbi.name,
        args,
      });
    }

    const results = await publicClient.multicall({
      contracts,
      allowFailure: data.allowFailure ?? true,
    });

    return formatToolResponse({
      chainId,
      count: results.length,
      results: serializeBigInts(results),
    });
  });
}

export async function evmWriteContract(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(evmWriteContractSchema, params);
  if (!v.success) return v.error;

  return executeWrite({
    toolName: "evm_write_contract",
    description: `Write contract function ${v.data.functionName} on ${v.data.contractAddress}`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeWriteContractNow,
  });
}

export async function executeWriteContractNow(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_WRITE_CONTRACT_ERROR", async () => {
    const wc = prepareWriteContext("evm_write_contract", params);
    if (!isWriteContext(wc)) return wc;
    const { chainId, chain, account, walletClient } = wc;

    const contractAddressInput = String(params.contractAddress);
    const functionName = String(params.functionName);
    const value = typeof params.value === "string" ? params.value : undefined;
    const abiJson = typeof params.abiJson === "string" ? params.abiJson : undefined;
    const abiLabel = typeof params.abiLabel === "string" ? params.abiLabel : undefined;
    const args = Array.isArray(params.args)
      ? params.args.filter((entry): entry is string => typeof entry === "string")
      : undefined;

    const contractAddress = await resolveAddressOrEns(contractAddressInput, chainId);
    const resolved = await resolveAbiFunction(
      contractAddress,
      functionName,
      chainId,
      abiJson,
      abiLabel
    );
    if (
      resolved.functionAbi.stateMutability === "view" ||
      resolved.functionAbi.stateMutability === "pure"
    ) {
      return formatToolError(
        "EVM_WRITE_CONTRACT_ERROR",
        `Function ${functionName} is ${resolved.functionAbi.stateMutability}; use evm_read_contract instead`
      );
    }

    const callArgs = await coerceAbiArgs(resolved.functionAbi, args, chainId);
    const txHash = await walletClient.writeContract({
      account,
      chain,
      address: contractAddress,
      abi: [resolved.functionAbi],
      functionName: resolved.functionAbi.name,
      args: callArgs,
      value: value ? parseEther(value) : undefined,
    });

    return formatToolResponse({
      chainId,
      contractAddress,
      functionName: resolved.functionAbi.name,
      abiSource: resolved.source,
      txHash,
    });
  });
}

export async function evmTransferNative(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(evmTransferNativeSchema, params);
  if (!v.success) return v.error;

  return executeWrite({
    toolName: "evm_transfer_native",
    description: `Transfer ${v.data.amount} native tokens to ${v.data.to}`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeTransferNativeNow,
  });
}

export async function executeTransferNativeNow(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_TRANSFER_NATIVE_ERROR", async () => {
    const wc = prepareWriteContext("evm_transfer_native", params);
    if (!isWriteContext(wc)) return wc;
    const { chainId, chain, account, walletClient } = wc;

    const to = String(params.to);
    const amount = String(params.amount);
    const toAddress = await resolveAddressOrEns(to, chainId);
    const txHash = await walletClient.sendTransaction({
      account,
      chain,
      to: toAddress,
      value: parseEther(amount),
    });

    return formatToolResponse({
      chainId,
      from: account.address,
      to: toAddress,
      amount,
      txHash,
    });
  });
}

export async function evmTransferErc20(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(evmTransferErc20Schema, params);
  if (!v.success) return v.error;

  return executeWrite({
    toolName: "evm_transfer_erc20",
    description: `Transfer ${v.data.amount} ERC-20 units to ${v.data.to}`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeTransferErc20Now,
  });
}

export async function executeTransferErc20Now(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_TRANSFER_ERC20_ERROR", async () => {
    const wc = prepareWriteContext("evm_transfer_erc20", params);
    if (!isWriteContext(wc)) return wc;
    const { chainId, chain, account, walletClient } = wc;

    const tokenAddress = await resolveAddressOrEns(String(params.tokenAddress), chainId);
    const toAddress = await resolveAddressOrEns(String(params.to), chainId);
    const amount = BigInt(String(params.amount));
    const txHash = await walletClient.writeContract({
      account,
      chain,
      address: tokenAddress,
      abi: ERC20_BALANCE_ABI,
      functionName: "transfer",
      args: [toAddress, amount],
    });

    return formatToolResponse({
      chainId,
      from: account.address,
      tokenAddress,
      to: toAddress,
      amount: amount.toString(),
      txHash,
    });
  });
}

export async function evmApproveTokenSpending(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  const v = validateInput(evmApproveTokenSchema, params);
  if (!v.success) return v.error;

  return executeWrite({
    toolName: "evm_approve_token_spending",
    description: `Approve ${v.data.amount} token units for spender ${v.data.spenderAddress}`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeApproveTokenSpendingNow,
  });
}

export async function executeApproveTokenSpendingNow(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_APPROVE_TOKEN_ERROR", async () => {
    const wc = prepareWriteContext("evm_approve_token_spending", params);
    if (!isWriteContext(wc)) return wc;
    const { chainId, chain, account, walletClient } = wc;

    const tokenAddress = await resolveAddressOrEns(String(params.tokenAddress), chainId);
    const spenderAddress = await resolveAddressOrEns(String(params.spenderAddress), chainId);
    const amount = BigInt(String(params.amount));
    const txHash = await walletClient.writeContract({
      account,
      chain,
      address: tokenAddress,
      abi: ERC20_BALANCE_ABI,
      functionName: "approve",
      args: [spenderAddress, amount],
    });

    return formatToolResponse({
      chainId,
      owner: account.address,
      tokenAddress,
      spenderAddress,
      amount: amount.toString(),
      txHash,
    });
  });
}

export async function evmSignMessage(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(evmSignMessageSchema, params);
  if (!v.success) return v.error;

  return executeWrite({
    toolName: "evm_sign_message",
    description: `Sign arbitrary message (${v.data.message.length} chars)`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeSignMessageNow,
  });
}

export async function executeSignMessageNow(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_SIGN_MESSAGE_ERROR", async () => {
    const wc = prepareWriteContext("evm_sign_message", { chainId: getWalletState().chainId });
    if (!isWriteContext(wc)) return wc;
    const { chainId, account, walletClient } = wc;

    const message = String(params.message);
    const signature = await walletClient.signMessage({
      account,
      message,
    });

    return formatToolResponse({
      chainId,
      address: account.address,
      message,
      signature,
    });
  });
}

export async function evmSignTypedData(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(evmSignTypedDataSchema, params);
  if (!v.success) return v.error;

  return executeWrite({
    toolName: "evm_sign_typed_data",
    description: `Sign EIP-712 typed data for primaryType ${v.data.primaryType}`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeSignTypedDataNow,
  });
}

export async function executeSignTypedDataNow(
  params: Record<string, unknown>
): Promise<CallToolResult> {
  return withToolErrorHandler("EVM_SIGN_TYPED_DATA_ERROR", async () => {
    const wc = prepareWriteContext("evm_sign_typed_data", { chainId: getWalletState().chainId });
    if (!isWriteContext(wc)) return wc;
    const { chainId, account, walletClient } = wc;

    const domain = parseJsonString(String(params.domainJson), "domainJson") as Record<
      string,
      unknown
    >;
    const types = parseJsonString(String(params.typesJson), "typesJson") as Record<
      string,
      Array<{ name: string; type: string }>
    >;
    const primaryType = String(params.primaryType);
    const message = parseJsonString(String(params.messageJson), "messageJson") as Record<
      string,
      unknown
    >;

    const signature = await walletClient.signTypedData({
      account,
      domain,
      types,
      primaryType,
      message,
    });

    return formatToolResponse({
      chainId,
      address: account.address,
      primaryType,
      signature,
    });
  });
}

export function registerEvmExecutors(): void {
  registerExecutor("evm_write_contract", executeWriteContractNow);
  registerExecutor("evm_transfer_native", executeTransferNativeNow);
  registerExecutor("evm_transfer_erc20", executeTransferErc20Now);
  registerExecutor("evm_approve_token_spending", executeApproveTokenSpendingNow);
  registerExecutor("evm_sign_message", executeSignMessageNow);
  registerExecutor("evm_sign_typed_data", executeSignTypedDataNow);
}
