import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withFileLock } from "./pack-mutex.js";

const roots: string[] = [];

function createLockPath(): string {
  const root = mkdtempSync(join(tmpdir(), "web3agent-pack-mutex-test-"));
  roots.push(root);
  return join(root, "pack.lock");
}

describe("pack mutex", () => {
  afterEach(() => {
    while (roots.length > 0) {
      const root = roots.pop();
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it("removes the lock after the protected function completes", () => {
    const lockPath = createLockPath();

    const result = withFileLock(lockPath, () => "packed", {
      label: "pack-mutex-test",
      timeoutMs: 50,
      pollMs: 1,
      staleMs: 60_000,
    });

    expect(result).toBe("packed");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("recovers a stale lock left by a dead owner", () => {
    const lockPath = createLockPath();
    writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: -1, createdAt: 0, ownerId: "dead-owner" })}\n`,
      "utf-8"
    );

    const result = withFileLock(lockPath, () => "recovered", {
      label: "pack-mutex-test",
      timeoutMs: 50,
      pollMs: 1,
      staleMs: 60_000,
    });

    expect(result).toBe("recovered");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("keeps waiting for a lock owned by a live process", () => {
    const lockPath = createLockPath();
    writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: process.pid, createdAt: Date.now(), ownerId: "live-owner" })}\n`,
      "utf-8"
    );

    expect(() =>
      withFileLock(lockPath, () => "blocked", {
        label: "pack-mutex-test",
        timeoutMs: 10,
        pollMs: 1,
        staleMs: 60_000,
      })
    ).toThrow("Timed out");
  });

  it("does not remove a replacement lock when the original lock disappears during work", () => {
    const lockPath = createLockPath();
    const replacement = { pid: process.pid, createdAt: Date.now(), ownerId: "replacement" };

    withFileLock(
      lockPath,
      () => {
        unlinkSync(lockPath);
        writeFileSync(lockPath, `${JSON.stringify(replacement)}\n`, "utf-8");
      },
      {
        label: "pack-mutex-test",
        timeoutMs: 50,
        pollMs: 1,
        staleMs: 60_000,
      }
    );

    expect(JSON.parse(readFileSync(lockPath, "utf-8"))).toEqual(replacement);
  });

  it.skipIf(process.platform === "win32")(
    "removes non-file stale lock paths without reading through symlinks",
    () => {
      const lockPath = createLockPath();
      const targetPath = join(tmpdir(), "web3agent-pack-mutex-symlink-target");
      writeFileSync(targetPath, "target", "utf-8");
      roots.push(targetPath);
      symlinkSync(targetPath, lockPath);

      const result = withFileLock(lockPath, () => "recovered", {
        label: "pack-mutex-test",
        timeoutMs: 50,
        pollMs: 1,
        staleMs: 60_000,
      });

      expect(result).toBe("recovered");
      expect(readFileSync(targetPath, "utf-8")).toBe("target");
    }
  );
});
