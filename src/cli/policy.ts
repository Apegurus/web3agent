import { parseEnv } from "../config/env.js";
import { getRemainingBudget } from "../policy/budget.js";
import { resolvePolicy, savePolicyFile } from "../policy/config.js";
import { getRecentRecords, getSpendWindow, loadSpendLog } from "../policy/spend-tracker.js";

function printPolicy(label: string, value: number): void {
  process.stderr.write(`  ${label.padEnd(30)} $${value.toFixed(2)}\n`);
}

async function showPolicy(): Promise<void> {
  const config = parseEnv(process.env as Partial<Record<string, string>>);
  const policy = resolvePolicy(config);
  await loadSpendLog();
  const spend = getSpendWindow();
  const recent = getRecentRecords(5);

  process.stderr.write("\nTreasury Policy\n");
  process.stderr.write(`  Enabled:${" ".repeat(22)}${policy.enabled ? "yes" : "no"}\n`);
  printPolicy("Max single transaction:", policy.maxSingleTransactionUsd);
  printPolicy("Max hourly spend:", policy.maxHourlyUsd);
  printPolicy("Max daily spend:", policy.maxDailyUsd);
  printPolicy("Min reserve:", policy.minReserveUsd);
  printPolicy("Max x402 payment:", policy.maxX402PaymentUsd);

  process.stderr.write("\nCurrent Spend\n");
  printPolicy("Hourly:", spend.hourlyUsd);
  printPolicy("Daily:", spend.dailyUsd);
  process.stderr.write(`  Hourly transactions:${" ".repeat(10)}${spend.hourlyCount}\n`);
  process.stderr.write(`  Daily transactions:${" ".repeat(11)}${spend.dailyCount}\n`);

  const remaining = getRemainingBudget(policy, spend);
  process.stderr.write("\nRemaining Budget\n");
  printPolicy("Hourly:", remaining.hourlyUsd);
  printPolicy("Daily:", remaining.dailyUsd);

  if (recent.length > 0) {
    process.stderr.write("\nRecent Transactions\n");
    for (const r of recent) {
      process.stderr.write(`  ${r.timestamp} | ${r.toolName} | $${r.estimatedUsd.toFixed(2)}\n`);
    }
  }

  process.stderr.write("\n");
}

const NUMERIC_FLAGS: Record<string, string> = {
  "--max-single-tx": "maxSingleTransactionUsd",
  "--max-hourly": "maxHourlyUsd",
  "--max-daily": "maxDailyUsd",
  "--min-reserve": "minReserveUsd",
  "--max-x402": "maxX402PaymentUsd",
};

async function setPolicy(args: string[]): Promise<void> {
  const updates: Record<string, number | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const policyField = NUMERIC_FLAGS[arg];

    if (policyField) {
      const nextVal = args[++i];
      if (!nextVal) throw new Error(`${arg} requires a value`);
      updates[policyField] = Number.parseFloat(nextVal);
    } else if (arg === "--enable") {
      updates.enabled = true;
    } else if (arg === "--disable") {
      updates.enabled = false;
    } else {
      throw new Error(`Unknown policy option: ${arg}`);
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error(
      "No policy values specified. Use --max-daily, --max-hourly, --max-single-tx, --min-reserve, --max-x402, --enable, or --disable"
    );
  }

  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`Invalid value for ${key}: must be a finite non-negative number`);
    }
  }

  const filePath = await savePolicyFile(updates);
  process.stderr.write(`Policy updated: ${filePath}\n`);

  for (const [key, value] of Object.entries(updates)) {
    process.stderr.write(
      `  ${key}: ${typeof value === "number" ? `$${value.toFixed(2)}` : value}\n`
    );
  }

  process.stderr.write("\nNote: env vars (POLICY_*) override policy.json values.\n");
}

export async function runPolicy(args: string[]): Promise<void> {
  if (args[0] === "set") {
    await setPolicy(args.slice(1));
  } else if (args.length === 0 || args[0] === "show") {
    await showPolicy();
  } else {
    process.stderr.write(
      `${[
        "web3agent policy — Treasury policy management",
        "",
        "Usage:",
        "  web3agent policy              Show current policy and spend totals",
        "  web3agent policy set [opts]   Update policy limits",
        "",
        "Set options:",
        "  --max-single-tx <usd>    Max USD per transaction",
        "  --max-hourly <usd>       Max USD per hour",
        "  --max-daily <usd>        Max USD per day",
        "  --min-reserve <usd>      Min USD reserve in wallet",
        "  --max-x402 <usd>         Max USD per x402 payment",
        "  --enable                 Enable policy enforcement",
        "  --disable                Disable policy enforcement",
      ].join("\n")}\n`
    );
  }
}
