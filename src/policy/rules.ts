import type { PolicyAction, RiskLevel, SpendWindow, TreasuryPolicy } from "./types.js";

export interface RuleResult {
  action: PolicyAction;
  reasonCode: string;
  message: string;
}

export function evaluateSingleTransactionLimit(
  policy: TreasuryPolicy,
  estimatedUsd: number,
  toolName: string
): RuleResult | null {
  if (estimatedUsd <= policy.maxSingleTransactionUsd) return null;

  return {
    action: "deny",
    reasonCode: "SINGLE_TX_LIMIT",
    message: `${toolName}: estimated $${estimatedUsd.toFixed(2)} exceeds single-transaction limit of $${policy.maxSingleTransactionUsd.toFixed(2)}`,
  };
}

export function evaluateHourlyLimit(
  policy: TreasuryPolicy,
  estimatedUsd: number,
  spend: SpendWindow,
  toolName: string
): RuleResult | null {
  const projected = spend.hourlyUsd + estimatedUsd;
  if (projected <= policy.maxHourlyUsd) return null;

  return {
    action: "deny",
    reasonCode: "HOURLY_LIMIT",
    message: `${toolName}: projected hourly spend $${projected.toFixed(2)} exceeds limit of $${policy.maxHourlyUsd.toFixed(2)} (already spent $${spend.hourlyUsd.toFixed(2)} this hour)`,
  };
}

export function evaluateDailyLimit(
  policy: TreasuryPolicy,
  estimatedUsd: number,
  spend: SpendWindow,
  toolName: string
): RuleResult | null {
  const projected = spend.dailyUsd + estimatedUsd;
  if (projected <= policy.maxDailyUsd) return null;

  return {
    action: "deny",
    reasonCode: "DAILY_LIMIT",
    message: `${toolName}: projected daily spend $${projected.toFixed(2)} exceeds limit of $${policy.maxDailyUsd.toFixed(2)} (already spent $${spend.dailyUsd.toFixed(2)} today)`,
  };
}

export function evaluateX402Limit(
  policy: TreasuryPolicy,
  estimatedUsd: number,
  toolName: string
): RuleResult | null {
  if (!toolName.startsWith("x402_")) return null;
  if (estimatedUsd <= policy.maxX402PaymentUsd) return null;

  return {
    action: "deny",
    reasonCode: "X402_LIMIT",
    message: `${toolName}: x402 payment of $${estimatedUsd.toFixed(2)} exceeds x402 limit of $${policy.maxX402PaymentUsd.toFixed(2)}`,
  };
}

export function evaluateRiskLevel(riskLevel: RiskLevel, toolName: string): RuleResult | null {
  if (riskLevel !== "financial") return null;
  return {
    action: "warn",
    reasonCode: "FINANCIAL_TOOL",
    message: `${toolName} is a financial operation — treasury policy checks applied`,
  };
}
