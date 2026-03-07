import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
  const detectHosts = vi.fn();
  const assertSingleHost = vi.fn();
  const installContext = vi.fn();

  const claudeWrite = vi.fn();
  const cursorWrite = vi.fn();
  const windsurfWrite = vi.fn();
  const opencodeWrite = vi.fn();

  const existsSync = vi.fn();
  const readFile = vi.fn();
  const writeFile = vi.fn();
  const mkdir = vi.fn();

  return {
    detectHosts,
    assertSingleHost,
    installContext,
    claudeWrite,
    cursorWrite,
    windsurfWrite,
    opencodeWrite,
    existsSync,
    readFile,
    writeFile,
    mkdir,
  };
});

vi.mock("node:fs", () => ({
  existsSync: mockState.existsSync,
}));

vi.mock("node:fs/promises", () => ({
  readFile: mockState.readFile,
  writeFile: mockState.writeFile,
  mkdir: mockState.mkdir,
}));

vi.mock("../../src/hosts/detect.js", () => ({
  detectHosts: mockState.detectHosts,
  assertSingleHost: mockState.assertSingleHost,
}));

vi.mock("../../src/hosts/context/index.js", () => ({
  installContext: mockState.installContext,
}));

vi.mock("../../src/hosts/writers/claude.js", () => ({
  ClaudeWriter: class {
    write = mockState.claudeWrite;
  },
}));

vi.mock("../../src/hosts/writers/cursor.js", () => ({
  CursorWriter: class {
    write = mockState.cursorWrite;
  },
}));

vi.mock("../../src/hosts/writers/windsurf.js", () => ({
  WindsurfWriter: class {
    write = mockState.windsurfWrite;
  },
}));

vi.mock("../../src/hosts/writers/opencode.js", () => ({
  OpenCodeWriter: class {
    write = mockState.opencodeWrite;
  },
}));

describe("runInit", () => {
  const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  beforeEach(() => {
    vi.clearAllMocks();

    mockState.detectHosts.mockResolvedValue({ detected: ["cursor"], projectDir: "/project" });
    mockState.assertSingleHost.mockReturnValue("cursor");
    mockState.cursorWrite.mockResolvedValue({
      configPath: "/project/.cursor/mcp.json",
      action: "created",
    });
    mockState.installContext.mockResolvedValue({
      configPath: "/project/.cursor/rules/web3agent.mdc",
      action: "created",
    });
  });

  it("runs init flow for detected cursor host", async () => {
    const { runInit } = await import("../../src/cli/init.js");
    await runInit([]);

    expect(mockState.detectHosts).toHaveBeenCalledWith(process.cwd());
    expect(mockState.assertSingleHost).toHaveBeenCalledWith(["cursor"], undefined);
    expect(mockState.cursorWrite).toHaveBeenCalledWith({
      projectDir: process.cwd(),
      mode: "proxy",
      dryRun: false,
    });
    expect(mockState.installContext).toHaveBeenCalledWith("cursor", {
      projectDir: process.cwd(),
      mode: "proxy",
      dryRun: false,
    });

    expect(mockState.claudeWrite).not.toHaveBeenCalled();
    expect(mockState.windsurfWrite).not.toHaveBeenCalled();
    expect(mockState.opencodeWrite).not.toHaveBeenCalled();
    expect(stderrWrite).toHaveBeenCalledWith("Configuring web3agent for cursor...\n");
    expect(stderrWrite).toHaveBeenCalledWith("\nDone. Restart cursor to activate web3agent.\n");
  });

  it("uses resolved project directory and selected claude writer", async () => {
    mockState.detectHosts.mockResolvedValue({ detected: ["claude"], projectDir: "/unused" });
    mockState.assertSingleHost.mockReturnValue("claude");
    mockState.claudeWrite.mockResolvedValue({
      configPath: "/tmp/claude/.mcp.json",
      action: "updated",
    });
    mockState.installContext.mockResolvedValue({
      configPath: "/tmp/claude/CLAUDE.md",
      action: "updated",
    });

    const { runInit } = await import("../../src/cli/init.js");
    await runInit(["--project", "./fixtures/project", "--mode", "multi-server"]);

    const expectedProjectDir = resolve("./fixtures/project");
    expect(mockState.detectHosts).toHaveBeenCalledWith(expectedProjectDir);
    expect(mockState.claudeWrite).toHaveBeenCalledWith({
      projectDir: expectedProjectDir,
      mode: "multi-server",
      dryRun: false,
    });
    expect(mockState.installContext).toHaveBeenCalledWith("claude", {
      projectDir: expectedProjectDir,
      mode: "multi-server",
      dryRun: false,
    });
  });

  it("supports dry-run mode and prints dry-run completion", async () => {
    mockState.cursorWrite.mockResolvedValue({
      configPath: "/project/.cursor/mcp.json",
      action: "created",
      diff: "Would create /project/.cursor/mcp.json",
    });
    mockState.installContext.mockResolvedValue({
      configPath: "/project/.cursor/rules/web3agent.mdc",
      action: "created",
      diff: "Would create /project/.cursor/rules/web3agent.mdc",
    });

    const { runInit } = await import("../../src/cli/init.js");
    await runInit(["--dry-run"]);

    expect(mockState.cursorWrite).toHaveBeenCalledWith({
      projectDir: process.cwd(),
      mode: "proxy",
      dryRun: true,
    });
    expect(mockState.installContext).toHaveBeenCalledWith("cursor", {
      projectDir: process.cwd(),
      mode: "proxy",
      dryRun: true,
    });
    expect(stderrWrite).toHaveBeenCalledWith("[dry-run] No files will be modified\n");
    expect(stderrWrite).toHaveBeenCalledWith(
      "\n[dry-run] Complete. Re-run without --dry-run to apply changes.\n"
    );
  });

  it("propagates host detection errors", async () => {
    mockState.detectHosts.mockRejectedValue(new Error("host detection failed"));

    const { runInit } = await import("../../src/cli/init.js");

    await expect(runInit([])).rejects.toThrow("host detection failed");
    expect(mockState.assertSingleHost).not.toHaveBeenCalled();
    expect(mockState.cursorWrite).not.toHaveBeenCalled();
    expect(mockState.installContext).not.toHaveBeenCalled();
  });
});
