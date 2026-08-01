import { Web3AgentError } from "../api/errors.js";
import { isNativeTokenAddress } from "../orbs/liquidity-hub.js";
import type { LifiRoute, LifiRouteRequest } from "./route-execution.js";

type LifiChainAuthority = {
  readonly id: number;
  readonly diamondAddress?: string;
  readonly permit2?: string;
  readonly permit2Proxy?: string;
};

function mismatch(message: string): Web3AgentError {
  return new Web3AgentError({ code: "LIFI_ROUTE_AUTHORITY_MISMATCH", message });
}

export function assertTrustedLifiRoute(
  route: LifiRoute,
  request: LifiRouteRequest,
  chain: LifiChainAuthority
): void {
  if (route.steps.length === 0 || chain.id !== request.fromChainId) {
    throw mismatch("LI.FI route has no executable step or trusted chain metadata");
  }
  const trustedExecutionTargets = new Set(
    [chain.diamondAddress, chain.permit2Proxy]
      .filter((value): value is string => value !== undefined)
      .map((value) => value.toLowerCase())
  );
  const trustedSpenders = new Set(
    [chain.diamondAddress, chain.permit2, chain.permit2Proxy]
      .filter((value): value is string => value !== undefined)
      .map((value) => value.toLowerCase())
  );
  if (!chain.diamondAddress || trustedExecutionTargets.size === 0) {
    throw mismatch("LI.FI chain metadata has no canonical execution contract");
  }

  let expectedToken = request.fromToken.toLowerCase();
  for (const [index, step] of route.steps.entries()) {
    const transaction = step.transactionRequest;
    if (
      step.action.fromChainId !== request.fromChainId ||
      step.action.toChainId !== request.toChainId ||
      step.action.fromToken.address.toLowerCase() !== expectedToken ||
      !transaction?.to ||
      !trustedExecutionTargets.has(transaction.to.toLowerCase()) ||
      (transaction.chainId !== undefined && transaction.chainId !== request.fromChainId) ||
      (transaction.from !== undefined &&
        transaction.from.toLowerCase() !== request.account.toLowerCase())
    ) {
      throw mismatch(`LI.FI route step ${step.id} is outside the approved authority boundary`);
    }
    if (index === 0 && step.action.fromAmount !== request.fromAmount) {
      throw mismatch("LI.FI route input amount differs from the approved amount");
    }
    const approvalAddress = step.estimate?.approvalAddress;
    if (approvalAddress && !trustedSpenders.has(approvalAddress.toLowerCase())) {
      throw mismatch("LI.FI route approval spender is not a canonical chain contract");
    }
    const value = BigInt(transaction.value ?? "0");
    if (
      (isNativeTokenAddress(step.action.fromToken.address) &&
        index === 0 &&
        value !== BigInt(request.fromAmount)) ||
      (!isNativeTokenAddress(step.action.fromToken.address) && value !== 0n)
    ) {
      throw mismatch("LI.FI route transaction value does not match the approved input asset");
    }
    expectedToken = step.action.toToken.address.toLowerCase();
  }
  if (expectedToken !== request.toToken.toLowerCase()) {
    throw mismatch("LI.FI route output token differs from the approved token");
  }
}
