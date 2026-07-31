import type { LiFiStep } from "@lifi/sdk";
import { setAllowance } from "@lifi/sdk";
import { type Hex, parseAbi } from "viem";
import { createPublicClientForRuntimeChain } from "../../operations/chain-access.js";
import { assertAddress, assertHex } from "../../operations/validation.js";
import { isNativeTokenAddress } from "../../orbs/liquidity-hub.js";
import type { PreparedTransactionAction } from "../types.js";

async function createAllowanceAction(params: {
  id: string;
  chainId: number;
  account: Hex;
  tokenAddress: Hex;
  spender: Hex;
  amount: bigint;
  label: string;
}): Promise<PreparedTransactionAction> {
  const publicClient = createPublicClientForRuntimeChain(params.chainId);
  const data = await setAllowance(
    publicClient,
    params.tokenAddress,
    params.spender,
    params.amount,
    undefined,
    true
  );

  return {
    id: params.id,
    type: "transaction",
    label: params.label,
    tx: {
      from: params.account,
      to: params.tokenAddress,
      chainId: params.chainId,
      data: assertHex(data, `${params.id}.tx.data`),
      value: "0",
    },
  };
}

export function needsLifiBridgeApproval(quote: LiFiStep, fromTokenAddress: Hex): boolean {
  return !isNativeTokenAddress(fromTokenAddress) && !quote.estimate?.skipApproval;
}

export function getDefaultLifiApprovalSpender(
  quote: LiFiStep,
  finalAction: PreparedTransactionAction
): Hex {
  return assertAddress(
    quote.estimate?.approvalAddress ?? finalAction.tx.to,
    quote.estimate?.approvalAddress ? "quote.estimate.approvalAddress" : "bridge.tx.to"
  );
}

export async function getLifiApprovalActions(params: {
  chainId: number;
  account: Hex;
  fromTokenAddress: Hex;
  fromAmount: bigint;
  spender: Hex;
  approvalReset?: boolean;
  approvalAmount: bigint;
  approvalLabel: string;
}): Promise<PreparedTransactionAction[]> {
  const publicClient = createPublicClientForRuntimeChain(params.chainId);
  const allowance = (await publicClient.readContract({
    address: params.fromTokenAddress,
    abi: parseAbi(["function allowance(address owner, address spender) view returns (uint256)"]),
    functionName: "allowance",
    args: [params.account, params.spender],
  })) as bigint;

  if (params.fromAmount <= allowance) {
    return [];
  }

  const approvalActions: PreparedTransactionAction[] = [];
  if (params.approvalReset && allowance > 0n) {
    approvalActions.push(
      await createAllowanceAction({
        id: "bridge:approval-reset:0",
        chainId: params.chainId,
        account: params.account,
        tokenAddress: params.fromTokenAddress,
        spender: params.spender,
        amount: 0n,
        label: "Reset bridge spender approval",
      })
    );
  }

  approvalActions.push(
    await createAllowanceAction({
      id: "bridge:approval:0",
      chainId: params.chainId,
      account: params.account,
      tokenAddress: params.fromTokenAddress,
      spender: params.spender,
      amount: params.approvalAmount,
      label: params.approvalLabel,
    })
  );

  return approvalActions;
}
