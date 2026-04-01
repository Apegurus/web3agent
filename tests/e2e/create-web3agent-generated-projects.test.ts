import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProject } from "../../src/create/create.js";

const ROOT = process.cwd();
const TEMP_ROOT = mkdtempSync(join(tmpdir(), "create-web3agent-generated-projects-"));
const PACK_ROOT = join(TEMP_ROOT, "packs");
const ROOT_PACKAGE = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
  version: string;
};
const ROOT_TARBALL = join(PACK_ROOT, `web3agent-${ROOT_PACKAGE.version}.tgz`);

function run(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
  });
}

function patchGeneratedPackage(projectDir: string): void {
  const packageJsonPath = join(projectDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
    dependencies?: Record<string, string>;
  };

  packageJson.dependencies = {
    ...packageJson.dependencies,
    web3agent: `file:${ROOT_TARBALL}`,
  };

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf-8");
}

describe("generated starter projects", () => {
  beforeAll(() => {
    execSync(`pnpm pack --pack-destination ${PACK_ROOT}`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: "pipe",
    });
  });

  afterAll(() => {
    rmSync(TEMP_ROOT, { recursive: true, force: true });
  });

  for (const templateId of ["vercel-ai-sdk", "mastra", "mcp-host"] as const) {
    it(`installs and passes npm run check for ${templateId}`, async () => {
      const projectDir = join(TEMP_ROOT, templateId);

      await createProject({
        targetDir: projectDir,
        templateId,
        yes: true,
        skipInstall: true,
        skipChecks: true,
      });

      patchGeneratedPackage(projectDir);

      run("npm install", projectDir);
      const output = run("npm run check", projectDir);

      expect(output.trim().length).toBeGreaterThan(0);
    }, 180000);
  }
});
