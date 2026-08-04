import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  expectedV4SdkProvenance,
  registryMetadataSchema,
  verifyDownloadedTarball,
} from "./dependency-provenance.js";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const sourceRoot = join(repositoryRoot, "src");

const expectedBuildDependencies = {
  "@uniswap/sdk-core": "^7.18.0",
  "@uniswap/v4-sdk": "2.3.0",
} as const;

const expectedRuntimeDependencies = {
  viem: "^2.55.4",
} as const;

const packageManifestSchema = z.object({
  dependencies: z.record(z.string()),
  devDependencies: z.record(z.string()),
});

type BoundaryViolation = {
  readonly file: string;
  readonly packageName: string;
  readonly rule: "OFFICIAL_SDK_OUTSIDE_ADAPTER" | "UNIVERSAL_ROUTER_SDK";
};

function isOfficialSdkPackage(moduleName: string): boolean {
  return (
    moduleName === "@uniswap/sdk-core" ||
    moduleName === "@uniswap/v4-sdk" ||
    moduleName === "ethers" ||
    moduleName === "jsbi" ||
    moduleName.startsWith("@ethersproject/")
  );
}

function recordBoundaryViolation(
  violations: BoundaryViolation[],
  sourceFile: ts.SourceFile,
  sourceRootPath: string,
  moduleName: string
): void {
  const sourcePath = relative(sourceRootPath, sourceFile.fileName);
  if (moduleName === "@uniswap/universal-router-sdk") {
    violations.push({
      file: sourcePath,
      packageName: moduleName,
      rule: "UNIVERSAL_ROUTER_SDK",
    });
  }

  const adapterPath = join("uniswap-v4", "sdk-adapter.ts");
  if (isOfficialSdkPackage(moduleName) && sourcePath !== adapterPath) {
    violations.push({
      file: sourcePath,
      packageName: moduleName,
      rule: "OFFICIAL_SDK_OUTSIDE_ADAPTER",
    });
  }
}

function inspectImports(
  sourceFile: ts.SourceFile,
  sourceRootPath: string
): readonly BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      recordBoundaryViolation(violations, sourceFile, sourceRootPath, node.moduleSpecifier.text);
    }

    if (ts.isCallExpression(node)) {
      const [moduleArgument] = node.arguments;
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequireCall = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (
        (isDynamicImport || isRequireCall) &&
        moduleArgument !== undefined &&
        ts.isStringLiteral(moduleArgument)
      ) {
        recordBoundaryViolation(violations, sourceFile, sourceRootPath, moduleArgument.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

async function listTypeScriptFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listTypeScriptFiles(entryPath);
      }

      return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
    })
  );

  return files.flat().sort();
}

async function scanDependencyBoundary(
  sourceRootPath: string
): Promise<readonly BoundaryViolation[]> {
  const sourceFiles = await listTypeScriptFiles(sourceRootPath);
  const violations = await Promise.all(
    sourceFiles.map(async (sourcePath) => {
      const source = await readFile(sourcePath, "utf8");
      const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.ESNext, true);
      return inspectImports(sourceFile, sourceRootPath);
    })
  );

  return violations.flat();
}

async function downloadRegistryMetadata(): Promise<z.infer<typeof registryMetadataSchema>> {
  const packagePath = encodeURIComponent(expectedV4SdkProvenance.name);
  const response = await fetch(
    `https://registry.npmjs.org/${packagePath}/${expectedV4SdkProvenance.version}`
  );
  expect(response.ok).toBe(true);
  return registryMetadataSchema.parse(await response.json());
}

