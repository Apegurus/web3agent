import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { RuntimeConfig } from "../types/config.js";
import { DEFAULT_TREASURY_POLICY, type TreasuryPolicy } from "./types.js";

function getPolicyFilePath(): string {
  return join(homedir(), ".web3agent", "policy.json");
}

function loadPolicyFile(): Partial<TreasuryPolicy> {
  const filePath = getPolicyFilePath();
  if (!existsSync(filePath)) return {};

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Partial<TreasuryPolicy> = {};

    if (typeof parsed.enabled === "boolean") result.enabled = parsed.enabled;

    const numericFields: Array<keyof Omit<TreasuryPolicy, "enabled">> = [
      "maxSingleTransactionUsd",
      "maxHourlyUsd",
      "maxDailyUsd",
      "minReserveUsd",
      "maxX402PaymentUsd",
    ];
    for (const field of numericFields) {
      if (typeof parsed[field] === "number" && (parsed[field] as number) >= 0) {
        result[field] = parsed[field] as number;
      }
    }

    return result;
  } catch (e: unknown) {
    process.stderr.write(`[policy] Failed to load policy.json: ${e}\n`);
    return {};
  }
}

/**
 * Resolve the effective treasury policy.
 * Precedence: env vars (RuntimeConfig) > policy.json > built-in defaults.
 */
export function resolvePolicy(config: RuntimeConfig): TreasuryPolicy {
  const filePolicy = loadPolicyFile();

  return {
    enabled: config.policyEnabled ?? filePolicy.enabled ?? DEFAULT_TREASURY_POLICY.enabled,
    maxSingleTransactionUsd:
      config.policyMaxSingleTransactionUsd ??
      filePolicy.maxSingleTransactionUsd ??
      DEFAULT_TREASURY_POLICY.maxSingleTransactionUsd,
    maxHourlyUsd:
      config.policyMaxHourlyUsd ?? filePolicy.maxHourlyUsd ?? DEFAULT_TREASURY_POLICY.maxHourlyUsd,
    maxDailyUsd:
      config.policyMaxDailyUsd ?? filePolicy.maxDailyUsd ?? DEFAULT_TREASURY_POLICY.maxDailyUsd,
    minReserveUsd:
      config.policyMinReserveUsd ??
      filePolicy.minReserveUsd ??
      DEFAULT_TREASURY_POLICY.minReserveUsd,
    maxX402PaymentUsd:
      config.policyMaxX402PaymentUsd ??
      filePolicy.maxX402PaymentUsd ??
      DEFAULT_TREASURY_POLICY.maxX402PaymentUsd,
  };
}

export async function savePolicyFile(policy: Partial<TreasuryPolicy>): Promise<string> {
  const filePath = getPolicyFilePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const existing = loadPolicyFile();
  const merged = { ...existing, ...policy };
  await writeFile(filePath, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
  return filePath;
}
