import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomicWriteJson } from "../utils/atomic-write.js";
import type { SpendRecord, SpendWindow } from "./types.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function getSpendLogPath(): string {
  return join(homedir(), ".web3agent", "spend-log.json");
}

let records: SpendRecord[] = [];
let persistChain: Promise<void> = Promise.resolve();
let persistDirty = false;

function schedulePersist(): void {
  if (persistDirty) return;
  persistDirty = true;
  persistChain = persistChain
    .then(() => persistSpendLog())
    .then(() => {
      persistDirty = false;
    })
    .catch((e: unknown) => {
      persistDirty = false;
      process.stderr.write(`[policy] Failed to persist spend log: ${e}\n`);
    });
}

// recordSpend is synchronous for fast dispatch; persistence is async fire-and-forget.
// If the process crashes between push() and persist completing, recent spend is lost.
// Accepted tradeoff: policy may under-enforce briefly after a crash, but won't over-enforce.
export function recordSpend(toolName: string, estimatedUsd: number, walletAddress?: string): void {
  records.push({
    timestamp: new Date().toISOString(),
    toolName,
    estimatedUsd,
    walletAddress,
  });
  pruneOldRecords();
  schedulePersist();
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
  await atomicWriteJson(getSpendLogPath(), records);
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
