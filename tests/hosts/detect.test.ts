import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertSingleHost, detectHosts } from "../../src/hosts/detect.js";

const FIXTURES = join(process.cwd(), "tests/fixtures/hosts");

describe("host detection", () => {
  it("detects claude from .claude directory at home level", async () => {
    const result = await detectHosts(FIXTURES, join(FIXTURES, "claude-project"));
    expect(result.detected).toContain("claude");
  });

  it("detects openclaw from .openclaw directory at home level", async () => {
    const result = await detectHosts(FIXTURES, join(FIXTURES, "openclaw-project"));
    expect(result.detected).toContain("openclaw");
  });

  it("detects cursor from .cursor directory", async () => {
    const result = await detectHosts(join(FIXTURES, "cursor-project"), "/nonexistent-home");
    expect(result.detected).toContain("cursor");
  });

  it("detects codex from .codex directory", async () => {
    const result = await detectHosts(join(FIXTURES, "codex-project"), "/nonexistent-home");
    expect(result.detected).toContain("codex");
  });

  it("detects windsurf from .windsurf directory", async () => {
    const result = await detectHosts(join(FIXTURES, "windsurf-project"), "/nonexistent-home");
    expect(result.detected).toContain("windsurf");
  });

  it("detects opencode from .opencode directory", async () => {
    const result = await detectHosts(join(FIXTURES, "opencode-project"), "/nonexistent-home");
    expect(result.detected).toContain("opencode");
  });

  it("detects multiple hosts in multi-host-project", async () => {
    const result = await detectHosts(join(FIXTURES, "multi-host-project"), "/nonexistent-home");
    expect(result.detected.length).toBeGreaterThan(1);
    expect(result.detected).toContain("cursor");
    expect(result.detected).toContain("opencode");
  });

  it("returns empty when no markers present", async () => {
    const result = await detectHosts(join(FIXTURES), "/nonexistent-home");
    expect(result.detected).toHaveLength(0);
  });
});

describe("assertSingleHost", () => {
  it("returns explicit host when provided", () => {
    expect(assertSingleHost([], "claude")).toBe("claude");
  });

  it("throws on unsupported explicit host", () => {
    expect(() => assertSingleHost([], "vscode")).toThrow("Unsupported host");
  });

  it("returns openclaw when explicitly selected", () => {
    expect(assertSingleHost([], "openclaw")).toBe("openclaw");
  });

  it("returns codex when explicitly selected", () => {
    expect(assertSingleHost([], "codex")).toBe("codex");
  });

  it("returns single detected host", () => {
    expect(assertSingleHost(["cursor"])).toBe("cursor");
  });

  it("throws on zero detected hosts", () => {
    expect(() => assertSingleHost([])).toThrow("No supported agent host detected");
  });

  it("throws on multiple detected hosts without explicit", () => {
    expect(() => assertSingleHost(["cursor", "opencode"])).toThrow("Multiple agent hosts detected");
  });
});
