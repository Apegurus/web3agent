import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePackedTarballs } from "./pack-fixture.js";

const TEMP_ROOT = mkdtempSync(join(tmpdir(), "web3agent-consumer-install-"));
let rootTarball = "";

describe("clean npm consumer", () => {
  beforeAll(() => {
    ({ rootTarball } = ensurePackedTarballs());
  });

  afterAll(() => {
    rmSync(TEMP_ROOT, { recursive: true, force: true });
  });

  it("uses the bundled Uniswap closure without installing build-time SDK dependencies", () => {
    writeFileSync(
      join(TEMP_ROOT, "package.json"),
      `${JSON.stringify({ name: "web3agent-consumer", private: true, type: "module" }, null, 2)}\n`,
      "utf-8"
    );

    execFileSync(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", `file:${rootTarball}`],
      { cwd: TEMP_ROOT, stdio: "pipe" }
    );

    expect(existsSync(join(TEMP_ROOT, "node_modules", "@uniswap", "v4-sdk"))).toBe(false);
    expect(existsSync(join(TEMP_ROOT, "node_modules", "hardhat"))).toBe(false);

    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import { calculateUniswapV4 } from 'web3agent'; process.stdout.write(typeof calculateUniswapV4)",
      ],
      { cwd: TEMP_ROOT, encoding: "utf-8" }
    );
    expect(output).toBe("function");
  }, 180_000);
});
