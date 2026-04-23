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
let persistScheduled = false;
let persistNeeded = false;

let nextReservationId = 0;
const pendingReservations = new Map<number, SpendRecord>();

export function reserveSpend(
  toolName: string,
  estimatedUsd: number,
  walletAddress?: string
): number {
  if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) {
    process.stderr.write(
      `[policy] Refusing reservation for non-finite spend (${estimatedUsd}) on ${toolName}.\n`
    );
    return nextReservationId++;
  }
  const id = nextReservationId++;
  pendingReservations.set(id, {
    timestamp: new Date().toISOString(),
    toolName,
    estimatedUsd,
    walletAddress,
  });
  return id;
}

export function commitReservation(id: number): void {
  const record = pendingReservations.get(id);
  if (!record) return;
  pendingReservations.delete(id);
  records.push(record);
  pruneOldRecords();
  schedulePersist();
}

export function releaseReservation(id: number): void {
  pendingReservations.delete(id);
}

function schedulePersist(): void {
  persistNeeded = true;
  if (persistScheduled) return;
  persistScheduled = true;
  persistChain = persistChain
    .then(() => {
      persistNeeded = false;
      return persistSpendLog();
    })
    .then(() => {
      persistScheduled = false;
      if (persistNeeded) schedulePersist();
    })
    .catch((e: unknown) => {
      persistScheduled = false;
      process.stderr.write(`[policy] Failed to persist spend log: ${e}\n`);
    });
}

// recordSpend is synchronous for fast dispatch; persistence is async fire-and-forget.
// If the process crashes between push() and persist completing, recent spend is lost.
// Accepted tradeoff: policy may under-enforce briefly after a crash, but won't over-enforce.
export function recordSpend(toolName: string, estimatedUsd: number, walletAddress?: string): void {
  if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) {
    process.stderr.write(
      `[policy] Refusing to record non-finite spend (${estimatedUsd}) for ${toolName}. This indicates a caller bug — spend limits depend on finite values.\n`
    );
    return;
  }
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
    if (!Number.isFinite(record.estimatedUsd)) continue;
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

  for (const record of pendingReservations.values()) {
    if (!Number.isFinite(record.estimatedUsd)) continue;
    hourlyUsd += record.estimatedUsd;
    dailyUsd += record.estimatedUsd;
    hourlyCount++;
    dailyCount++;
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
