import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderTemplate } from "../../src/create/render.js";
import { VERSION } from "../../src/version.js";

describe("create-web3agent renderTemplate", () => {
  it("renders nested files and replaces template tokens", async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "create-web3agent-render-source-"));
    const targetDir = mkdtempSync(join(tmpdir(), "create-web3agent-render-target-"));
    mkdirSync(join(sourceDir, "src"), { recursive: true });

    writeFileSync(
      join(sourceDir, "package.json"),
      JSON.stringify(
        {
          name: "__PACKAGE_NAME__",
          dependencies: {
            web3agent: "__WEB3AGENT_VERSION__",
          },
        },
        null,
        2
      )
    );
    writeFileSync(
      join(sourceDir, "README.md"),
      "# __PROJECT_NAME__\n\nUse transaction_confirm after lifi_execute_bridge.\n"
    );
    writeFileSync(join(sourceDir, "src", "index.ts"), "export const app = '__PROJECT_NAME__';\n");

    await renderTemplate({
      sourceDir,
      targetDir,
      tokens: {
        PROJECT_NAME: "My Agent",
        PACKAGE_NAME: "my-agent",
        WEB3AGENT_VERSION: VERSION,
      },
    });

    const packageJson = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf-8")) as {
      name: string;
      dependencies: { web3agent: string };
    };

    expect(packageJson.name).toBe("my-agent");
    expect(packageJson.dependencies.web3agent).toBe(VERSION);
    expect(readFileSync(join(targetDir, "README.md"), "utf-8")).toContain("My Agent");
    expect(readFileSync(join(targetDir, "src", "index.ts"), "utf-8")).toContain("My Agent");
  });

  it("copies binary files without corruption", async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "create-web3agent-render-source-"));
    const targetDir = mkdtempSync(join(tmpdir(), "create-web3agent-render-target-"));

    const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    writeFileSync(join(sourceDir, "icon.png"), binaryContent);

    await renderTemplate({
      sourceDir,
      targetDir,
      tokens: { PROJECT_NAME: "Test" },
    });

    const result = readFileSync(join(targetDir, "icon.png"));
    expect(Buffer.compare(result, binaryContent)).toBe(0);
  });

  it("refuses to write into a non-empty directory", async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "create-web3agent-render-source-"));
    const targetDir = mkdtempSync(join(tmpdir(), "create-web3agent-render-target-"));
    writeFileSync(join(sourceDir, "README.md"), "hello\n");
    writeFileSync(join(targetDir, "existing.txt"), "keep me\n");

    await expect(
      renderTemplate({
        sourceDir,
        targetDir,
        tokens: {
          PROJECT_NAME: "My Agent",
          PACKAGE_NAME: "my-agent",
          WEB3AGENT_VERSION: VERSION,
        },
      })
    ).rejects.toThrow("Target directory is not empty");
  });

  it("rejects target paths that exist as files", async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "create-web3agent-render-source-"));
    const targetRoot = mkdtempSync(join(tmpdir(), "create-web3agent-render-target-"));
    const targetPath = join(targetRoot, "target.txt");

    writeFileSync(join(sourceDir, "README.md"), "hello\n");
    writeFileSync(targetPath, "not a directory\n");

    await expect(
      renderTemplate({
        sourceDir,
        targetDir: targetPath,
        tokens: {
          PROJECT_NAME: "My Agent",
          PACKAGE_NAME: "my-agent",
          WEB3AGENT_VERSION: VERSION,
        },
      })
    ).rejects.toThrow(`Target path exists and is not a directory: ${targetPath}`);
  });
});
