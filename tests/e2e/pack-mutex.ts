import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Cross-process mutex backed by an O_EXCL lock file in tmpdir().
 *
 * The `prepack` hooks added in v0.5.0 cause every `pnpm pack` invocation to
 * run a fresh `tsup` build with `clean: true`. When two e2e tests run in
 * parallel and both call `pnpm pack`, one tsup's `rm -rf dist/` step can
 * race the other's compile and produce ENOENT. Wrapping every pack call in
 * this lock serializes only the pack invocations themselves, leaving the
 * rest of each test free to run in parallel.
 *
 * Synchronous on purpose — the test code that calls `pnpm pack` uses
 * `execSync`, so the surrounding `beforeAll` is already synchronous.
 */
const TIMEOUT_MS = 15 * 60 * 1000;
const POLL_MS = 100;
const STALE_MS = 30 * 60 * 1000;

export function getPackWorkDir(): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : "user";
  const lockDir = join(tmpdir(), `web3agent-pack-${uid}`);
  mkdirSync(lockDir, { recursive: true, mode: 0o700 });
  chmodSync(lockDir, 0o700);
  return lockDir;
}

function getPackLockPath(): string {
  return join(getPackWorkDir(), "pack.lock");
}

const LOCK_PATH = getPackLockPath();

interface FileLockOptions {
  readonly label: string;
  readonly timeoutMs: number;
  readonly pollMs: number;
  readonly staleMs: number;
  readonly now?: () => number;
}

interface LockMetadata {
  readonly pid: number;
  readonly createdAt: number;
  readonly ownerId: string;
}

function sleepSync(ms: number): void {
  // Atomics.wait on a fresh SharedArrayBuffer is the cleanest synchronous
  // sleep in pure Node — no CPU spin, no shell-out.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function isLockMetadata(value: unknown): value is LockMetadata {
  return (
    typeof value === "object" &&
    value !== null &&
    "pid" in value &&
    "createdAt" in value &&
    "ownerId" in value &&
    typeof value.pid === "number" &&
    typeof value.createdAt === "number" &&
    typeof value.ownerId === "string"
  );
}

function readLockMetadata(lockPath: string): LockMetadata | undefined {
  try {
    const stats = lstatSync(lockPath);
    if (!stats.isFile()) return undefined;
    const parsed: unknown = JSON.parse(readFileSync(lockPath, "utf-8"));
    return isLockMetadata(parsed) ? parsed : undefined;
  } catch (error: unknown) {
    if (getErrorCode(error) === "ENOENT") return undefined;
    return undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return getErrorCode(error) !== "ESRCH";
  }
}

function staleLockReason(lockPath: string, options: Required<FileLockOptions>): string | undefined {
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(lockPath);
  } catch (error: unknown) {
    if (getErrorCode(error) === "ENOENT") return undefined;
    throw error;
  }

  if (!stats.isFile()) return "lock path is not a regular file";

  const metadata = readLockMetadata(lockPath);
  if (metadata !== undefined && !isProcessAlive(metadata.pid)) {
    return `owner pid ${metadata.pid} is not running`;
  }

  const ageMs = options.now() - stats.mtimeMs;
  if (ageMs > options.staleMs) return `mtime is ${Math.floor(ageMs)}ms old`;

  return undefined;
}

function removeStaleLock(lockPath: string, reason: string, label: string): void {
  try {
    const stats = lstatSync(lockPath);
    if (!stats.isFile()) {
      unlinkSync(lockPath);
      process.stderr.write(`[${label}] Removed non-file lock ${lockPath}: ${reason}\n`);
      return;
    }
    unlinkSync(lockPath);
    process.stderr.write(`[${label}] Removed stale lock ${lockPath}: ${reason}\n`);
  } catch (error: unknown) {
    if (getErrorCode(error) !== "ENOENT") throw error;
  }
}

