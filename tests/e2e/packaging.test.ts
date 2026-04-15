import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureBuild } from "../global-setup.js";

const ROOT = process.cwd();
const DIST_CLI = join(ROOT, "dist/cli.js");
const DIST_INDEX = join(ROOT, "dist/index.js");
const DIST_RUNTIME = join(ROOT, "dist/runtime/index.js");
const DIST_MCP = join(ROOT, "dist/mcp/index.js");
const EXAMPLE_ROOT_API = join(ROOT, "examples/root-api-smoke.mjs");
const EXAMPLE_RUNTIME = join(ROOT, "examples/runtime-smoke.mjs");

describe("packaging tests", () => {
  beforeAll(() => ensureBuild(), 120_000);

  it("dist/cli.js exists and has shebang", () => {
    expect(existsSync(DIST_CLI)).toBe(true);
    const content = readFileSync(DIST_CLI, "utf-8");
    expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("library and subpath builds exist", () => {
    expect(existsSync(DIST_INDEX)).toBe(true);
    expect(existsSync(DIST_RUNTIME)).toBe(true);
    expect(existsSync(DIST_MCP)).toBe(true);
  });

  it("WEB3_CONTEXT.md exists at package root", () => {
    const path = join(ROOT, "WEB3_CONTEXT.md");
    expect(existsSync(path)).toBe(true);
  });

  it("README.md exists at package root", () => {
    const path = join(ROOT, "README.md");
    expect(existsSync(path)).toBe(true);
  });

  it("example smoke scripts exist", () => {
    expect(existsSync(EXAMPLE_ROOT_API)).toBe(true);
    expect(existsSync(EXAMPLE_RUNTIME)).toBe(true);
  });

  it("--help exits 0 and outputs to stderr", () => {
    const result = execSync(`node ${DIST_CLI} --help 2>&1`, {
      encoding: "utf-8",
    });
    expect(result).toContain("web3agent");
    expect(result).toContain("Usage:");
  });

  it("--version exits 0 and prints version to stderr", () => {
    const result = execSync(`node ${DIST_CLI} --version 2>&1`, {
      encoding: "utf-8",
    });
    expect(result.trim()).toMatch(/^web3agent \d+\.\d+\.\d+/);
  });

  it("public package exports are importable", () => {
    const result = execSync(
      `node --input-type=module -e "import { getSwapQuote, parseEnv, setConfig, pollSwapStatus } from './dist/index.js'; import { createRuntime, shutdownDefaultRuntime } from './dist/runtime/index.js'; import { startServer } from './dist/mcp/index.js'; console.log(typeof getSwapQuote, typeof parseEnv, typeof setConfig, typeof pollSwapStatus, typeof createRuntime, typeof shutdownDefaultRuntime, typeof startServer)"`,
      {
        encoding: "utf-8",
        cwd: ROOT,
      }
    );

    expect(result.trim()).toBe("function function function function function function function");
  });

  it("root API smoke example runs against the built package", () => {
    const result = execSync(`node ${EXAMPLE_ROOT_API}`, {
      encoding: "utf-8",
      cwd: ROOT,
    });

    const payload = JSON.parse(result) as {
      supported: boolean;
      tokenCount: number;
      sampleToken: { symbol: string } | null;
    };

    expect(payload.supported).toBe(true);
    expect(payload.tokenCount).toBeGreaterThan(0);
    expect(payload.sampleToken?.symbol).toBe("USDC");
  });

  it("runtime smoke example supports the safe imports-only mode", () => {
    const result = execSync(`node ${EXAMPLE_RUNTIME}`, {
      encoding: "utf-8",
      cwd: ROOT,
    });

    const payload = JSON.parse(result) as {
      createRuntime: string;
      mode: string;
      hint: string;
    };

    expect(payload.createRuntime).toBe("function");
    expect(payload.mode).toBe("imports-only");
    expect(payload.hint).toContain("--run");
  });

  it("pnpm pack --json includes required files", () => {
    const output = execSync("pnpm pack --json", {
      encoding: "utf-8",
      cwd: ROOT,
    });

    expect(output).toContain("dist/cli.js");
    expect(output).toContain("dist/index.js");
    expect(output).toContain("dist/runtime/index.js");
    expect(output).toContain("dist/mcp/index.js");
    expect(output).toContain("examples/root-api-smoke.mjs");
    expect(output).toContain("examples/runtime-smoke.mjs");
    expect(output).toContain("WEB3_CONTEXT.md");
    expect(output).toContain("README.md");
    expect(output).not.toContain("examples/agent-playground/package.json");
    expect(output).not.toContain("examples/agent-playground/node_modules/.bin/tsx");
  });
});
