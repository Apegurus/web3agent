import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
    if (typeof parsed.maxSingleTransactionUsd === "number" && parsed.maxSingleTransactionUsd >= 0)
      result.maxSingleTransactionUsd = parsed.maxSingleTransactionUsd;
    if (typeof parsed.maxHourlyUsd === "number" && parsed.maxHourlyUsd >= 0)
      result.maxHourlyUsd = parsed.maxHourlyUsd;
    if (typeof parsed.maxDailyUsd === "number" && parsed.maxDailyUsd >= 0)
      result.maxDailyUsd = parsed.maxDailyUsd;
    if (typeof parsed.minReserveUsd === "number" && parsed.minReserveUsd >= 0)
      result.minReserveUsd = parsed.minReserveUsd;
    if (typeof parsed.maxX402PaymentUsd === "number" && parsed.maxX402PaymentUsd >= 0)
      result.maxX402PaymentUsd = parsed.maxX402PaymentUsd;

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

export async function readPolicyFile(): Promise<Partial<TreasuryPolicy>> {
  const filePath = getPolicyFilePath();
  if (!existsSync(filePath)) return {};
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as Partial<TreasuryPolicy>;
}
