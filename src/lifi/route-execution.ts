import { convertQuoteToRoute, executeRoute, getQuote } from "@lifi/sdk";
import { type Address, type Hex, encodeFunctionData, erc20Abi } from "viem";
import { Web3AgentError } from "../api/errors.js";
import { getChainById } from "../chains/registry.js";
import { createWalletClientForChain } from "../config/wallet-factory.js";
import { createPublicClientForRuntimeChain } from "../operations/chain-access.js";
import { assertAddress, assertHex } from "../operations/validation.js";
import { isNativeTokenAddress } from "../orbs/liquidity-hub.js";
import { getActiveAccount } from "../wallet/persistence.js";
import { ensureLifiInitialized, withLifiExecutionAccount } from "./config.js";
import { assertTrustedLifiRoute } from "./route-authority.js";

export type LifiRoute = ReturnType<typeof convertQuoteToRoute>;

export type LifiPreparedRouteExecutionResult =
  | { readonly status: "completed"; readonly message: string; readonly txHash: Hex }
  | {
      readonly status: "submitted";
      readonly stage: "approval" | "execution";
      readonly message: string;
      readonly txHash: Hex;
    };

export type LifiRouteRequest = {
  readonly account: Address;
  readonly fromChainId: number;
  readonly toChainId: number;
  readonly fromToken: string;
  readonly toToken: string;
  readonly fromAmount: string;
  readonly slippagePct?: number;
};

export async function prepareLifiRoute(params: LifiRouteRequest): Promise<LifiRoute> {
  ensureLifiInitialized();
  const quote = await getQuote({
    fromChain: params.fromChainId,
    toChain: params.toChainId,
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.account,
    ...(params.slippagePct === undefined ? {} : { slippage: params.slippagePct / 100 }),
  });
  const route = convertQuoteToRoute(quote);
  if (params.fromChainId === 4663 && params.toChainId === 4663) {
    assertTrustedLifiRoute(route, params);
  }
  return route;
}

export async function executePreparedLifiRoute(
  route: LifiRoute
): Promise<LifiPreparedRouteExecutionResult> {
  const account = getActiveAccount();
  let finalTxHash: Hex | undefined;

  for (const step of route.steps) {
    const transaction = step.transactionRequest;
    if (!transaction?.to || !transaction.data) {
      throw new Web3AgentError({
        code: "LIFI_ROUTE_TRANSACTION_MISSING",
        message: `LI.FI route step ${step.id} has no persisted transaction request`,
      });
    }
    if (step.action.fromChainId !== step.action.toChainId) {
      throw new Web3AgentError({
        code: "LIFI_ROUTE_CROSS_CHAIN_UNSUPPORTED",
        message: "Persisted direct LI.FI execution only supports same-chain routes",
      });
    }
    if (
      (transaction.chainId !== undefined && transaction.chainId !== step.action.fromChainId) ||
      (transaction.from !== undefined &&
        transaction.from.toLowerCase() !== account.address.toLowerCase())
    ) {
      throw new Web3AgentError({
        code: "LIFI_ROUTE_CHAIN_MISMATCH",
        message: `LI.FI route step ${step.id} transaction does not match the approved chain or wallet`,
      });
    }
    const chainId = step.action.fromChainId;
    const chain = getChainById(chainId);
    if (!chain) {
      throw new Web3AgentError({
        code: "CHAIN_NOT_SUPPORTED",
        message: `Chain ${chainId} is not supported`,
      });
    }
    const publicClient = createPublicClientForRuntimeChain(chainId);
    const walletClient = createWalletClientForChain(account, chainId);
    const token = assertAddress(step.action.fromToken.address, `${step.id}.fromToken`);
    const spender = assertAddress(
      step.estimate?.approvalAddress ?? transaction.to,
      `${step.id}.approvalAddress`
    );
    const amount = BigInt(step.action.fromAmount);

    if (!isNativeTokenAddress(token) && !step.estimate?.skipApproval) {
      const allowance = await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account.address, spender],
      });
      if (allowance < amount) {
        const approvalHash = await walletClient.sendTransaction({
          account,
          chain,
          to: token,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [spender, amount],
          }),
        });
        const approvalReceipt = await publicClient
          .waitForTransactionReceipt({ hash: approvalHash })
          .then(
            (receipt) => receipt,
            () => undefined
          );
        if (!approvalReceipt) {
          return {
            status: "submitted",
            stage: "approval",
            message: "LI.FI approval transaction submitted; receipt status is uncertain",
            txHash: approvalHash,
          };
        }
        if (approvalReceipt.status !== "success") {
          throw new Web3AgentError({
            code: "LIFI_APPROVAL_FAILED",
            message: `LI.FI route approval failed for step ${step.id}`,
          });
        }
      }
    }

    finalTxHash = await walletClient.sendTransaction({
      account,
      chain,
      to: assertAddress(transaction.to, `${step.id}.transaction.to`),
      data: assertHex(transaction.data, `${step.id}.transaction.data`),
      value: BigInt(transaction.value ?? "0"),
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: finalTxHash }).then(
      (confirmedReceipt) => confirmedReceipt,
      () => undefined
    );
    if (!receipt) {
      return {
        status: "submitted",
        stage: "execution",
        message: "LI.FI route transaction submitted; receipt status is uncertain",
        txHash: finalTxHash,
      };
    }
    if (receipt.status !== "success") {
      throw new Web3AgentError({
        code: "LIFI_ROUTE_EXECUTION_FAILED",
        message: `LI.FI route transaction failed for step ${step.id}`,
      });
    }
  }

  if (!finalTxHash) {
    throw new Web3AgentError({
      code: "LIFI_ROUTE_EMPTY",
      message: "LI.FI route has no executable steps",
    });
  }
  return { status: "completed", message: "LI.FI route executed successfully", txHash: finalTxHash };
}

export async function executeLifiRoute(
  params: LifiRouteRequest
): Promise<{ readonly status: "completed"; readonly message: string }> {
  return withLifiExecutionAccount(params.account, async () => {
    requireLifiAccount(params.account);
    const route = await prepareLifiRoute(params);
    requireLifiAccount(params.account);
    await executeRoute(route, {
      updateRouteHook: (updatedRoute) => {
        const step = updatedRoute.steps?.[0];
        if (step?.execution) {
          process.stderr.write(
            `[web3agent] LI.FI route progress: ${JSON.stringify(step.execution.process)}\n`
          );
        }
      },
    });
    return { status: "completed", message: "LI.FI route executed successfully" };
  });
}

function requireLifiAccount(expected: Address): void {
  const active = getActiveAccount().address;
  if (active.toLowerCase() !== expected.toLowerCase()) {
    throw new Web3AgentError({
      code: "LIFI_WALLET_MISMATCH",
      message: `LI.FI execution was prepared for wallet ${expected} but active wallet is ${active}`,
    });
  }
}
