import type { Quote } from "@orbs-network/liquidity-hub-sdk";
import { getConfig } from "../../config/env.js";
import { assertAddress } from "../../operations/validation.js";
import { getLiquidityHubError, isLiquidityHubSupported } from "../../orbs/chains.js";
import {
  getIntentQuote,
  normalizeEip712ForSigning,
  resolveSwapQuoteFromToken,
  submitSwap,
} from "../../orbs/liquidity-hub.js";
import { Web3AgentError } from "../errors.js";
import { orbsSwapResumeStateStateSchema } from "../schemas.js";
import type {
  OperationActionResult,
  OperationResumeState,
  PrepareSwapIntentInput,
  PreparedOperation,
  ResumeOperationCompletedResult,
  SubmitSignedSwapInput,
  SwapIntent,
  SwapSubmissionResult,
} from "../types.js";
import { parseInput } from "../validation.js";
import { getRequiredApprovals } from "./orbs-approvals.js";
import {
  assertResumeStateIntegrity,
  authenticatePreparedOperation,
} from "./resume-state-integrity.js";
import {
  asQuote,
  assertActionResultType,
  assertSubmitSwapQuote,
  buildPreparedOperation,
  createPreparedApprovalActions,
  createTypedDataAction,
  getPendingPreparedActions,
  toPendingOperation,
} from "./shared.js";

interface RawOrbsQuote extends Quote {
  sessionId: string;
  inToken: string;
  outToken: string;
  inAmount: string;
  outAmount: string;
  minAmountOut: string;
  user: string;
  permitData?: Record<string, unknown>;
  eip712?: {
    domain?: Record<string, unknown>;
    types?: Record<string, Array<{ name: string; type: string }>>;
    primaryType?: string;
    message?: Record<string, unknown>;
  };
}

function toSwapIntentQuote(quote: RawOrbsQuote): SwapIntent["quote"] {
  return {
    ...quote,
    sessionId: quote.sessionId,
    inToken: quote.inToken,
    outToken: quote.outToken,
    inAmount: quote.inAmount,
    outAmount: quote.outAmount,
    minAmountOut: quote.minAmountOut,
    user: quote.user,
  };
}

export async function prepareSwapOperation(
  input: PrepareSwapIntentInput
): Promise<PreparedOperation> {
  const chainId = input.chainId ?? getConfig().chainId;
  if (!isLiquidityHubSupported(chainId)) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: getLiquidityHubError(chainId),
    });
  }

  try {
    const quote = (await getIntentQuote(chainId, {
      fromToken: resolveSwapQuoteFromToken(chainId, input.fromToken),
      toToken: input.toToken,
      inAmount: input.fromAmount,
      slippage: input.slippagePct,
      account: input.account,
    })) as RawOrbsQuote;
    const rawPrimaryType = quote.eip712?.primaryType ?? "PermitWitnessTransferFrom";
    const rawMessage = quote.eip712?.message ?? quote.permitData;
    if (!quote.eip712?.domain || !quote.eip712.types || !rawMessage) {
      throw new Web3AgentError({
        code: "ORBS_QUOTE_ERROR",
        message: "Quote did not include EIP-712 signing payload",
      });
    }

    const eip712 = normalizeEip712ForSigning(
      quote.eip712.domain,
      quote.eip712.types,
      rawPrimaryType,
      rawMessage
    );
    const requiredApprovals = await getRequiredApprovals({
      chainId,
      fromToken: input.fromToken,
      fromAmount: input.fromAmount,
      account: input.account,
    });
    const approvalActions = createPreparedApprovalActions(
      chainId,
      assertAddress(input.account, "account"),
      requiredApprovals
    );
    const signAction = createTypedDataAction(chainId, "Sign swap intent", eip712);
    const intent: SwapIntent = {
      eip712,
      quote: toSwapIntentQuote({
        ...quote,
        user: typeof quote.user === "string" ? quote.user : input.account,
      }),
      requiredApprovals,
      chainId,
    };

    return authenticatePreparedOperation(
      buildPreparedOperation(
        "orbs",
        "swap",
        `Prepare Orbs swap on chain ${chainId}`,
        approvalActions.length > 0 ? approvalActions : [signAction],
        {
          summary: `Prepare Orbs swap on chain ${chainId}`,
          intent,
          quote: intent.quote,
          chainId,
          approvalActions,
          signAction,
        },
        { intent }
      )
    );
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("ORBS_QUOTE_ERROR", error);
  }
}

export async function resumeOrbsSwapOperation(
  resumeState: OperationResumeState,
  actionResults: Record<string, OperationActionResult>
): Promise<ResumeOperationCompletedResult | { completed: false; operation: PreparedOperation }> {
  assertResumeStateIntegrity(resumeState);
  const state = parseInput(orbsSwapResumeStateStateSchema, resumeState.state);
  const pendingApprovals = await getPendingPreparedActions(state.approvalActions, actionResults);
  if (pendingApprovals.length > 0) {
    return {
      completed: false,
      operation: toPendingOperation(
        resumeState,
        pendingApprovals,
        "Resume Orbs swap approvals",
        actionResults
      ),
    };
  }

  const signatureResult = assertActionResultType(actionResults, state.signAction.id, "signature");
  if (!signatureResult) {
    return {
      completed: false,
      operation: toPendingOperation(
        resumeState,
        [state.signAction],
        "Resume Orbs swap signing",
        actionResults
      ),
    };
  }

  const result = await submitSwap({
    chainId: state.chainId,
    quote: asQuote(assertSubmitSwapQuote(state.quote)),
    signature: signatureResult.signature,
  });
  return {
    completed: true,
    integration: "orbs",
    kind: "swap",
    result: { ...result },
  };
}

export async function submitSignedSwapDirect(
  params: SubmitSignedSwapInput
): Promise<SwapSubmissionResult> {
  const chainId = params.chainId ?? getConfig().chainId;
  return submitSwap({
    chainId,
    quote: asQuote(assertSubmitSwapQuote(params.quote)),
    signature: params.signature,
  });
}