function describeLock(lockPath: string): string {
  const metadata = readLockMetadata(lockPath);
  if (metadata === undefined) return "owner unknown";
  return `owner pid ${metadata.pid}, owner ${metadata.ownerId}, createdAt ${new Date(metadata.createdAt).toISOString()}`;
}

function writeLockMetadata(fd: number, ownerId: string, now: number): void {
  writeFileSync(fd, `${JSON.stringify({ pid: process.pid, createdAt: now, ownerId })}\n`, "utf-8");
}

function closeLockFd(fd: number | undefined, label: string): void {
  if (fd === undefined) return;
  try {
    closeSync(fd);
  } catch (e: unknown) {
    process.stderr.write(`[${label}] Failed to close lock fd: ${e}\n`);
  }
}

function removeOwnedLock(lockPath: string, ownerId: string, label: string): void {
  const metadata = readLockMetadata(lockPath);
  if (metadata?.ownerId !== ownerId) return;
  try {
    unlinkSync(lockPath);
  } catch (e: unknown) {
    if (getErrorCode(e) !== "ENOENT") {
      process.stderr.write(`[${label}] Failed to remove lock: ${e}\n`);
    }
  }
}

function withCleanupLock(lockPath: string, options: Required<FileLockOptions>): void {
  const cleanupPath = `${lockPath}.cleanup`;
  const cleanupOwnerId = randomUUID();
  const start = options.now();
  let fd: number | undefined;

  while (fd === undefined) {
    try {
      fd = openSync(cleanupPath, "wx");
      writeLockMetadata(fd, cleanupOwnerId, options.now());
    } catch (error: unknown) {
      if (getErrorCode(error) !== "EEXIST") throw error;
      const reason = staleLockReason(cleanupPath, options);
      if (reason !== undefined) {
        removeStaleLock(cleanupPath, reason, options.label);
        continue;
      }
      if (options.now() - start > options.timeoutMs) return;
      sleepSync(options.pollMs);
    }
  }

  try {
    const reason = staleLockReason(lockPath, options);
    if (reason !== undefined) removeStaleLock(lockPath, reason, options.label);
  } finally {
    closeLockFd(fd, options.label);
    removeOwnedLock(cleanupPath, cleanupOwnerId, options.label);
  }
}

export function withFileLock<T>(lockPath: string, fn: () => T, options: FileLockOptions): T {
  const resolvedOptions: Required<FileLockOptions> = {
    ...options,
    now: options.now ?? Date.now,
  };
  const ownerId = randomUUID();
  const start = resolvedOptions.now();
  let fd: number | undefined;

  while (true) {
    try {
      fd = openSync(lockPath, "wx");
      try {
        writeLockMetadata(fd, ownerId, resolvedOptions.now());
      } catch (error: unknown) {
        closeLockFd(fd, resolvedOptions.label);
        fd = undefined;
        removeOwnedLock(lockPath, ownerId, resolvedOptions.label);
        throw error;
      }
      break;
    } catch (e: unknown) {
      if (getErrorCode(e) !== "EEXIST") throw e;

      const reason = staleLockReason(lockPath, resolvedOptions);
      if (reason !== undefined) {
        withCleanupLock(lockPath, resolvedOptions);
        continue;
      }

      if (resolvedOptions.now() - start > resolvedOptions.timeoutMs) {
        throw new Error(
          `[${resolvedOptions.label}] Timed out after ${resolvedOptions.timeoutMs}ms waiting for ${lockPath} (${describeLock(lockPath)}).`
        );
      }
      sleepSync(resolvedOptions.pollMs);
    }
  }

  try {
    return fn();
  } finally {
    closeLockFd(fd, resolvedOptions.label);
    removeOwnedLock(lockPath, ownerId, resolvedOptions.label);
  }
}

export function withPackLock<T>(fn: () => T): T {
  return withFileLock(LOCK_PATH, fn, {
    label: "pack-mutex",
    timeoutMs: TIMEOUT_MS,
    pollMs: POLL_MS,
    staleMs: STALE_MS,
  });
}
