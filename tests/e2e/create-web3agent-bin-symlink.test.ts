import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ensureBuild } from "../global-setup.js";

describe("create-web3agent bin symlink invocation", () => {
  const roots: string[] = [];
  let binPath = "";

  beforeAll(() => {
    ensureBuild();
    const testDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = join(testDir, "..", "..");
    binPath = join(repoRoot, "packages", "create-web3agent", "dist", "index.js");
    if (!existsSync(binPath)) {
      throw new Error(`Expected dist/index.js at ${binPath} after ensureBuild().`);
    }
  }, 180000);

  afterEach(() => {
    while (roots.length > 0) {
      const root = roots.pop();
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "executes main logic when invoked via a symlink (not just the real file path)",
    () => {
      const root = mkdtempSync(join(tmpdir(), "cw3a-symlink-"));
      roots.push(root);
      const binDir = join(root, ".bin");
      mkdirSync(binDir, { recursive: true });
      const symlinkPath = join(binDir, "create-web3agent");
      symlinkSync(binPath, symlinkPath);
      chmodSync(binPath, 0o755);

      const result = spawnSync(process.execPath, [symlinkPath, "--help"], {
        encoding: "utf-8",
        timeout: 15000,
      });

      const stdout = result.stdout ?? "";
      const stderr = result.stderr ?? "";
      const combined = `${stdout}${stderr}`;
      expect(combined.length).toBeGreaterThan(10);
      expect(combined.toLowerCase()).toMatch(/create|template|usage|web3agent|help/);
    }
  );
});
