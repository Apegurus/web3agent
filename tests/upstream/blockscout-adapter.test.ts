import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlockscoutAdapter } from "../../src/upstream/blockscout/adapter.js";

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: "__unlock_blockchain_analysis__",
          description: "Bootstrap",
          inputSchema: { type: "object" },
        },
        {
          name: "get_address_info",
          description: "Get address info",
          inputSchema: { type: "object" },
        },
        {
          name: "get_block_number",
          description: "Get block number",
          inputSchema: { type: "object" },
        },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: vi.fn().mockImplementation(() => ({})),
}));

describe("BlockscoutAdapter", () => {
  let adapter: BlockscoutAdapter;

  beforeEach(async () => {
    adapter = new BlockscoutAdapter("https://mock.blockscout.test/mcp");
    await adapter.initialize();
  });

  it("prefixes all tools with blockscout_", () => {
    const tools = adapter.getTools();
    expect(tools.every((t) => t.name.startsWith("blockscout_"))).toBe(true);
  });

  it("filters out __unlock_blockchain_analysis__", () => {
    const tools = adapter.getTools();
    expect(tools.some((t) => t.name.includes("unlock_blockchain_analysis"))).toBe(false);
  });

  it("exposes get_address_info as blockscout_get_address_info", () => {
    const tools = adapter.getTools();
    expect(tools.some((t) => t.name === "blockscout_get_address_info")).toBe(true);
  });

  it("sets upstreamName on PrefixedTool", () => {
    const tools = adapter.getTools();
    const addrTool = tools.find((t) => t.name === "blockscout_get_address_info");
    expect(addrTool?.upstreamName).toBe("get_address_info");
    expect(addrTool?.prefix).toBe("blockscout");
  });

  it("forwards callTool with stripped prefix", async () => {
    const result = await adapter.callTool("blockscout_get_address_info", {
      address: "0x1",
    });
    expect(result).toBeDefined();
  });

  it("rejects callTool for unknown tool", async () => {
    await expect(adapter.callTool("blockscout_nonexistent", {})).rejects.toThrow("Unknown tool");
  });

  it("health reports ok after successful init", () => {
    const health = adapter.getHealth();
    expect(health.status).toBe("ok");
    expect(health.toolCount).toBe(2);
  });

  it("exposes correct tool count", () => {
    expect(adapter.getTools()).toHaveLength(2);
  });
});
