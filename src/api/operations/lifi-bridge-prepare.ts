import { maxUint256 } from "viem";
import { assertAddress, parseBigIntString } from "../../operations/validation.js";
import { Web3AgentError } from "../errors.js";
import type {
  BridgeIntent,
  BridgeTxStep,
  PrepareBridgeIntentInput,
  PreparedAction,
  PreparedOperation,
  PreparedSignTypedDataAction,
  PreparedTransactionAction,
} from "../types.js";
import {
  getDefaultLifiApprovalSpender,
  getLifiApprovalActions,
  needsLifiBridgeApproval,
} from "./lifi-approvals.js";
import type { LifiBridgeFinalization } from "./lifi-facts.js";
import { getPermit2TypedData } from "./lifi-permit2.js";
import {
  createBridgeIntentPayload,
  createBridgeTxStep,
  createBridgeTxSteps,
  getLifiBridgePreparationContext,
  toBridgeStepLabel,
} from "./lifi-quote.js";
import { buildPreparedOperation } from "./shared.js";

export async function prepareCompatibilityBridgeIntent(
  input: PrepareBridgeIntentInput
): Promise<BridgeIntent> {
  try {
    const { quote, account, fromTokenAddress, fromAmount, finalAction } =
      await getLifiBridgePreparationContext(input);
    const actions: PreparedTransactionAction[] = [];
    const steps: BridgeTxStep[] = [];

    if (needsLifiBridgeApproval(quote, fromTokenAddress)) {
      const approvalActions = await getLifiApprovalActions({
        chainId: input.fromChainId,
        account,
        fromTokenAddress,
        fromAmount,
        spender: getDefaultLifiApprovalSpender(quote, finalAction),
        approvalReset: quote.estimate?.approvalReset,
        approvalAmount: input.approvalAmount
          ? parseBigIntString(input.approvalAmount, "approvalAmount")
          : maxUint256,
        approvalLabel: "Approve token for bridge",
      });
      actions.push(...approvalActions);
      steps.push(...createBridgeTxSteps("approval", approvalActions));
    }

    actions.push(finalAction);
    steps.push(createBridgeTxStep("bridge", finalAction));
    return createBridgeIntentPayload(input, quote, steps, actions);
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("BRIDGE_INTENT_ERROR", error);
  }
}

export async function prepareBridgeOperation(
  input: PrepareBridgeIntentInput
): Promise<PreparedOperation> {
  try {
    const { quote, summary, account, fromTokenAddress, fromAmount, finalAction, fromChain } =
      await getLifiBridgePreparationContext(input, { includeFromChain: true });
    const stages: PreparedAction[][] = [];
    const steps: BridgeTxStep[] = [];
    let finalization: LifiBridgeFinalization = { kind: "none" };
    const diamondAddress = fromChain?.diamondAddress
      ? assertAddress(fromChain.diamondAddress, "fromChain.diamondAddress")
      : undefined;
    const needsAllowanceCheck = needsLifiBridgeApproval(quote, fromTokenAddress);
    const permit2Eligible =
      needsAllowanceCheck &&
      !!fromChain?.permit2 &&
      !!fromChain?.permit2Proxy &&
      !!diamondAddress &&
      !quote.estimate?.skipPermit &&
      !!finalAction.tx.data &&
      finalAction.tx.to.toLowerCase() === diamondAddress.toLowerCase();

    if (needsAllowanceCheck) {
      const approvalActions = await getLifiApprovalActions({
        chainId: input.fromChainId,
        account,
        fromTokenAddress,
        fromAmount,
        spender: permit2Eligible
          ? assertAddress(fromChain?.permit2 ?? "", "fromChain.permit2")
          : getDefaultLifiApprovalSpender(quote, finalAction),
        approvalReset: quote.estimate?.approvalReset,
        approvalAmount: permit2Eligible
          ? maxUint256
          : input.approvalAmount
            ? parseBigIntString(input.approvalAmount, "approvalAmount")
            : fromAmount,
        approvalLabel: permit2Eligible
          ? "Approve Permit2 (unlimited allowance)"
          : toBridgeStepLabel("approval"),
      });

      if (approvalActions.length > 0) {
        stages.push(approvalActions);
        steps.push(...createBridgeTxSteps("approval", approvalActions));
      }

      if (permit2Eligible && fromChain) {
        const permit2 = await getPermit2TypedData({
          account,
          tokenAddress: fromTokenAddress,
          amount: fromAmount,
          chain: fromChain,
          finalAction,
        });
        const permit2Action: PreparedSignTypedDataAction = {
          id: "bridge:permit2:0",
          type: "signTypedData",
          label: "Sign Permit2 authorization",
          chainId: input.fromChainId,
          eip712: permit2.typedData,
        };
        stages.push([permit2Action]);
        finalization = {
          kind: "permit2",
          signatureActionId: permit2Action.id,
          tokenAddress: fromTokenAddress,
          amount: fromAmount.toString(),
          nonce: permit2.nonce,
          deadline: permit2.deadline,
          permit2Proxy: assertAddress(fromChain.permit2Proxy ?? "", "fromChain.permit2Proxy"),
          permit2: assertAddress(fromChain.permit2 ?? "", "fromChain.permit2"),
          account,
          witness: true,
          diamondAddress: permit2.diamondAddress,
          diamondCalldataHash: permit2.diamondCalldataHash,
        };
      }
    }

    steps.push(createBridgeTxStep("bridge", finalAction));
    const actions = [...stages.flat(), finalAction];
    const intent = createBridgeIntentPayload(input, quote, steps, actions);

    return buildPreparedOperation(
      "lifi",
      "bridge",
      summary,
      stages[0] ?? [finalAction],
      {
        summary,
        intent,
        operation: input,
        stages,
        finalAction,
        finalization,
      },
      { intent }
    );
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("BRIDGE_INTENT_ERROR", error);
  }
}
