import { existsSync } from "node:fs";
import { appendFile, chmod, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const IS_POSIX = process.platform !== "win32";

export type AuditAction =
  | "CONFIRMED"
  | "DENIED"
  | "EXECUTION_FAILED"
  | "EXECUTION_UNCERTAIN"
  | "EXPIRED";

export interface AuditEntry {
  action: AuditAction;
  operationType: string;
  operationId: string;
  walletAddress?: string;
  description: string;
  metadata?: Readonly<Record<string, unknown>>;
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
  const payload = entry.metadata
    ? { description: entry.description, metadata: entry.metadata }
    : entry.description;
  return `${ts} | ${entry.action} | ${entry.operationType} | ${wallet} | ${JSON.stringify(payload)} | id=${entry.operationId}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseDescription(rawDescription: string): {
  readonly description: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
} {
  try {
    const parsed: unknown = JSON.parse(rawDescription);
    if (typeof parsed === "string") return { description: parsed };
    if (isRecord(parsed) && typeof parsed.description === "string" && isRecord(parsed.metadata)) {
      return { description: parsed.description, metadata: parsed.metadata };
    }
    return { description: rawDescription };
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return { description: rawDescription };
    throw error;
  }
}

let auditChain: Promise<void> = Promise.resolve();

export function appendAuditLog(entry: AuditEntry): Promise<void> {
  auditChain = auditChain
    .catch((e: unknown) => {
      process.stderr.write(`[audit] Prior write failed: ${e}\n`);
    })
    .then(async () => {
      const dir = getAuditDir();
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true, mode: 0o700 });
      } else if (IS_POSIX) {
        // Repair pre-existing dirs from < 0.5.0 installs created with the
        // process umask (typically 0o755). Best-effort.
        try {
          await chmod(dir, 0o700);
        } catch (e: unknown) {
          process.stderr.write(
            `[audit] Could not tighten permissions on ${dir}: ${e instanceof Error ? e.message : String(e)}\n`
          );
        }
      }
      await appendFile(getAuditPath(), formatEntry(entry), { mode: 0o600 });
    });
  return auditChain;
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

      const parsedDescription = parseDescription(descriptionRaw);
      return {
        timestamp: timestamp.trim(),
        action: action.trim() as AuditAction,
        operationType: operationType.trim(),
        walletAddress: walletAddress.trim() === "unknown" ? undefined : walletAddress.trim(),
        description: parsedDescription.description,
        ...(parsedDescription.metadata ? { metadata: parsedDescription.metadata } : {}),
        operationId: operationId.trim(),
      } satisfies AuditLogEntry;
    })
    .filter((entry) => entry !== null);

  if (typeof limit === "number" && limit >= 0) {
    return entries.slice(-limit).reverse();
  }

  return entries.reverse();
}
