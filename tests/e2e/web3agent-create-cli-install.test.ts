import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePackedTarballs } from "./pack-fixture.js";

const ROOT = process.cwd();
const TEMP_ROOT = mkdtempSync(join(tmpdir(), "web3agent-create-cli-install-"));
const EXEC_SYNC_MAX_BUFFER = 10 * 1024 * 1024;
let rootTarball = "";
let createTarball = "";

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
    web3agent: `file:${rootTarball}`,
  };

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf-8");
}

describe("web3agent create packed CLI", () => {
  beforeAll(() => {
    ({ rootTarball, createTarball } = ensurePackedTarballs());
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

    run(`npm install ${rootTarball}`, cliRoot);
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

    run(`npm install ${rootTarball}`, cliRoot);
    run(`npm install ${createTarball}`, cliRoot);
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
