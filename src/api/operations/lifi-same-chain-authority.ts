import { decodeFunctionData, erc20Abi } from "viem";
import { isNativeTokenAddress } from "../../orbs/liquidity-hub.js";
import { Web3AgentError } from "../errors.js";
import type {
  LifiSameChainSwapOperationInput,
  PreparedAction,
  PreparedTransactionAction,
} from "../types.js";
import type { ExtendedChain } from "./lifi-facts.js";

type TrustedLifiSameChainPlan = {
  readonly chain: ExtendedChain;
  readonly finalAction: PreparedTransactionAction;
  readonly input: LifiSameChainSwapOperationInput;
  readonly stages: readonly (readonly PreparedAction[])[];
};

function authorityMismatch(message: string): Web3AgentError {
  return new Web3AgentError({ code: "LIFI_ROUTE_AUTHORITY_MISMATCH", message });
}

export function assertTrustedLifiSameChainPlan(plan: TrustedLifiSameChainPlan): void {
  const { chain, finalAction, input, stages } = plan;
  const diamond = chain.diamondAddress?.toLowerCase();
  const permit2 = chain.permit2?.toLowerCase();
  const permit2Proxy = chain.permit2Proxy?.toLowerCase();
  if (!diamond) {
    throw authorityMismatch("LI.FI chain metadata has no canonical diamond address");
  }

  const trustedExecutionTargets = new Set([diamond, permit2Proxy].filter((value) => !!value));
  if (!trustedExecutionTargets.has(finalAction.tx.to.toLowerCase())) {
    throw authorityMismatch("LI.FI execution target is not a canonical chain contract");
  }
  if (
    finalAction.tx.chainId !== input.fromChainId ||
    !finalAction.tx.from ||
    finalAction.tx.from.toLowerCase() !== input.account.toLowerCase()
  ) {
    throw authorityMismatch("LI.FI execution does not match the approved chain and wallet");
  }
  const executionValue = BigInt(finalAction.tx.value ?? "0");
  const expectedValue = BigInt(input.fromAmount);
  if (
    (isNativeTokenAddress(input.fromToken) && executionValue !== expectedValue) ||
    (!isNativeTokenAddress(input.fromToken) && executionValue !== 0n)
  ) {
    throw authorityMismatch("LI.FI execution value does not match the approved input asset");
  }

  const trustedSpenders = new Set([diamond, permit2, permit2Proxy].filter((value) => !!value));
  for (const action of stages.flat()) {
    if (action.type !== "transaction") continue;
    if (
      action.tx.chainId !== input.fromChainId ||
      !action.tx.from ||
      action.tx.from.toLowerCase() !== input.account.toLowerCase() ||
      action.tx.to.toLowerCase() !== input.fromToken.toLowerCase() ||
      action.tx.value !== "0" ||
      !action.tx.data
    ) {
      throw authorityMismatch("LI.FI approval does not match the approved token, chain, or wallet");
    }
    let decoded: ReturnType<typeof decodeFunctionData>;
    try {
      decoded = decodeFunctionData({ abi: erc20Abi, data: action.tx.data });
    } catch (error: unknown) {
      throw new Web3AgentError({
        code: "LIFI_ROUTE_AUTHORITY_MISMATCH",
        message: "LI.FI approval calldata is not a canonical ERC-20 approval",
        cause: error,
      });
    }
    if (decoded.functionName !== "approve" || !decoded.args) {
      throw authorityMismatch("LI.FI approval calldata is not a canonical ERC-20 approval");
    }
    const [spender, amount] = decoded.args;
    if (typeof spender !== "string" || typeof amount !== "bigint") {
      throw authorityMismatch("LI.FI approval calldata has invalid arguments");
    }
    if (!trustedSpenders.has(spender.toLowerCase())) {
      throw authorityMismatch("LI.FI approval spender is not a canonical chain contract");
    }
    if (spender.toLowerCase() !== permit2 && amount > expectedValue) {
      throw authorityMismatch("LI.FI approval amount exceeds the approved swap amount");
    }
  }
}
