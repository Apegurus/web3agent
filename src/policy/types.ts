/**
 * Treasury Policy Types
 *
 * Defines the policy configuration and decision types for the treasury
 * enforcement engine. The human sets limits via env vars or CLI.
 * The agent can read limits but never change them.
 */

/** Risk classification for tool calls. */
export type RiskLevel = "safe" | "financial" | "destructive";

/** Policy decision: allow, deny, or warn. */
export type PolicyAction = "allow" | "deny" | "warn";

/** A single spend record for tracking rolling windows. */
export interface SpendRecord {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Tool that triggered the spend */
  toolName: string;
  /** Estimated USD value of the operation */
  estimatedUsd: number;
  /** Wallet address that executed */
  walletAddress?: string;
}

/** Rolling spend totals for a given time window. */
export interface SpendWindow {
  /** Total USD spent in the current hour */
  hourlyUsd: number;
  /** Total USD spent in the current day (24h rolling) */
  dailyUsd: number;
  /** Number of transactions in the current hour */
  hourlyCount: number;
  /** Number of transactions in the current day */
  dailyCount: number;
}

/** Treasury policy configuration. Set by the user, read by the agent. */
export interface TreasuryPolicy {
  /** Whether policy enforcement is enabled */
  enabled: boolean;
  /** Maximum USD value for a single transaction */
  maxSingleTransactionUsd: number;
  /** Maximum cumulative USD spend per rolling hour */
  maxHourlyUsd: number;
  /** Maximum cumulative USD spend per rolling 24 hours */
  maxDailyUsd: number;
  /** Minimum USD reserve — block if wallet balance would drop below this */
  minReserveUsd: number;
  /** Maximum USD value for a single x402 HTTP payment */
  maxX402PaymentUsd: number;
}

/** Result of a policy evaluation. */
export interface PolicyDecision {
  /** Whether the tool call is allowed, denied, or warned */
  action: PolicyAction;
  /** Machine-readable reason code */
  reasonCode: string;
  /** Human-readable explanation */
  message: string;
  /** The risk level of the evaluated tool */
  riskLevel: RiskLevel;
  /** The tool name that was evaluated */
  toolName: string;
  /** Current spend window at time of evaluation */
  currentSpend: SpendWindow;
  /** The policy limits that were applied */
  appliedPolicy: TreasuryPolicy;
}

/** Default policy values — conservative but usable. */
export const DEFAULT_TREASURY_POLICY: TreasuryPolicy = {
  enabled: true,
  maxSingleTransactionUsd: 100,
  maxHourlyUsd: 500,
  maxDailyUsd: 2000,
  minReserveUsd: 10,
  maxX402PaymentUsd: 5,
};
