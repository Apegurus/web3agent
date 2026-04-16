import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
