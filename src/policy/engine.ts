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
  estimatedUsd: number;
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

  const rules = [
    () => evaluateX402Limit(policy, request.estimatedUsd, request.toolName),
    () => evaluateSingleTransactionLimit(policy, request.estimatedUsd, request.toolName),
    () => evaluateHourlyLimit(policy, request.estimatedUsd, spend, request.toolName),
    () => evaluateDailyLimit(policy, request.estimatedUsd, spend, request.toolName),
    () =>
      evaluateMinReserve(
        policy,
        request.estimatedUsd,
        request.walletBalanceUsd ?? null,
        request.toolName
      ),
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
