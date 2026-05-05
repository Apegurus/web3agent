import type { PolicyAction, SpendWindow, TreasuryPolicy } from "./types.js";

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

export function evaluateMinReserve(
  policy: TreasuryPolicy,
  estimatedUsd: number,
  walletBalanceUsd: number | null,
  toolName: string
): RuleResult | null {
  if (walletBalanceUsd === null) {
    if (policy.minReserveUsd > 0) {
      return {
        action: "deny",
        reasonCode: "BALANCE_UNKNOWN",
        message: `${toolName}: wallet balance unknown — cannot verify minimum reserve of $${policy.minReserveUsd.toFixed(2)}`,
      };
    }
    return null;
  }
  const projectedBalance = walletBalanceUsd - estimatedUsd;
  if (projectedBalance >= policy.minReserveUsd) return null;

  return {
    action: "deny",
    reasonCode: "MIN_RESERVE",
    message: `${toolName}: projected balance $${projectedBalance.toFixed(2)} would drop below minimum reserve of $${policy.minReserveUsd.toFixed(2)} (current balance $${walletBalanceUsd.toFixed(2)})`,
  };
}
