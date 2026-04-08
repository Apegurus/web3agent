import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/create/args.js";
import { TEMPLATE_MANIFEST, getTemplateDefinition } from "../../src/create/template-manifest.js";

describe("create-web3agent template manifest", () => {
  it("tracks the roadmap starter templates", () => {
    expect(TEMPLATE_MANIFEST.map((entry) => entry.id)).toEqual([
      "vercel-ai-sdk",
      "mastra",
      "mcp-host",
    ]);
  });

  it("marks the first shipped slice as the available template", () => {
    expect(getTemplateDefinition("vercel-ai-sdk").status).toBe("available");
    expect(getTemplateDefinition("mastra").status).toBe("available");
    expect(getTemplateDefinition("mcp-host").status).toBe("available");
  });
});

describe("create-web3agent args", () => {
  it("parses the non-interactive happy path", () => {
    expect(
      parseArgs([
        "my-agent",
        "--template",
        "vercel-ai-sdk",
        "--yes",
        "--skip-install",
        "--skip-checks",
      ])
    ).toEqual({
      targetDir: "my-agent",
      templateId: "vercel-ai-sdk",
      yes: true,
      skipInstall: true,
      skipChecks: true,
      help: false,
      version: false,
    });
  });

  it("defaults to the current directory when no target is provided", () => {
    expect(parseArgs(["--template", "mcp-host", "--yes"])).toEqual({
      targetDir: ".",
      templateId: "mcp-host",
      yes: true,
      skipInstall: false,
      skipChecks: false,
      help: false,
      version: false,
    });
  });

  it("recognizes help and version flags without treating them as target directories", () => {
    expect(parseArgs(["--help"])).toEqual({
      targetDir: ".",
      yes: false,
      skipInstall: false,
      skipChecks: false,
      help: true,
      version: false,
    });

    expect(parseArgs(["--version"])).toEqual({
      targetDir: ".",
      yes: false,
      skipInstall: false,
      skipChecks: false,
      help: false,
      version: true,
    });
  });

  it("rejects unsupported template ids", () => {
    expect(() => parseArgs(["my-agent", "--template", "unknown-template"])).toThrow(
      "Unsupported template"
    );
  });
});
