import {
  evaluateDailyLimit,
  evaluateHourlyLimit,
  evaluateMinReserve,
  evaluateSingleTransactionLimit,
  evaluateX402Limit,
} from "./rules.js";
import { getSpendWindow } from "./spend-tracker.js";
import type {
  PolicyAction,
  PolicyDecision,
  RiskLevel,
  SpendWindow,
  TreasuryPolicy,
} from "./types.js";

export interface PolicyEvaluationRequest {
  toolName: string;
  riskLevel: RiskLevel;
  estimatedUsd: number | null;
  walletBalanceUsd?: number | null;
}

function buildDecision(
  action: PolicyAction,
  reasonCode: string,
  message: string,
  request: PolicyEvaluationRequest,
  spend: SpendWindow,
  policy: TreasuryPolicy
): PolicyDecision {
  return {
    action,
    reasonCode,
    message,
    riskLevel: request.riskLevel,
    toolName: request.toolName,
    currentSpend: spend,
    appliedPolicy: policy,
  };
}

export function evaluatePolicy(
  policy: TreasuryPolicy,
  request: PolicyEvaluationRequest
): PolicyDecision {
  const spend = getSpendWindow();

  if (!policy.enabled) {
    return buildDecision(
      "allow",
      "POLICY_DISABLED",
      "Treasury policy is disabled",
      request,
      spend,
      policy
    );
  }

  if (request.riskLevel === "safe") {
    return buildDecision(
      "allow",
      "SAFE_TOOL",
      "Read-only tools are always allowed",
      request,
      spend,
      policy
    );
  }

  if (request.estimatedUsd === null) {
    // Financial tools MUST have an enforceable USD estimate.
    // null means the estimator couldn't parse the tool's args — deny to prevent bypass.
    if (request.riskLevel === "financial") {
      return buildDecision(
        "deny",
        "UNESTIMABLE_FINANCIAL_WRITE",
        `${request.toolName}: cannot estimate USD value for financial tool — spend limits cannot be enforced`,
        request,
        spend,
        policy
      );
    }
    // Non-financial tools (destructive, etc.) with no token amount are gas-only.
    return buildDecision(
      "allow",
      "GAS_ONLY",
      `${request.toolName}: gas-only operation — no token amount to enforce`,
      request,
      spend,
      policy
    );
  }

  if (request.estimatedUsd === 0) {
    return buildDecision(
      "deny",
      "USD_ESTIMATION_FAILED",
      `${request.toolName}: USD estimation failed — cannot verify spend limits for ${request.riskLevel} tool`,
      request,
      spend,
      policy
    );
  }

  const estimatedUsd = request.estimatedUsd;

  const rules = [
    () => evaluateX402Limit(policy, estimatedUsd, request.toolName),
    () => evaluateSingleTransactionLimit(policy, estimatedUsd, request.toolName),
    () => evaluateHourlyLimit(policy, estimatedUsd, spend, request.toolName),
    () => evaluateDailyLimit(policy, estimatedUsd, spend, request.toolName),
    () =>
      evaluateMinReserve(policy, estimatedUsd, request.walletBalanceUsd ?? null, request.toolName),
  ];

  for (const rule of rules) {
    const result = rule();
    if (result?.action === "deny") {
      return buildDecision("deny", result.reasonCode, result.message, request, spend, policy);
    }
  }

  return buildDecision(
    "allow",
    "ALLOWED",
    "All treasury policy checks passed",
    request,
    spend,
    policy
  );
}
