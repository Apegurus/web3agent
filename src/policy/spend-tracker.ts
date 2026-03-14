import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SpendRecord, SpendWindow } from "./types.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function getSpendLogPath(): string {
  return join(homedir(), ".web3agent", "spend-log.json");
}

let records: SpendRecord[] = [];

export function recordSpend(toolName: string, estimatedUsd: number, walletAddress?: string): void {
  records.push({
    timestamp: new Date().toISOString(),
    toolName,
    estimatedUsd,
    walletAddress,
  });
  pruneOldRecords();
  persistSpendLog().catch((e: unknown) => {
    process.stderr.write(`[policy] Failed to persist spend log: ${e}\n`);
  });
}

export function getSpendWindow(): SpendWindow {
  pruneOldRecords();
  const now = Date.now();
  let hourlyUsd = 0;
  let dailyUsd = 0;
  let hourlyCount = 0;
  let dailyCount = 0;

  for (const record of records) {
    const age = now - new Date(record.timestamp).getTime();
    if (age <= DAY_MS) {
      dailyUsd += record.estimatedUsd;
      dailyCount++;
    }
    if (age <= HOUR_MS) {
      hourlyUsd += record.estimatedUsd;
      hourlyCount++;
    }
  }

  return { hourlyUsd, dailyUsd, hourlyCount, dailyCount };
}

export function getRecentRecords(limit = 20): SpendRecord[] {
  pruneOldRecords();
  return records.slice(-limit).reverse();
}

function pruneOldRecords(): void {
  const cutoff = Date.now() - DAY_MS;
  records = records.filter((r) => new Date(r.timestamp).getTime() > cutoff);
}

async function persistSpendLog(): Promise<void> {
  const filePath = getSpendLogPath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const tmpPath = `${filePath}.tmp`;
  const fd = await open(tmpPath, "w", 0o600);
  try {
    await fd.writeFile(JSON.stringify(records, null, 2));
    await fd.sync();
  } finally {
    await fd.close();
  }
  await rename(tmpPath, filePath);
}

export async function loadSpendLog(): Promise<number> {
  const filePath = getSpendLogPath();
  if (!existsSync(filePath)) return 0;

  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as SpendRecord[];
    records = parsed;
    pruneOldRecords();
    return records.length;
  } catch (e: unknown) {
    process.stderr.write(`[policy] Failed to load spend log (starting fresh): ${e}\n`);
    records = [];
    return 0;
  }
}

export function resetSpendRecords(): void {
  records = [];
}