describe("Uniswap v4 dependency boundary", () => {
  it("pins and locks the compatible SDK dependency set", async () => {
    // Given: the package manifest and deterministic pnpm lockfile.
    const [packageJson, lockfile] = await Promise.all([
      readFile(join(repositoryRoot, "package.json"), "utf8"),
      readFile(join(repositoryRoot, "pnpm-lock.yaml"), "utf8"),
    ]);

    // When: the direct dependency contract is parsed.
    const manifest = packageManifestSchema.parse(JSON.parse(packageJson));

    // Then: runtime packages remain production dependencies while the bundled SDKs are build-only.
    for (const [packageName, expectedVersion] of Object.entries(expectedRuntimeDependencies)) {
      expect(manifest.dependencies[packageName]).toBe(expectedVersion);
    }
    for (const [packageName, expectedVersion] of Object.entries(expectedBuildDependencies)) {
      expect(manifest.dependencies[packageName]).toBeUndefined();
      expect(manifest.devDependencies[packageName]).toBe(expectedVersion);
    }
    expect(lockfile).toContain("'@uniswap/v4-sdk@2.3.0':");
    expect(lockfile).toContain(expectedV4SdkProvenance.integrity);
    expect(lockfile).toContain("specifier: ^2.55.4");
  });

  it("permits official SDK imports only in the adapter boundary", async () => {
    // Given: the repository source tree and a synthetic source tree with prohibited imports.
    const fixtureRoot = await mkdtemp(join(tmpdir(), "web3agent-uniswap-v4-boundary-"));
    const fixtureSource = join(fixtureRoot, "src");
    await mkdir(join(fixtureSource, "uniswap-v4"), { recursive: true });
    await writeFile(
      join(fixtureSource, "forbidden.ts"),
      'import "@uniswap/universal-router-sdk";\nimport "@uniswap/sdk-core";\nimport "@uniswap/v4-sdk";\nimport "jsbi";\nconst ethers = await import("ethers");\nvoid ethers;\n'
    );
    await writeFile(join(fixtureSource, "uniswap-v4", "sdk-adapter.ts"), 'import "ethers";\n');

    try {
      // When: import declarations and dynamic imports are inspected through the TypeScript AST.
      const [repositoryViolations, fixtureViolations] = await Promise.all([
        scanDependencyBoundary(sourceRoot),
        scanDependencyBoundary(fixtureSource),
      ]);

      // Then: the repository remains clean and the synthetic forbidden fixture is rejected.
      expect(repositoryViolations).toEqual([]);
      expect(fixtureViolations).toEqual([
        {
          file: "forbidden.ts",
          packageName: "@uniswap/universal-router-sdk",
          rule: "UNIVERSAL_ROUTER_SDK",
        },
        {
          file: "forbidden.ts",
          packageName: "@uniswap/sdk-core",
          rule: "OFFICIAL_SDK_OUTSIDE_ADAPTER",
        },
        {
          file: "forbidden.ts",
          packageName: "@uniswap/v4-sdk",
          rule: "OFFICIAL_SDK_OUTSIDE_ADAPTER",
        },
        {
          file: "forbidden.ts",
          packageName: "jsbi",
          rule: "OFFICIAL_SDK_OUTSIDE_ADAPTER",
        },
        {
          file: "forbidden.ts",
          packageName: "ethers",
          rule: "OFFICIAL_SDK_OUTSIDE_ADAPTER",
        },
      ]);
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });

  it("fails closed for mismatched registry provenance fixtures", () => {
    // Given: a registry record and tarball bytes that do not match the pinned source.
    const mismatchedMetadata = registryMetadataSchema.parse({
      dist: {
        integrity: "sha512-mismatched",
        tarball: "https://registry.npmjs.org/@uniswap/v4-sdk/-/v4-sdk-2.3.0.tgz",
      },
      gitHead: "0000000000000000000000000000000000000000",
    });

    // When: the dependency provenance is verified.
    const verify = () => verifyDownloadedTarball(mismatchedMetadata, new Uint8Array([0]), "");

    // Then: the mismatched fixture cannot be accepted.
    expect(verify).toThrow("pinned dependency boundary");
  });

  const registryProvenanceTest =
    process.env.WEB3AGENT_VERIFY_REGISTRY_PROVENANCE === "1" ? it : it.skip;

  registryProvenanceTest(
    "validates registry metadata and the downloaded locked tarball",
    async () => {
      // Given: an explicit registry-provenance verification run.
      const [metadata, lockfile] = await Promise.all([
        downloadRegistryMetadata(),
        readFile(join(repositoryRoot, "pnpm-lock.yaml"), "utf8"),
      ]);
      const tarballResponse = await fetch(metadata.dist.tarball);
      expect(tarballResponse.ok).toBe(true);

      // When: the published tarball is downloaded and inspected.
      const tarball = new Uint8Array(await tarballResponse.arrayBuffer());

      // Then: registry metadata, package bytes, lock integrity, and source revision agree.
      verifyDownloadedTarball(metadata, tarball, lockfile);
    }
  );
});
