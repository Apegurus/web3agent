import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atomicWriteJson } from "../../src/utils/atomic-write.js";

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
});
