import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProject } from "../../src/create/create.js";
import { VERSION } from "../../src/version.js";

describe("create-web3agent createProject", () => {
  it("scaffolds the first shipped Vercel AI SDK starter", async () => {
    const root = mkdtempSync(join(tmpdir(), "create-web3agent-project-"));
    const targetDir = join(root, "my-agent");

    const result = await createProject({
      targetDir,
      templateId: "vercel-ai-sdk",
      yes: true,
      skipInstall: true,
      skipChecks: true,
    });

    expect(result.template.id).toBe("vercel-ai-sdk");
    expect(result.postinstall.commands).toEqual([]);
    expect(existsSync(join(targetDir, "package.json"))).toBe(true);
    expect(existsSync(join(targetDir, "README.md"))).toBe(true);
    expect(existsSync(join(targetDir, "src", "tools.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "src", "examples", "lifecycle.ts"))).toBe(true);

    const packageJson = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf-8")) as {
      name: string;
      dependencies: Record<string, string>;
    };

    expect(packageJson.name).toBe("my-agent");
    expect(packageJson.dependencies.web3agent).toBe(VERSION);
    expect(readFileSync(join(targetDir, "README.md"), "utf-8")).toContain("transaction_confirm");
    expect(readFileSync(join(targetDir, "README.md"), "utf-8")).toContain("30-second path");
  });

  it("scaffolds the Mastra starter with runtime-safe web3agent lifecycle files", async () => {
    const root = mkdtempSync(join(tmpdir(), "create-web3agent-project-"));
    const targetDir = join(root, "mastra-agent");

    const result = await createProject({
      targetDir,
      templateId: "mastra",
      yes: true,
      skipInstall: true,
      skipChecks: true,
    });

    expect(result.template.id).toBe("mastra");
    expect(existsSync(join(targetDir, "src", "mastra", "index.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "src", "mastra", "agents", "web3-agent.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "src", "mastra", "tools", "web3agent-tools.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "src", "examples", "lifecycle.ts"))).toBe(true);

    const packageJson = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf-8")) as {
      dependencies: Record<string, string>;
    };

    expect(packageJson.dependencies.mastra).toBeDefined();
    expect(packageJson.dependencies.web3agent).toBe(VERSION);
    expect(readFileSync(join(targetDir, "README.md"), "utf-8")).toContain("prepareOperation");
    expect(readFileSync(join(targetDir, "README.md"), "utf-8")).toContain(
      "quote -> simulate -> prepare -> confirm -> execute -> resume -> status"
    );
    expect(readFileSync(join(targetDir, "README.md"), "utf-8")).toContain("30-second path");
  });

  it("scaffolds the MCP-host starter with a config helper and local MCP entrypoint", async () => {
    const root = mkdtempSync(join(tmpdir(), "create-web3agent-project-"));
    const targetDir = join(root, "mcp-host-agent");

    const result = await createProject({
      targetDir,
      templateId: "mcp-host",
      yes: true,
      skipInstall: true,
      skipChecks: true,
    });

    expect(result.template.id).toBe("mcp-host");
    expect(existsSync(join(targetDir, "src", "index.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "src", "config-helper.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "src", "examples", "lifecycle.ts"))).toBe(true);

    const packageJson = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf-8")) as {
      dependencies: Record<string, string>;
    };

    expect(packageJson.dependencies.web3agent).toBe(VERSION);
    expect(readFileSync(join(targetDir, "README.md"), "utf-8")).toContain("npx web3agent");
    expect(readFileSync(join(targetDir, "README.md"), "utf-8")).toContain(
      "lifi_execute_bridge -> transaction_confirm"
    );
    expect(readFileSync(join(targetDir, "README.md"), "utf-8")).toContain("30-second path");
  });

  it("derives a valid package name when scaffolding into the current directory", async () => {
    const root = mkdtempSync(join(tmpdir(), "create-web3agent-project-"));
    const previousCwd = process.cwd();
    process.chdir(root);

    try {
      const result = await createProject({
        targetDir: ".",
        templateId: "vercel-ai-sdk",
        yes: true,
        skipInstall: true,
        skipChecks: true,
      });

      const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")) as {
        name: string;
      };

      expect(packageJson.name).toBe(basename(root).toLowerCase());
      expect(result.postinstall.nextSteps).toEqual(["npm run dev"]);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("keeps nested relative target paths in the suggested next steps", async () => {
    const root = mkdtempSync(join(tmpdir(), "create-web3agent-project-"));
    const previousCwd = process.cwd();
    process.chdir(root);

    try {
      const result = await createProject({
        targetDir: "apps/my-agent",
        templateId: "vercel-ai-sdk",
        yes: true,
        skipInstall: true,
        skipChecks: true,
      });

      expect(result.postinstall.nextSteps[0]).toBe("cd apps/my-agent");
    } finally {
      process.chdir(previousCwd);
    }
  });
});
