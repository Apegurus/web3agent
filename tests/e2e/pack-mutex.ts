import { closeSync, openSync, unlinkSync } from "node:fs";
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
const LOCK_PATH = join(tmpdir(), "web3agent-pack.lock");
const TIMEOUT_MS = 5 * 60 * 1000;
const POLL_MS = 100;

function sleepSync(ms: number): void {
  // Atomics.wait on a fresh SharedArrayBuffer is the cleanest synchronous
  // sleep in pure Node — no CPU spin, no shell-out.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function withPackLock<T>(fn: () => T): T {
  const start = Date.now();
  let fd: number | undefined;

  while (true) {
    try {
      fd = openSync(LOCK_PATH, "wx");
      break;
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException)?.code !== "EEXIST") throw e;
      if (Date.now() - start > TIMEOUT_MS) {
        throw new Error(
          `[pack-mutex] Timed out after ${TIMEOUT_MS}ms waiting for ${LOCK_PATH}. If a previous test crashed, delete the lock file manually.`
        );
      }
      sleepSync(POLL_MS);
    }
  }

  try {
    return fn();
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch (e: unknown) {
        process.stderr.write(`[pack-mutex] Failed to close lock fd: ${e}\n`);
      }
    }
    try {
      unlinkSync(LOCK_PATH);
    } catch (e: unknown) {
      // Lock may already be gone if a sibling cleaned up; not fatal.
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        process.stderr.write(`[pack-mutex] Failed to remove lock: ${e}\n`);
      }
    }
  }
}
