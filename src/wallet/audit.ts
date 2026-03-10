import { existsSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type AuditAction = "CONFIRMED" | "DENIED" | "EXPIRED";

interface AuditEntry {
  action: AuditAction;
  operationType: string;
  operationId: string;
  walletAddress?: string;
  description: string;
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

export async function appendAuditLog(entry: AuditEntry): Promise<void> {
  const dir = getAuditDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await appendFile(getAuditPath(), formatEntry(entry), { mode: 0o600 });
}
