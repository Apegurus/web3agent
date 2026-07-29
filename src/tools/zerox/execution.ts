import { encodeFunctionData, erc20Abi } from "viem";
import { Web3AgentError } from "../../api/errors.js";
import { getChainById } from "../../chains/registry.js";
import { createWalletClientForChain } from "../../config/wallet-factory.js";
import { executePreparedLifiRoute } from "../../lifi/route-execution.js";
import { assertAddress } from "../../operations/validation.js";
import { formatToolResponse } from "../../utils/errors.js";
import { getActiveAccount } from "../../wallet/persistence.js";
import {
  ROBINHOOD_CHAIN_ID,
  hasSameAddress,
  requireValidConfirmedExecution,
  zeroExConfirmedSwapSchema,
} from "./confirmed-execution.js";
import { getLifiRouteIntegrityHash, zeroExLifiFallbackSchema } from "./lifi-confirmation.js";

export async function executeConfirmedZeroExSwap(params: Record<string, unknown>) {
  const parsed = zeroExConfirmedSwapSchema.safeParse(params);
  if (!parsed.success) {
    throw new Web3AgentError({
      code: "ZEROEX_CONFIRMED_EXECUTION_INVALID",
      message: "Confirmed 0x execution facts are invalid",
    });
  }
  const { execution } = parsed.data;
  requireValidConfirmedExecution(execution, parsed.data.fromAmount);
  const account = getActiveAccount();
  if (!hasSameAddress(account.address, execution.taker)) {
    throw new Web3AgentError({
      code: "ZEROEX_CONFIRMED_TAKER_MISMATCH",
      message: "Confirmed 0x taker does not match the active wallet",
    });
  }
  const chain = getChainById(ROBINHOOD_CHAIN_ID);
  if (!chain) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: `Chain ${ROBINHOOD_CHAIN_ID} is not supported`,
    });
  }
  const walletClient = createWalletClientForChain(account, ROBINHOOD_CHAIN_ID);
  if (execution.allowance) {
    await walletClient.sendTransaction({
      account,
      chain,
      to: assertAddress(parsed.data.fromToken, "fromToken"),
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [
          assertAddress(execution.allowance.target, "allowance target"),
          BigInt(execution.allowance.amount),
        ],
      }),
    });
  }
  const txHash = await walletClient.sendTransaction({
    account,
    chain,
    to: assertAddress(execution.transaction.to, "transaction target"),
    data: execution.transaction.data,
    value: BigInt(execution.transaction.value),
  });
  return formatToolResponse({
    status: "completed",
    txHash,
    provider: "0x",
    chainId: ROBINHOOD_CHAIN_ID,
    adapterSource: execution.adapterSource,
    capabilityDecisionId: execution.capabilityDecisionId,
    capabilityReason: execution.capabilityReason,
  });
}

export async function executeConfirmedLifiFallback(params: Record<string, unknown>) {
  const parsed = zeroExLifiFallbackSchema.safeParse(params);
  if (!parsed.success) {
    throw new Web3AgentError({
      code: "ZEROEX_LIFI_FALLBACK_INVALID",
      message: "Confirmed LI.FI fallback facts are invalid",
    });
  }
  if (parsed.data.routeIntegrityHash !== getLifiRouteIntegrityHash(parsed.data.preparedRoute)) {
    throw new Web3AgentError({
      code: "ZEROEX_LIFI_ROUTE_TAMPERED",
      message: "Confirmed LI.FI route no longer matches the approved payload",
    });
  }
  const result = await executePreparedLifiRoute(parsed.data.preparedRoute);
  return formatToolResponse({
    ...result,
    provider: "lifi",
    adapterSource: "lifi",
    fallbackReason: parsed.data.fallbackReason,
    fallbackHistory: [{ provider: "0x", reason: parsed.data.fallbackReason }],
  });
}
