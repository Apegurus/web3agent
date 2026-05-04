import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = join(process.cwd(), "tests/tmp/host-writers");

describe("config writers", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("cursor writer creates .cursor/mcp.json", async () => {
    const { CursorWriter } = await import("../../src/hosts/writers/cursor.js");
    const writer = new CursorWriter();
    const result = await writer.write({ projectDir: TEST_DIR, mode: "proxy", dryRun: false });
    expect(existsSync(join(TEST_DIR, ".cursor/mcp.json"))).toBe(true);
    expect(result.action).toBe("created");

    const content = JSON.parse(await readFile(join(TEST_DIR, ".cursor/mcp.json"), "utf-8"));
    expect(content.mcpServers.web3agent).toBeDefined();
    expect(content.mcpServers.web3agent.command).toBe("npx");
  });

  it("cursor writer merges without overwriting unrelated entries", async () => {
    await mkdir(join(TEST_DIR, ".cursor"), { recursive: true });
    const existingConfig = JSON.stringify(
      { mcpServers: { "other-server": { command: "some-cmd" } } },
      null,
      2
    );
    await writeFile(join(TEST_DIR, ".cursor/mcp.json"), existingConfig);

    const { CursorWriter } = await import("../../src/hosts/writers/cursor.js");
    const writer = new CursorWriter();
    await writer.write({ projectDir: TEST_DIR, mode: "proxy", dryRun: false });

    const content = JSON.parse(await readFile(join(TEST_DIR, ".cursor/mcp.json"), "utf-8"));
    expect(content.mcpServers["other-server"]).toBeDefined();
    expect(content.mcpServers.web3agent).toBeDefined();
  });

  it("refuses to overwrite when existing config is malformed JSON", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "web3agent-writer-malformed-"));
    const configPath = join(tmpDir, ".cursor", "mcp.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, "{ not valid json", "utf-8");

    const { CursorWriter } = await import("../../src/hosts/writers/cursor.js");
    const writer = new CursorWriter();
    await expect(
      writer.write({ projectDir: tmpDir, mode: "proxy", dryRun: false })
    ).rejects.toThrow(/malformed/i);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toBe("{ not valid json");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("refuses to overwrite when existing JSON config has a non-object top-level shape", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "web3agent-writer-wrong-shape-"));
    const configPath = join(tmpDir, ".cursor", "mcp.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, "[]", "utf-8");

    const { CursorWriter } = await import("../../src/hosts/writers/cursor.js");
    const writer = new CursorWriter();
    await expect(
      writer.write({ projectDir: tmpDir, mode: "proxy", dryRun: false })
    ).rejects.toMatchObject({ code: "HOST_CONFIG_MALFORMED" });

    const content = readFileSync(configPath, "utf-8");
    expect(content).toBe("[]");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cursor writer creates backup on update", async () => {
    await mkdir(join(TEST_DIR, ".cursor"), { recursive: true });
    await writeFile(
      join(TEST_DIR, ".cursor/mcp.json"),
      JSON.stringify({ mcpServers: {} }, null, 2)
    );

    const { CursorWriter } = await import("../../src/hosts/writers/cursor.js");
    const writer = new CursorWriter();
    const result = await writer.write({ projectDir: TEST_DIR, mode: "proxy", dryRun: false });

    expect(result.action).toBe("updated");
    expect(result.backupPath).toBeDefined();
    expect(existsSync(result.backupPath as string)).toBe(true);
  });

  it("dry-run does not modify files", async () => {
    const { CursorWriter } = await import("../../src/hosts/writers/cursor.js");
    const writer = new CursorWriter();
    const result = await writer.write({ projectDir: TEST_DIR, mode: "proxy", dryRun: true });

    expect(existsSync(join(TEST_DIR, ".cursor/mcp.json"))).toBe(false);
    expect(result.action).toBe("created");
    expect(result.diff).toBeDefined();
  });

  it("multi-server mode includes blockscout and evm entries", async () => {
    const { CursorWriter } = await import("../../src/hosts/writers/cursor.js");
    const writer = new CursorWriter();
    await writer.write({ projectDir: TEST_DIR, mode: "multi-server", dryRun: false });

    const content = JSON.parse(await readFile(join(TEST_DIR, ".cursor/mcp.json"), "utf-8"));
    expect(content.mcpServers.web3agent).toBeDefined();
    expect(content.mcpServers.blockscout).toBeDefined();
    expect(content.mcpServers.evm).toBeDefined();
  });

  it("opencode writer uses correct config shape", async () => {
    await mkdir(join(TEST_DIR, ".opencode"), { recursive: true });
    const { OpenCodeWriter } = await import("../../src/hosts/writers/opencode.js");
    const writer = new OpenCodeWriter();
    await writer.write({ projectDir: TEST_DIR, mode: "proxy", dryRun: false });

    const content = JSON.parse(await readFile(join(TEST_DIR, ".opencode/config.json"), "utf-8"));
    expect(content.mcp.web3agent).toBeDefined();
    expect(content.mcp.web3agent.type).toBe("local");
    expect(content.mcp.web3agent.command).toEqual(["npx", "web3agent"]);
  });

  it("codex writer creates .codex/config.toml", async () => {
    await mkdir(join(TEST_DIR, ".codex"), { recursive: true });
    const { CodexWriter } = await import("../../src/hosts/writers/codex.js");
    const writer = new CodexWriter();
    const result = await writer.write({ projectDir: TEST_DIR, mode: "proxy", dryRun: false });

    expect(existsSync(join(TEST_DIR, ".codex/config.toml"))).toBe(true);
    expect(result.action).toBe("created");

    const content = await readFile(join(TEST_DIR, ".codex/config.toml"), "utf-8");
    expect(content).toContain("[mcp_servers.web3agent]");
    expect(content).toContain('command = "npx"');
    expect(content).toContain('args = ["web3agent"]');
  });

  it("codex writer preserves unrelated config when updating", async () => {
    await mkdir(join(TEST_DIR, ".codex"), { recursive: true });
    await writeFile(
      join(TEST_DIR, ".codex/config.toml"),
      'model = "gpt-5.4"\n\n[mcp_servers.context7]\ncommand = "npx"\nargs = ["-y", "@upstash/context7-mcp"]\n'
    );

    const { CodexWriter } = await import("../../src/hosts/writers/codex.js");
    const writer = new CodexWriter();
    await writer.write({ projectDir: TEST_DIR, mode: "proxy", dryRun: false });

    const content = await readFile(join(TEST_DIR, ".codex/config.toml"), "utf-8");
    expect(content).toContain('model = "gpt-5.4"');
    expect(content).toContain("[mcp_servers.context7]");
    expect(content).toContain("[mcp_servers.web3agent]");
  });

  it("codex mergeManagedBlock start-anchors the end-marker (tolerates literal end-marker string in user comments)", async () => {
    const { mergeManagedBlock } = await import("../../src/hosts/writers/codex.js");
    // A literal "# web3agent:end" string appears in a user comment BEFORE
    // the actual managed block. The old indexOf(MARKER_END) would match
    // the comment, not the real block terminator, producing garbage output.
    const existing = [
      "# Note: do not use # web3agent:end inside comments",
      "",
      "[mcp_servers.user_custom]",
      'url = "https://user.example"',
      "",
      "# web3agent:start",
      "[mcp_servers.web3agent]",
      'command = "npx"',
      'args = ["web3agent"]',
      "# web3agent:end",
      "",
    ].join("\n");

    const managedBlock = [
      "# web3agent:start",
      "[mcp_servers.web3agent]",
      'command = "npx"',
      'args = ["web3agent"]',
      "# web3agent:end",
    ].join("\n");

    const merged = mergeManagedBlock(existing, managedBlock);

    expect(merged).toContain("[mcp_servers.user_custom]");
    expect(merged).toContain("# web3agent:start");
    expect(merged).toContain("[mcp_servers.web3agent]");
    // Exactly one start marker and one end marker should remain in the
    // managed block. The literal # web3agent:end in the user comment stays
    // untouched as part of the "before" slice, so total end-marker occurrences
    // is exactly 2 (one in comment text, one in managed block).
    expect((merged.match(/# web3agent:start/g) ?? []).length).toBe(1);
    expect((merged.match(/# web3agent:end/g) ?? []).length).toBe(2);
  });

  it("codex encodeTomlSection preserves boolean and finite number values", async () => {
    const { encodeTomlSection } = await import("../../src/hosts/writers/codex.js");
    const lines = encodeTomlSection("test", {
      enabled: true,
      disabled: false,
      port: 8080,
      ratio: 1.5,
      url: "https://example.com",
      items: ["a", "b"],
    });
    expect(lines).toContain("[mcp_servers.test]");
    expect(lines).toContain("enabled = true");
    expect(lines).toContain("disabled = false");
    expect(lines).toContain("port = 8080");
    expect(lines).toContain("ratio = 1.5");
    expect(lines).toContain(`url = "https://example.com"`);
    expect(lines).toContain(`items = ["a", "b"]`);
  });

  it("codex encodeTomlSection drops non-finite numbers and unsupported types with stderr warning", async () => {
    const { encodeTomlSection } = await import("../../src/hosts/writers/codex.js");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const lines = encodeTomlSection("test", {
        inf: Number.POSITIVE_INFINITY,
        nan: Number.NaN,
        nested: { deep: true },
        str: "kept",
      });
      expect(lines).toEqual(["[mcp_servers.test]", `str = "kept"`]);
      const messages = stderrSpy.mock.calls.map(([chunk]) => String(chunk)).join("");
      expect(messages).toContain("[hosts/codex]");
      expect(messages).toContain("Skipping unsupported TOML value type");
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("idempotent: second write returns unchanged", async () => {
    const { CursorWriter } = await import("../../src/hosts/writers/cursor.js");
    const writer = new CursorWriter();
    await writer.write({ projectDir: TEST_DIR, mode: "proxy", dryRun: false });
    const result = await writer.write({ projectDir: TEST_DIR, mode: "proxy", dryRun: false });
    expect(result.action).toBe("unchanged");
  });

  it("switching from multi-server to proxy removes stale managed keys", async () => {
    const { CursorWriter } = await import("../../src/hosts/writers/cursor.js");
    const writer = new CursorWriter();

    await writer.write({ projectDir: TEST_DIR, mode: "multi-server", dryRun: false });
    const afterMulti = JSON.parse(await readFile(join(TEST_DIR, ".cursor/mcp.json"), "utf-8"));
    expect(afterMulti.mcpServers.blockscout).toBeDefined();
    expect(afterMulti.mcpServers.etherscan).toBeDefined();
    expect(afterMulti.mcpServers.evm).toBeDefined();

    await writer.write({ projectDir: TEST_DIR, mode: "proxy", dryRun: false });
    const afterProxy = JSON.parse(await readFile(join(TEST_DIR, ".cursor/mcp.json"), "utf-8"));
    expect(afterProxy.mcpServers.web3agent).toBeDefined();
    expect(afterProxy.mcpServers.blockscout).toBeUndefined();
    expect(afterProxy.mcpServers.etherscan).toBeUndefined();
    expect(afterProxy.mcpServers.evm).toBeUndefined();
  });

  it("switching from multi-server to proxy preserves user-added keys", async () => {
    await mkdir(join(TEST_DIR, ".cursor"), { recursive: true });
    const existingConfig = JSON.stringify(
      {
        mcpServers: {
          "my-custom-server": { command: "custom-cmd" },
          blockscout: { type: "sse", url: "https://example.com" },
          etherscan: { type: "sse", url: "https://example.com" },
          evm: { command: "npx", args: ["-y", "@mcpdotdirect/evm-mcp-server"] },
        },
      },
      null,
      2
    );
    await writeFile(join(TEST_DIR, ".cursor/mcp.json"), existingConfig);

    const { CursorWriter } = await import("../../src/hosts/writers/cursor.js");
    const writer = new CursorWriter();
    await writer.write({ projectDir: TEST_DIR, mode: "proxy", dryRun: false });

    const content = JSON.parse(await readFile(join(TEST_DIR, ".cursor/mcp.json"), "utf-8"));
    expect(content.mcpServers["my-custom-server"]).toBeDefined();
    expect(content.mcpServers.blockscout).toBeUndefined();
    expect(content.mcpServers.etherscan).toBeUndefined();
    expect(content.mcpServers.evm).toBeUndefined();
  });
});
