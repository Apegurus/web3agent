import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const adapterPath = join(repositoryRoot, "src/uniswap-v4/sdk-adapter-api.ts");

describe("Uniswap v4 production SDK facade ESM bundling", () => {
  it("Given the actual production SDK facade When bundled with the verified SDK closure Then Node ESM reports its observable PoolId", async () => {
    const temporaryDirectory = await mkdtemp(join(repositoryRoot, ".uniswap-v4-adapter-"));
    const entryPath = join(temporaryDirectory, "adapter-entry.ts");
    const configPath = join(temporaryDirectory, "adapter.config.ts");
    const outputDirectory = join(temporaryDirectory, "bundle");

    try {
      await writeFile(
        entryPath,
        `import { getPoolIdentity } from ${JSON.stringify(adapterPath)};\nconst result = getPoolIdentity({ currency0: { kind: "erc20", chainId: 1, address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", name: "DAI Stablecoin", decimals: 18 }, currency1: { kind: "erc20", chainId: 1, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin", decimals: 6 }, fee: 100, tickSpacing: 10, hooks: "0x0000000000000000000000000000000000000000" });\nprocess.stdout.write(JSON.stringify({ poolId: result.poolId }));\n`
      );
      await writeFile(
        configPath,
        `import { defineConfig } from "tsup";\nimport { uniswapV4SdkNoExternal } from ${JSON.stringify(join(repositoryRoot, "tsup.config.js"))};\nexport default defineConfig({ entry: [${JSON.stringify(entryPath)}], format: ["esm"], target: "node22", platform: "node", noExternal: uniswapV4SdkNoExternal, splitting: false, clean: true });\n`
      );
      await execFileAsync(
        "pnpm",
        ["exec", "tsup", "--config", configPath, "--out-dir", outputDirectory],
        {
          cwd: repositoryRoot,
        }
      );
      const { stdout } = await execFileAsync(
        "node",
        [
          "--input-type=module",
          "-e",
          `await import(${JSON.stringify(pathToFileURL(join(outputDirectory, "adapter-entry.js")).href)});`,
        ],
        { cwd: repositoryRoot }
      );

      expect(JSON.parse(stdout)).toEqual({
        poolId: "0x503fb8d73fd2351c645ae9fea85381bac6b16ea0c2038e14dc1e96d447c8ffbb",
      });
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
