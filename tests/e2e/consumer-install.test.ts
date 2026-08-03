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
      {
        cwd: TEMP_ROOT,
        env: { ...process.env, npm_config_cache: join(TEMP_ROOT, ".npm-cache") },
        stdio: "pipe",
      }
    );

    expect(existsSync(join(TEMP_ROOT, "node_modules", "@uniswap", "v4-sdk"))).toBe(false);
    expect(existsSync(join(TEMP_ROOT, "node_modules", "hardhat"))).toBe(false);

    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { calculateUniswapV4 } from "web3agent";
const poolKey = {
  currency0: { kind: "native", chainId: 4663, symbol: "ETH", name: "Ether", decimals: 18 },
  currency1: { kind: "erc20", chainId: 4663, address: "0x2222222222222222222222222222222222222222", symbol: "FIX", name: "Fixture Token", decimals: 18 },
  fee: 500,
  tickSpacing: 60,
  hooks: "0x0000000000000000000000000000000000000000",
};
const result = await calculateUniswapV4({ kind: "tickToPrice", poolKey, tick: 0 });
process.stdout.write(JSON.stringify(result));`,
      ],
      { cwd: TEMP_ROOT, encoding: "utf-8", env: { ...process.env, HOME: TEMP_ROOT } }
    );
    expect(JSON.parse(output)).toMatchObject({
      kind: "tickToPrice",
      price: { denominator: "1", numerator: "1", rounding: "exact" },
      tick: 0,
    });
  }, 180_000);
});
