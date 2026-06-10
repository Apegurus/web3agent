import { existsSync, statSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  atomicWriteJson,
  writeBytesSecure,
} from "../../src/utils/atomic-write.js";

const TEST_DIR = join(tmpdir(), `web3agent-atomic-write-test-${process.pid}`);

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("atomicWriteJson", () => {
  it("writes JSON to a new file", async () => {
    const filePath = join(TEST_DIR, "data.json");
    await atomicWriteJson(filePath, { hello: "world", count: 42 });
    const contents = await readFile(filePath, "utf-8");
    expect(JSON.parse(contents)).toEqual({ hello: "world", count: 42 });
  });

  it("creates parent directories if missing", async () => {
    const filePath = join(TEST_DIR, "nested", "deep", "data.json");
    await atomicWriteJson(filePath, { nested: true });
    expect(existsSync(filePath)).toBe(true);
    const contents = await readFile(filePath, "utf-8");
    expect(JSON.parse(contents)).toEqual({ nested: true });
  });

  it("overwrites existing file atomically", async () => {
    const filePath = join(TEST_DIR, "overwrite.json");
    await atomicWriteJson(filePath, { version: 1 });
    await atomicWriteJson(filePath, { version: 2 });
    const contents = await readFile(filePath, "utf-8");
    expect(JSON.parse(contents)).toEqual({ version: 2 });
  });

  it("does not leave tmp file on success", async () => {
    const filePath = join(TEST_DIR, "clean.json");
    await atomicWriteJson(filePath, { ok: true });
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
    expect(existsSync(filePath)).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "creates parent directories with restrictive mode 0o700",
    async () => {
      const nestedPath = join(TEST_DIR, "nested", "subdir", "file.json");
      await atomicWriteJson(nestedPath, { ok: true });

      const parentMode = statSync(join(TEST_DIR, "nested")).mode & 0o777;
      expect(parentMode).toBe(0o700);
    },
  );

  it.skipIf(process.platform === "win32")(
    "tightens permissions on a pre-existing 0o755 parent directory (upgrade path)",
    async () => {
      // Simulate a pre-0.5.0 install: dir already exists with the umask default 0o755.
      const preExistingDir = join(TEST_DIR, "legacy");
      await mkdir(preExistingDir, { recursive: true });
      await chmod(preExistingDir, 0o755);
      expect(statSync(preExistingDir).mode & 0o777).toBe(0o755);

      // Next atomic write must repair the mode to 0o700.
      await atomicWriteJson(join(preExistingDir, "data.json"), { ok: true });
      expect(statSync(preExistingDir).mode & 0o777).toBe(0o700);
    },
  );
});

describe("writeBytesSecure", () => {
  it.skipIf(process.platform === "win32")(
    "creates the file with mode 0o600 even if source bytes came from a 0o644 file",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "wbs-"));
      const dst = join(dir, "out.json");
      await writeBytesSecure(dst, Buffer.from("hello"), {
        excl: true,
        mode: 0o600,
      });
      expect(statSync(dst).mode & 0o777).toBe(0o600);
    },
  );

  it("throws EEXIST when excl=true and destination exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wbs-"));
    const dst = join(dir, "out.json");
    await writeFile(dst, "existing");
    await expect(
      writeBytesSecure(dst, Buffer.from("new"), { excl: true, mode: 0o600 }),
    ).rejects.toThrow(/EEXIST/);
  });
});
