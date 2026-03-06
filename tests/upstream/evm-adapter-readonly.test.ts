import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: "get_balance",
          description: "Get balance",
          inputSchema: { type: "object" },
        },
        {
          name: "get_block_number",
          description: "Get block",
          inputSchema: { type: "object" },
        },
      ],
    }),
    callTool: vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "ok" }] }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    process: { pid: 12345, kill: vi.fn() },
  })),
}));

describe("EvmAdapter — read-only", () => {
  it("starts cleanly without wallet credentials", async () => {
    const { EvmAdapter } = await import("../../src/upstream/evm/adapter.js");
    const adapter = new EvmAdapter();
    await adapter.initialize();
    expect(adapter.getHealth().status).toBe("ok");
  });

  it("prefixes tools with evm_", async () => {
    const { EvmAdapter } = await import("../../src/upstream/evm/adapter.js");
    const adapter = new EvmAdapter();
    await adapter.initialize();
    const tools = adapter.getTools();
    expect(tools.every((t) => t.name.startsWith("evm_"))).toBe(true);
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("evm_get_balance");
    expect(tools[1].name).toBe("evm_get_block_number");
  });

  it("preserves upstreamName and prefix on tools", async () => {
    const { EvmAdapter } = await import("../../src/upstream/evm/adapter.js");
    const adapter = new EvmAdapter();
    await adapter.initialize();
    const tools = adapter.getTools();
    expect(tools[0].upstreamName).toBe("get_balance");
    expect(tools[0].prefix).toBe("evm");
  });

  it("reports health with toolCount and pid", async () => {
    const { EvmAdapter } = await import("../../src/upstream/evm/adapter.js");
    const adapter = new EvmAdapter();
    await adapter.initialize();
    const health = adapter.getHealth();
    expect(health.toolCount).toBe(2);
    expect(health.pid).toBe(12345);
    expect(health.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it("degrades gracefully when subprocess fails", async () => {
    vi.mocked(Client).mockImplementationOnce(
      () =>
        ({
          connect: vi.fn().mockRejectedValue(new Error("spawn ENOENT")),
          listTools: vi.fn(),
          callTool: vi.fn(),
          close: vi.fn().mockResolvedValue(undefined),
        }) as unknown as Client,
    );
    const { EvmAdapter } = await import("../../src/upstream/evm/adapter.js");
    const adapter = new EvmAdapter();
    await adapter.initialize();
    expect(adapter.getHealth().status).toBe("degraded");
    expect(adapter.getTools()).toHaveLength(0);
  });
});
