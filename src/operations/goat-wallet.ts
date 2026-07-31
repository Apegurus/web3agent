import type { EvmChain, Signature, Token, ToolBase } from "@goat-sdk/core";
import type { Abi, Hex } from "viem";
import {
  encodeFunctionData,
  hashTypedData,
  keccak256,
  parseAbi,
  recoverTypedDataAddress,
} from "viem";
import { Web3AgentError } from "../api/errors.js";
import { getConfirmedReceipt } from "../api/operations/shared.js";
import type {
  OperationActionResult,
  PreparedAction,
  PreparedSignMessageAction,
  PreparedSignTypedDataAction,
  PreparedTransactionAction,
} from "../api/types.js";
import { lookupTokenByAddress } from "../tokens/registry.js";
import { createPublicClientForRuntimeChain, getChainForRuntime } from "./chain-access.js";
import { type EVMTypedData, normalizeTypedDataTypes } from "./goat-wallet-typed-data.js";
import { assertAddress, assertHex } from "./validation.js";

interface EVMTransaction {
  to: string;
  functionName?: string;
  args?: unknown[];
  value?: bigint;
  abi?: Abi;
  data?: Hex;
}

interface EVMReadRequest {
  address: string;
  functionName: string;
  args?: unknown[];
  abi: Abi;
}

interface EVMReadResult {
  value: unknown;
}

const erc20BalanceAbi = parseAbi(["function balanceOf(address account) view returns (uint256)"]);

export class OperationPauseError extends Error {
  constructor(readonly action: PreparedAction) {
    super(`Operation paused for ${action.type}`);
    this.name = "OperationPauseError";
  }
}

interface PreparedActionGoatWalletOptions {
  account: string;
  chainId: number;
  actionResults: Record<string, OperationActionResult>;
  toolName?: string;
}

export class PreparedActionGoatWallet {
  private readonly publicClient;
  private readonly chain: EvmChain;
  private transactionIndex = 0;
  private signTypedDataIndex = 0;
  private signMessageIndex = 0;

  constructor(private readonly options: PreparedActionGoatWalletOptions) {
    const chain = getChainForRuntime(this.options.chainId);
    this.publicClient = createPublicClientForRuntimeChain(this.options.chainId);
    this.chain = {
      type: "evm",
      id: chain.id,
      nativeCurrency: chain.nativeCurrency,
    };
  }

  getAddress(): Hex {
    return assertAddress(this.options.account, "account");
  }

  getChain(): EvmChain {
    return this.chain;
  }

  getCoreTools(): ToolBase[] {
    return [];
  }

  async signMessage(message: string): Promise<Signature> {
    const id = `sign-message:${this.signMessageIndex++}`;
    const result = this.options.actionResults[id];
    if (result?.type === "signature" || result?.type === "messageSignature") {
      return { signature: result.signature };
    }

    throw new OperationPauseError({
      id,
      type: "signMessage",
      label: "Sign message",
      chainId: this.options.chainId,
      message,
    } satisfies PreparedSignMessageAction);
  }

  async signTypedData(data: EVMTypedData): Promise<Signature> {
    const id = `sign-typed-data:${this.signTypedDataIndex++}`;
    const types = normalizeTypedDataTypes(data.types);
    const typedDataHash = hashTypedData({
      domain: data.domain,
      types,
      primaryType: data.primaryType,
      message: data.message,
    });
    const result = this.options.actionResults[id];
    if (result?.type === "signature") {
      const signer = await recoverTypedDataAddress({
        domain: data.domain,
        types,
        primaryType: data.primaryType,
        message: data.message,
        signature: assertHex(result.signature, `${id}.signature`),
      });
      if (signer.toLowerCase() !== this.getAddress().toLowerCase()) {
        throw new Web3AgentError({
          code: "INVALID_PARAMS",
          message: `Typed-data signature signer does not match prepared account for ${id}`,
        });
      }
      return { signature: result.signature };
    }

    throw new OperationPauseError({
      id,
      type: "signTypedData",
      label: "Sign typed data",
      chainId: this.options.chainId,
      eip712: {
        domain: data.domain as Record<string, unknown>,
        types,
        primaryType: data.primaryType,
        message: data.message,
      },
      typedDataHash,
    } satisfies PreparedSignTypedDataAction);
  }

  async sendTransaction(transaction: EVMTransaction): Promise<{ hash: string }> {
    const id = `transaction:${this.transactionIndex++}`;
    const result = this.options.actionResults[id];
    const to = assertAddress(transaction.to, "transaction.to");
    const data =
      transaction.data ??
      (transaction.abi && transaction.functionName
        ? encodeFunctionData({
            abi: transaction.abi as Abi,
            functionName: transaction.functionName,
            args: transaction.args,
          })
        : "0x");
    const action: PreparedTransactionAction = {
      id,
      type: "transaction",
      label: transaction.functionName
        ? `Execute ${transaction.functionName}`
        : `Execute transaction to ${to}`,
      tx: {
        from: this.getAddress(),
        to,
        chainId: this.options.chainId,
        data,
        dataHash: keccak256(data),
        value: (transaction.value ?? 0n).toString(),
      },
    };
    if (result?.type === "transaction") {
      await getConfirmedReceipt(action, result);
      return { hash: result.txHash };
    }

    throw new OperationPauseError(action);
  }

  async read(request: EVMReadRequest): Promise<EVMReadResult> {
    const value = await this.publicClient.readContract({
      address: assertAddress(request.address, "read.address"),
      abi: request.abi as Abi,
      functionName: request.functionName,
      ...(request.args ? { args: request.args } : {}),
    });

    return { value };
  }

  async getNativeBalance(): Promise<bigint> {
    return this.publicClient.getBalance({
      address: this.getAddress(),
    });
  }

  async balanceOf(address: string, tokenAddress?: string) {
    if (!tokenAddress) {
      const value = await this.publicClient.getBalance({
        address: assertAddress(address, "address"),
      });
      return {
        value: value.toString(),
        decimals: this.chain.nativeCurrency.decimals,
        symbol: this.chain.nativeCurrency.symbol,
        name: this.chain.nativeCurrency.name,
        inBaseUnits: value.toString(),
      };
    }

    const normalizedTokenAddress = assertAddress(tokenAddress, "tokenAddress");
    const tokenBalance = await this.publicClient.readContract({
      address: normalizedTokenAddress,
      abi: erc20BalanceAbi,
      functionName: "balanceOf",
      args: [assertAddress(address, "address")],
    });
    const token = lookupTokenByAddress(normalizedTokenAddress, this.options.chainId);

    return {
      value: tokenBalance.toString(),
      decimals: token?.decimals ?? 18,
      symbol: token?.symbol ?? "UNKNOWN",
      name: token?.name ?? "Unknown Token",
      inBaseUnits: tokenBalance.toString(),
    };
  }

  async getTokenInfoByTicker(ticker: string): Promise<Token> {
    const toolHint = this.options.toolName ? ` (triggered by ${this.options.toolName})` : "";
    throw new Web3AgentError({
      code: "GOAT_TOOL_ERROR",
      message: `Token lookup by ticker is not supported in prepared GOAT mode (${ticker})${toolHint}; resolve token addresses before running prepared GOAT tools`,
    });
  }
}
