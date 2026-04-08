import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCreateCli } from "../../src/create/cli.js";
import { VERSION } from "../../src/version.js";

describe("create-web3agent cli", () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
  });

  it("scaffolds into the current directory when no target directory is provided", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "create-web3agent-cli-"));
    let stderr = "";

    process.chdir(projectDir);
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });

    await runCreateCli(["--template", "vercel-ai-sdk", "--yes", "--skip-install", "--skip-checks"]);

    expect(existsSync(join(projectDir, "package.json"))).toBe(true);
    expect(stderr).toContain("Created . using the Vercel AI SDK starter.");
    expect(stderr).not.toContain("cd .");

    const packageJson = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf-8")) as {
      name: string;
    };
    expect(packageJson.name).toBe(basename(projectDir).toLowerCase());
  });

  it("prints subcommand help without scaffolding a directory", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "create-web3agent-cli-"));
    let stderr = "";

    process.chdir(projectDir);
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });

    await runCreateCli(["--help"]);

    expect(stderr).toContain("web3agent create");
    expect(stderr).toContain("If target-dir is omitted, the current directory is used.");
    expect(existsSync(join(projectDir, "--help"))).toBe(false);
  });

  it("prints version without scaffolding a directory", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "create-web3agent-cli-"));
    let stderr = "";

    process.chdir(projectDir);
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });

    await runCreateCli(["--version"]);

    expect(stderr).toContain(`web3agent ${VERSION}`);
    expect(existsSync(join(projectDir, "--version"))).toBe(false);
  });
});
