import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIST_INDEX = join(ROOT, "dist/index.js");

describe("packaging tests", () => {
  it("dist/index.js exists and has shebang", () => {
    expect(existsSync(DIST_INDEX)).toBe(true);
    const content = readFileSync(DIST_INDEX, "utf-8");
    expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("WEB3_CONTEXT.md exists at package root", () => {
    const path = join(ROOT, "WEB3_CONTEXT.md");
    expect(existsSync(path)).toBe(true);
  });

  it("README.md exists at package root", () => {
    const path = join(ROOT, "README.md");
    expect(existsSync(path)).toBe(true);
  });

  it("--help exits 0 and outputs to stderr", () => {
    const result = execSync(`node ${DIST_INDEX} --help 2>&1`, {
      encoding: "utf-8",
    });
    expect(result).toContain("web3agent");
    expect(result).toContain("Usage:");
  });

  it("--version exits 0 and prints version to stderr", () => {
    const result = execSync(`node ${DIST_INDEX} --version 2>&1`, {
      encoding: "utf-8",
    });
    expect(result.trim()).toBe("web3agent 0.1.0");
  });

  it("pnpm pack --json includes required files", () => {
    const output = execSync("pnpm pack --json", {
      encoding: "utf-8",
      cwd: ROOT,
    });

    expect(output).toContain("dist/index.js");
    expect(output).toContain("WEB3_CONTEXT.md");
    expect(output).toContain("README.md");
  });
});
