import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCreateCli } from "../../src/create/cli.js";

describe("create-web3agent smoke", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it("materializes the bundled Vercel starter through the CLI entrypoint", async () => {
    const root = mkdtempSync(join(tmpdir(), "create-web3agent-cli-"));
    tempDirs.push(root);
    const targetDir = join(root, "starter-app");
    let stderr = "";

    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });

    try {
      await runCreateCli([
        targetDir,
        "--template",
        "vercel-ai-sdk",
        "--yes",
        "--skip-install",
        "--skip-checks",
      ]);
    } finally {
      writeSpy.mockRestore();
    }

    expect(existsSync(join(targetDir, "src", "index.ts"))).toBe(true);
    expect(existsSync(join(targetDir, ".env.example"))).toBe(true);
    expect(readFileSync(join(targetDir, "README.md"), "utf-8")).toContain(
      "quote -> simulate -> prepare -> confirm -> execute -> resume -> status"
    );
    expect(stderr).toContain("Next steps");
  });

  it("runs post-install commands by default when skip flags are not set", async () => {
    const root = mkdtempSync(join(tmpdir(), "create-web3agent-cli-"));
    tempDirs.push(root);
    const targetDir = join(root, "starter-app");
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];

    await runCreateCli([targetDir, "--template", "vercel-ai-sdk", "--yes"], {
      commandRunner: async ({ command, args, cwd }) => {
        calls.push({ command, args, cwd });
      },
    });

    expect(calls).toEqual([
      { command: "npm", args: ["install"], cwd: targetDir },
      { command: "npm", args: ["run", "check"], cwd: targetDir },
    ]);
  });

  it("materializes the bundled Mastra starter through the CLI entrypoint", async () => {
    const root = mkdtempSync(join(tmpdir(), "create-web3agent-cli-"));
    tempDirs.push(root);
    const targetDir = join(root, "mastra-app");

    await runCreateCli([
      targetDir,
      "--template",
      "mastra",
      "--yes",
      "--skip-install",
      "--skip-checks",
    ]);

    expect(existsSync(join(targetDir, "src", "mastra", "index.ts"))).toBe(true);
    expect(readFileSync(join(targetDir, "README.md"), "utf-8")).toContain("Mastra");
    expect(readFileSync(join(targetDir, "src", "examples", "lifecycle.ts"), "utf-8")).toContain(
      "resumeOperation"
    );
  });

  it("materializes the bundled MCP-host starter through the CLI entrypoint", async () => {
    const root = mkdtempSync(join(tmpdir(), "create-web3agent-cli-"));
    tempDirs.push(root);
    const targetDir = join(root, "mcp-host-app");

    await runCreateCli([
      targetDir,
      "--template",
      "mcp-host",
      "--yes",
      "--skip-install",
      "--skip-checks",
    ]);

    expect(existsSync(join(targetDir, "src", "index.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "src", "config-helper.ts"))).toBe(true);
    expect(readFileSync(join(targetDir, "README.md"), "utf-8")).toContain("MCP");
  });
});
