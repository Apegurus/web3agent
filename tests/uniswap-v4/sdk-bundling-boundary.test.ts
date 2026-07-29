import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const privateSdkClosureSpecifier =
  /^(?:@uniswap\/|@ethersproject\/|aes-js|bech32|big\.js|bn\.js|brorand|decimal\.js-light|elliptic|ethers|hash\.js|hmac-drbg|inherits|js-sha3|jsbi|minimalistic-(?:assert|crypto-utils)|scrypt-js|tiny-(?:invariant|warning)|toformat|tslib)(?:\/|$)/;

const packageManifestSchema = z.object({
  pnpm: z.object({
    peerDependencyRules: z.object({
      allowedVersions: z.object({
        viem: z.literal("2.55.4"),
      }),
    }),
  }),
});

async function buildFixture(configPath: string, outputDirectory: string): Promise<string> {
  await execFileAsync(
    "pnpm",
    ["exec", "tsup", "--config", configPath, "--out-dir", outputDirectory, "--clean"],
    { cwd: repositoryRoot }
  );
  return join(outputDirectory, "sdk-adapter-like.js");
}

async function loadAsNodeEsm(bundlePath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "node",
    [
      "--input-type=module",
      "-e",
      `const fixture = await import(${JSON.stringify(pathToFileURL(bundlePath).href)}); process.stdout.write(fixture.sdkAdapterLikeProbe);`,
    ],
    { cwd: repositoryRoot }
  );
  return stdout;
}

async function listJavaScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return listJavaScriptFiles(path);
      return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
    })
  );
  return files.flat();
}

function bareImportSpecifiers(source: string): string[] {
  return Array.from(
    source.matchAll(/(?:\bfrom\s*|\bimport\s*\()["']([^"']+)["']/g),
    (match) => match[1]
  );
}

describe("Uniswap v4 SDK bundling boundary", () => {
  it("requires the production noExternal policy and current viem peer allow-list", async () => {
    // Given: the production build configuration and package peer metadata.
    const [buildConfig, packageJson] = await Promise.all([
      readFile(join(repositoryRoot, "tsup.config.ts"), "utf8"),
      readFile(join(repositoryRoot, "package.json"), "utf8"),
    ]);

    // When: the SDK isolation policy is evaluated.
    const packageManifest = packageManifestSchema.parse(JSON.parse(packageJson));

    // Then: the private SDK closure is configured for bundling, not externalization.
    expect(buildConfig).toContain("export const uniswapV4SdkNoExternal");
    expect(buildConfig).toContain("...uniswapV4SdkNoExternal");
    expect(buildConfig).toContain('"bn.js"');
    expect(buildConfig).toContain('"decimal.js-light"');
    expect(buildConfig).toContain('"js-sha3"');
    expect(packageManifest.pnpm.peerDependencyRules.allowedVersions.viem).toBe("2.55.4");
  });

  it("fails when the SDK is externalized and loads when the production closure is bundled", async () => {
    // Given: equivalent adapter-like fixture builds with and without the production closure.
    const fixtureDirectory = await mkdtemp(join(repositoryRoot, ".uniswap-v4-sdk-build-"));
    const entryPath = join(fixtureDirectory, "sdk-adapter-like.ts");
    const externalConfigPath = join(fixtureDirectory, "external.config.ts");
    const bundledConfigPath = join(fixtureDirectory, "bundled.config.ts");
    const externalOutputDirectory = join(fixtureDirectory, "external");
    const bundledOutputDirectory = join(fixtureDirectory, "bundled");
    await writeFile(
      entryPath,
      'import { V4PositionManager } from "@uniswap/v4-sdk";\nexport const sdkAdapterLikeProbe = typeof V4PositionManager;\n'
    );
    await writeFile(
      externalConfigPath,
      `import { defineConfig } from "tsup";\nexport default defineConfig({ entry: [${JSON.stringify(entryPath)}], format: ["esm"], noExternal: [], platform: "node", target: "node22" });\n`
    );
    await writeFile(
      bundledConfigPath,
      `import { defineConfig } from "tsup";\nimport { uniswapV4SdkNoExternal } from "../tsup.config.js";\nexport default defineConfig({ entry: [${JSON.stringify(entryPath)}], format: ["esm"], noExternal: uniswapV4SdkNoExternal, platform: "node", target: "node22" });\n`
    );

    try {
      // When: Node imports the externalized and bundled ESM outputs.
      const externalBundle = await buildFixture(externalConfigPath, externalOutputDirectory);
      const externalFailure = await loadAsNodeEsm(externalBundle).then(
        () => undefined,
        (error: unknown) => error
      );
      const bundledBundle = await buildFixture(bundledConfigPath, bundledOutputDirectory);
      const bundledOutput = await loadAsNodeEsm(bundledBundle);

      // Then: externalization fails while the production closure is ESM-safe.
      expect(externalFailure).toBeInstanceOf(Error);
      expect(bundledOutput).toBe("function");
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true });
    }
  });

  it("does not leave a private SDK-graph dependency external in built entry points or chunks", async () => {
    // Given: the package build output consumed by root, runtime, and CLI users.
    const distDirectory = join(repositoryRoot, "dist");

    // When: every ESM import specifier in the build output is inspected.
    const chunks = await listJavaScriptFiles(distDirectory);
    const externalPrivateImports = (
      await Promise.all(
        chunks.map(async (chunk) => ({
          chunk,
          imports: bareImportSpecifiers(await readFile(chunk, "utf8")).filter((specifier) =>
            privateSdkClosureSpecifier.test(specifier)
          ),
        }))
      )
    ).filter(({ imports }) => imports.length > 0);

    // Then: the complete private SDK graph is bundled, never delegated to consumer node_modules.
    expect(externalPrivateImports).toEqual([]);
  });
});
