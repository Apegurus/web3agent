import { type Hex, encodeFunctionData, maxUint256 } from "viem";
import { getConfig } from "../../config/env.js";
import { createPublicClientForRuntimeChain } from "../../operations/chain-access.js";
import { assertAddress } from "../../operations/validation.js";
import {
  PERMIT2_ADDRESS,
  SWAP_PREPARATION_ABI,
  getWrappedNativeToken,
  isNativeTokenAddress,
} from "../../orbs/liquidity-hub.js";
import { getSpotContracts } from "../../orbs/spot-config.js";
import { Web3AgentError } from "../errors.js";
import { orbsGetRequiredApprovalsSchema } from "../schemas.js";
import type { ApprovalStep, GetRequiredApprovalsInput } from "../types.js";
import { parseInput } from "../validation.js";

export async function getRequiredApprovals(
  params: GetRequiredApprovalsInput
): Promise<ApprovalStep[]> {
  const input = parseInput(orbsGetRequiredApprovalsSchema, params);
  const chainId = input.chainId ?? getConfig().chainId;
  const publicClient = createPublicClientForRuntimeChain(chainId);

  try {
    const steps: ApprovalStep[] = [];
    let effectiveFromToken = assertAddress(input.fromToken, "fromToken");
    const mode = input.mode ?? "swap";
    const spender: Hex = mode === "order" ? (getSpotContracts().repermit as Hex) : PERMIT2_ADDRESS;

    if (isNativeTokenAddress(input.fromToken)) {
      const wrapped = getWrappedNativeToken(chainId);
      if (!wrapped) {
        throw new Web3AgentError({
          code: "CHAIN_NOT_SUPPORTED",
          message: `No wrapped native token configured for chain ${chainId}`,
        });
      }

      steps.push({
        type: "wrap",
        label: "Wrap native token",
        tx: {
          to: wrapped,
          data: encodeFunctionData({
            abi: SWAP_PREPARATION_ABI,
            functionName: "deposit",
          }),
          value: input.fromAmount,
        },
      });
      effectiveFromToken = wrapped;
    }

    const allowance = await publicClient.readContract({
      address: effectiveFromToken,
      abi: SWAP_PREPARATION_ABI,
      functionName: "allowance",
      args: [assertAddress(input.account, "account"), spender],
    });

    if ((allowance as bigint) < BigInt(input.fromAmount)) {
      steps.push({
        type: "approve",
        label: input.exactApproval
          ? `Approve ${mode === "order" ? "RePermit" : "Permit2"} (exact amount)`
          : `Approve ${mode === "order" ? "RePermit" : "Permit2"} (unlimited allowance)`,
        tx: {
          to: effectiveFromToken,
          data: encodeFunctionData({
            abi: SWAP_PREPARATION_ABI,
            functionName: "approve",
            args: [spender, input.exactApproval ? BigInt(input.fromAmount) : maxUint256],
          }),
        },
      });
    }

    return steps;
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("APPROVAL_CHECK_ERROR", error);
  }
}
