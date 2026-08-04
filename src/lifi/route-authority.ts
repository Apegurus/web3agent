import { Web3AgentError } from "../api/errors.js";
import { isNativeTokenAddress } from "../orbs/liquidity-hub.js";
import { ROBINHOOD_LIFI_AUTHORITY } from "./robinhood-authority.js";
import type { LifiRoute, LifiRouteRequest } from "./route-execution.js";

function mismatch(message: string): Web3AgentError {
  return new Web3AgentError({ code: "LIFI_ROUTE_AUTHORITY_MISMATCH", message });
}

export function assertTrustedLifiRoute(route: LifiRoute, request: LifiRouteRequest): void {
  if (route.steps.length !== 1 || request.fromChainId !== ROBINHOOD_LIFI_AUTHORITY.chainId) {
    throw mismatch("LI.FI fallback must contain exactly one Robinhood execution step");
  }
  const trustedExecutionTargets = new Set(
    [ROBINHOOD_LIFI_AUTHORITY.diamondAddress, ROBINHOOD_LIFI_AUTHORITY.permit2Proxy].map((value) =>
      value.toLowerCase()
    )
  );
  const trustedSpenders = new Set(
    [
      ROBINHOOD_LIFI_AUTHORITY.diamondAddress,
      ROBINHOOD_LIFI_AUTHORITY.permit2,
      ROBINHOOD_LIFI_AUTHORITY.permit2Proxy,
    ].map((value) => value.toLowerCase())
  );

  let expectedToken = request.fromToken.toLowerCase();
  for (const step of route.steps) {
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
    if (step.action.fromAmount !== request.fromAmount) {
      throw mismatch("LI.FI route input amount differs from the approved amount");
    }
    const approvalAddress = step.estimate?.approvalAddress;
    if (approvalAddress && !trustedSpenders.has(approvalAddress.toLowerCase())) {
      throw mismatch("LI.FI route approval spender is not a canonical chain contract");
    }
    const value = BigInt(transaction.value ?? "0");
    if (
      (isNativeTokenAddress(step.action.fromToken.address) &&
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
