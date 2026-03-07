import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
  const existsSync = vi.fn();
  const readFile = vi.fn();
  const writeFile = vi.fn();
  const mkdir = vi.fn();

  return { existsSync, readFile, writeFile, mkdir };
});

vi.mock("node:fs", () => ({
  existsSync: mockState.existsSync,
}));

vi.mock("node:fs/promises", () => ({
  readFile: mockState.readFile,
  writeFile: mockState.writeFile,
  mkdir: mockState.mkdir,
}));

describe("installContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a context file when it does not exist", async () => {
    mockState.existsSync.mockReturnValue(false);

    const { installContext } = await import("../../src/hosts/context/index.js");
    const result = await installContext("claude", {
      projectDir: "/repo",
      mode: "proxy",
      dryRun: false,
    });

    expect(result).toEqual({ configPath: "/repo/CLAUDE.md", action: "created" });
    expect(mockState.mkdir).toHaveBeenCalledWith("/repo", { recursive: true });
    expect(mockState.writeFile).toHaveBeenCalledWith(
      "/repo/CLAUDE.md",
      expect.stringContaining("<!-- web3agent:start -->"),
      "utf-8"
    );
  });

  it("returns dry-run result without writing files", async () => {
    mockState.existsSync.mockReturnValue(false);

    const { installContext } = await import("../../src/hosts/context/index.js");
    const result = await installContext("windsurf", {
      projectDir: "/repo",
      mode: "proxy",
      dryRun: true,
    });

    expect(result).toEqual({
      configPath: "/repo/.windsurf/rules/web3agent.md",
      action: "created",
      diff: "Would create /repo/.windsurf/rules/web3agent.md",
    });
    expect(mockState.mkdir).not.toHaveBeenCalled();
    expect(mockState.writeFile).not.toHaveBeenCalled();
  });

  it("updates managed block in existing file", async () => {
    mockState.existsSync.mockReturnValue(true);
    mockState.readFile.mockResolvedValue(
      "# Existing\n\n<!-- web3agent:start -->\nold body\n<!-- web3agent:end -->\n"
    );

    const { installContext } = await import("../../src/hosts/context/index.js");
    const result = await installContext("opencode", {
      projectDir: "/repo",
      mode: "proxy",
      dryRun: false,
    });

    expect(result).toEqual({ configPath: "/repo/AGENTS.md", action: "updated" });
    expect(mockState.writeFile).toHaveBeenCalledWith(
      "/repo/AGENTS.md",
      expect.stringContaining("This project has web3agent configured"),
      "utf-8"
    );
  });

  it("returns unchanged when cursor context is already current", async () => {
    mockState.existsSync.mockReturnValue(true);
    mockState.readFile.mockResolvedValue(`---
description: Web3 capabilities
globs: []
alwaysApply: false
---

<!-- web3agent:start -->
## Web3

This project has web3agent configured. Use the MCP tools for Web3 operations.
See: web3agent server_status, list_supported_chains for available capabilities.
<!-- web3agent:end -->
`);

    const { installContext } = await import("../../src/hosts/context/index.js");
    const result = await installContext("cursor", {
      projectDir: "/repo",
      mode: "proxy",
      dryRun: false,
    });

    expect(result).toEqual({
      configPath: "/repo/.cursor/rules/web3agent.mdc",
      action: "unchanged",
    });
    expect(mockState.writeFile).not.toHaveBeenCalled();
  });

  it("writes cursor context with WEB3_CONTEXT.md content block", async () => {
    mockState.existsSync.mockReturnValue(false);

    const { installContext } = await import("../../src/hosts/context/index.js");
    await installContext("cursor", {
      projectDir: "/repo",
      mode: "proxy",
      dryRun: false,
    });

    expect(mockState.writeFile).toHaveBeenCalledWith(
      "/repo/.cursor/rules/web3agent.mdc",
      expect.stringContaining("## Web3"),
      "utf-8"
    );
    expect(mockState.writeFile).toHaveBeenCalledWith(
      "/repo/.cursor/rules/web3agent.mdc",
      expect.stringContaining("See: web3agent server_status, list_supported_chains"),
      "utf-8"
    );
  });

  it("surfaces errors when context source cannot be read", async () => {
    mockState.existsSync.mockReturnValue(true);
    mockState.readFile.mockRejectedValue(new Error("ENOENT: missing source file"));

    const { installContext } = await import("../../src/hosts/context/index.js");

    await expect(
      installContext("claude", {
        projectDir: "/repo",
        mode: "proxy",
        dryRun: false,
      })
    ).rejects.toThrow("missing source file");
    expect(mockState.writeFile).not.toHaveBeenCalled();
  });

  it("uses host-specific target paths", async () => {
    mockState.existsSync.mockReturnValue(false);

    const { installContext } = await import("../../src/hosts/context/index.js");
    await installContext("windsurf", {
      projectDir: "/repo",
      mode: "proxy",
      dryRun: false,
    });

    expect(mockState.writeFile).toHaveBeenCalledWith(
      join("/repo", ".windsurf", "rules", "web3agent.md"),
      expect.any(String),
      "utf-8"
    );
  });
});
