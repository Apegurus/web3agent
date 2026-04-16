import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureBuild } from "../global-setup.js";

const ROOT = process.cwd();
const TEMP_ROOT = mkdtempSync(join(tmpdir(), "web3agent-create-cli-install-"));
const PACK_ROOT = join(TEMP_ROOT, "packs");
const ROOT_PACKAGE = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
  version: string;
};
const CREATE_PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "packages", "create-web3agent", "package.json"), "utf-8")
) as {
  version: string;
};
const ROOT_TARBALL = join(PACK_ROOT, `web3agent-${ROOT_PACKAGE.version}.tgz`);
const CREATE_TARBALL = join(PACK_ROOT, `create-web3agent-${CREATE_PACKAGE.version}.tgz`);
const EXEC_SYNC_MAX_BUFFER = 10 * 1024 * 1024;

function run(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
    maxBuffer: EXEC_SYNC_MAX_BUFFER,
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

describe("web3agent create packed CLI", () => {
  beforeAll(() => {
    ensureBuild();
    mkdirSync(PACK_ROOT, { recursive: true });
    execSync(`pnpm pack --pack-destination ${PACK_ROOT}`, {
      cwd: ROOT,
      stdio: "inherit",
    });
    execSync(`pnpm pack --pack-destination ${PACK_ROOT}`, {
      cwd: join(ROOT, "packages", "create-web3agent"),
      stdio: "inherit",
    });
  });

  afterAll(() => {
    rmSync(TEMP_ROOT, { recursive: true, force: true });
  });

  it("installs the packed web3agent CLI and scaffolds a starter through the create subcommand", () => {
    const cliRoot = join(TEMP_ROOT, "cli-root");
    const projectDir = join(cliRoot, "starter-app");

    mkdirSync(cliRoot, { recursive: true });
    writeFileSync(
      join(cliRoot, "package.json"),
      `${JSON.stringify({ name: "web3agent-create-cli-install", private: true }, null, 2)}\n`,
      "utf-8"
    );

    run(`npm install ${ROOT_TARBALL}`, cliRoot);
    run(
      "node node_modules/web3agent/dist/cli.js create starter-app --template vercel-ai-sdk --yes --skip-install --skip-checks",
      cliRoot
    );

    expect(existsSync(join(projectDir, "package.json"))).toBe(true);

    patchGeneratedPackage(projectDir);

    run("npm install", projectDir);
    const output = run("npm run check", projectDir);

    expect(output.trim().length).toBeGreaterThan(0);
  }, 180000);

  it("installs the packed create-web3agent compatibility wrapper and scaffolds a starter", () => {
    const cliRoot = join(TEMP_ROOT, "compat-root");
    const projectDir = join(cliRoot, "compat-starter");

    mkdirSync(cliRoot, { recursive: true });
    writeFileSync(
      join(cliRoot, "package.json"),
      `${JSON.stringify({ name: "create-web3agent-compat-install", private: true }, null, 2)}\n`,
      "utf-8"
    );

    run(`npm install ${ROOT_TARBALL}`, cliRoot);
    run(`npm install ${CREATE_TARBALL}`, cliRoot);
    run(
      "node node_modules/create-web3agent/dist/index.js compat-starter --template vercel-ai-sdk --yes --skip-install --skip-checks",
      cliRoot
    );

    expect(existsSync(join(projectDir, "package.json"))).toBe(true);

    patchGeneratedPackage(projectDir);

    run("npm install", projectDir);
    const output = run("npm run check", projectDir);

    expect(output.trim().length).toBeGreaterThan(0);
  }, 180000);
});
