import {
  evaluateDailyLimit,
  evaluateHourlyLimit,
  evaluateMinReserve,
  evaluateSingleTransactionLimit,
  evaluateX402Limit,
} from "./rules.js";
import { getSpendWindow } from "./spend-tracker.js";
import type { PolicyDecision, RiskLevel, TreasuryPolicy } from "./types.js";

export interface PolicyEvaluationRequest {
  toolName: string;
  riskLevel: RiskLevel;
  estimatedUsd: number;
  walletBalanceUsd?: number | null;
}

export function evaluatePolicy(
  policy: TreasuryPolicy,
  request: PolicyEvaluationRequest
): PolicyDecision {
  const spend = getSpendWindow();

  if (!policy.enabled) {
    return {
      action: "allow",
      reasonCode: "POLICY_DISABLED",
      message: "Treasury policy is disabled",
      riskLevel: request.riskLevel,
      toolName: request.toolName,
      currentSpend: spend,
      appliedPolicy: policy,
    };
  }

  if (request.riskLevel === "safe") {
    return {
      action: "allow",
      reasonCode: "SAFE_TOOL",
      message: "Read-only tools are always allowed",
      riskLevel: request.riskLevel,
      toolName: request.toolName,
      currentSpend: spend,
      appliedPolicy: policy,
    };
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
      return {
        action: "deny",
        reasonCode: result.reasonCode,
        message: result.message,
        riskLevel: request.riskLevel,
        toolName: request.toolName,
        currentSpend: spend,
        appliedPolicy: policy,
      };
    }
  }

  return {
    action: "allow",
    reasonCode: "ALLOWED",
    message: "All treasury policy checks passed",
    riskLevel: request.riskLevel,
    toolName: request.toolName,
    currentSpend: spend,
    appliedPolicy: policy,
  };
}
