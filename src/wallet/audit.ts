import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type AuditAction = "CONFIRMED" | "DENIED" | "EXPIRED";

export interface AuditEntry {
  action: AuditAction;
  operationType: string;
  operationId: string;
  walletAddress?: string;
  description: string;
}

export interface AuditLogEntry extends AuditEntry {
  timestamp: string;
}

function getAuditDir(): string {
  return join(homedir(), ".web3agent");
}

function getAuditPath(): string {
  return join(getAuditDir(), "audit.log");
}

function formatEntry(entry: AuditEntry): string {
  const ts = new Date().toISOString();
  const wallet = entry.walletAddress ?? "unknown";
  return `${ts} | ${entry.action} | ${entry.operationType} | ${wallet} | ${JSON.stringify(entry.description)} | id=${entry.operationId}\n`;
}

function parseDescription(rawDescription: string): string {
  try {
    const parsed = JSON.parse(rawDescription) as unknown;
    return typeof parsed === "string" ? parsed : rawDescription;
  } catch (_error: unknown) {
    return rawDescription;
  }
}

export async function appendAuditLog(entry: AuditEntry): Promise<void> {
  const dir = getAuditDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await appendFile(getAuditPath(), formatEntry(entry), { mode: 0o600 });
}

export async function readAuditLog(limit?: number): Promise<AuditLogEntry[]> {
  const path = getAuditPath();
  if (!existsSync(path)) return [];

  const content = await readFile(path, "utf-8");
  // Keep this regex in lockstep with formatEntry(); the audit log is an append-only line format.
  const entries = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match =
        /^([^|]+)\s+\|\s+([^|]+)\s+\|\s+([^|]+)\s+\|\s+([^|]+)\s+\|\s+(.+)\s+\|\s+id=(.+)$/.exec(
          line
        );
      if (!match) return null;

      const [, timestamp, action, operationType, walletAddress, descriptionRaw, operationId] =
        match;

      return {
        timestamp: timestamp.trim(),
        action: action.trim() as AuditAction,
        operationType: operationType.trim(),
        walletAddress: walletAddress.trim() === "unknown" ? undefined : walletAddress.trim(),
        description: parseDescription(descriptionRaw),
        operationId: operationId.trim(),
      } satisfies AuditLogEntry;
    })
    .filter((entry) => entry !== null);

  if (typeof limit === "number" && limit >= 0) {
    return entries.slice(-limit).reverse();
  }

  return entries.reverse();
}
