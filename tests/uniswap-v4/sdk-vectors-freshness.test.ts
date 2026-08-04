import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const generatorPath = join(repositoryRoot, "tests/uniswap-v4/fixtures/generate-sdk-vectors.mjs");
const fixturePath = join(repositoryRoot, "tests/uniswap-v4/fixtures/sdk-vectors.json");
const fixtureSchema = z.object({
  provenance: z.object({
    package: z.literal("@uniswap/v4-sdk"),
    version: z.literal("2.3.0"),
    gitHead: z.literal("ab3a18a62922c0bda493130e53f2c8f6fad59558"),
    integrityReference: z.literal(
      "sha512-aMsDxVFjnwxjWeX8lXJy+4SRPgllfEU05SJ6CRsiPOeqBMd9RHxvb0RXF4q42wNG/iKoUVg9O2q6s5uoRDXPrQ=="
    ),
    generatorSha256: z.string().length(64),
  }),
  inputs: z.object({
    poolKey: z.object({
      currency0: z.string(),
      currency1: z.string(),
      fee: z.number().int(),
      tickSpacing: z.number().int(),
      hooks: z.string(),
    }),
  }),
  poolId: z.string(),
});

const pinnedPoolKey = {
  currency0: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  currency1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  fee: 500,
  tickSpacing: 10,
  hooks: "0x0000000000000000000000000000000000000000",
};
const pinnedPoolId = "0x8bce1ae39d5f8fba09c172d539e290ee96f18ad917a044f7ed7a490348f88bcc";

async function regenerate(output: string, temporaryDirectory: string): Promise<void> {
  const configPath = join(temporaryDirectory, "vectors.config.ts");
  await writeFile(
    configPath,
    `import { defineConfig } from "tsup";\nimport { uniswapV4SdkNoExternal } from ${JSON.stringify(join(repositoryRoot, "tsup.config.js"))};\nexport default defineConfig({ entry: [${JSON.stringify(generatorPath)}], format: ["esm"], target: "node22", platform: "node", noExternal: uniswapV4SdkNoExternal, splitting: false, clean: true });\n`
  );
  const outputDirectory = join(temporaryDirectory, "bundle");
  await execFileAsync(
    "pnpm",
    ["exec", "tsup", "--config", configPath, "--out-dir", outputDirectory],
    {
      cwd: repositoryRoot,
    }
  );
  await execFileAsync("node", [join(outputDirectory, "generate-sdk-vectors.js")], {
    cwd: repositoryRoot,
    env: { ...process.env, TASK5_GENERATOR_SOURCE: generatorPath, TASK5_OUTPUT: output },
  });
}

describe("Uniswap v4 SDK vector freshness", () => {
  it("Given the standalone generator When inspecting its imports Then it only depends on Node and the pinned SDK closure", async () => {
    const imports = Array.from(
      (await readFile(generatorPath, "utf8")).matchAll(/from ["']([^"']+)["']/g)
    ).flatMap((match) => (match[1] === undefined ? [] : [match[1]]));

    expect(imports).toEqual([
      "node:crypto",
      "node:fs/promises",
      "node:url",
      "@uniswap/sdk-core",
      "@uniswap/v4-sdk",
    ]);
  });

  it("Given committed PoolKey facts When reading the pool fixture Then PoolId remains bound to every fee, tick, hook, and currency input", async () => {
    const fixture = fixtureSchema.parse(JSON.parse(await readFile(fixturePath, "utf8")));

    expect(fixture.inputs.poolKey).toEqual(pinnedPoolKey);
    expect(fixture.poolId).toBe(pinnedPoolId);
  });

  it("Given the pinned standalone generator When regenerating twice Then outputs and committed provenance are byte-for-byte fresh", async () => {
    const [generator, fixture] = await Promise.all([
      readFile(generatorPath),
      readFile(fixturePath, "utf8"),
    ]);
    const parsedFixture = fixtureSchema.parse(JSON.parse(fixture));
    const temporaryDirectory = await mkdtemp(join(repositoryRoot, ".uniswap-v4-vectors-"));

    try {
      const first = join(temporaryDirectory, "first.json");
      const second = join(temporaryDirectory, "second.json");
      await regenerate(first, temporaryDirectory);
      await regenerate(second, temporaryDirectory);
      const [firstOutput, secondOutput] = await Promise.all([
        readFile(first, "utf8"),
        readFile(second, "utf8"),
      ]);

      expect(parsedFixture.provenance.generatorSha256).toBe(
        createHash("sha256").update(generator).digest("hex")
      );
      expect(firstOutput).toBe(secondOutput);
      expect(firstOutput).toBe(fixture);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
