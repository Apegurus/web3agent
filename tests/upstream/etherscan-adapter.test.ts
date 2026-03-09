import { beforeEach, describe, expect, it, vi } from "vitest";
import { EtherscanAdapter } from "../../src/upstream/etherscan/adapter.js";

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: "get_address_balance",
          description: "Get native balance for an address",
          inputSchema: { type: "object" },
        },
        {
          name: "get_contract_abi",
          description: "Get contract ABI",
          inputSchema: { type: "object" },
        },
        {
          name: "get_token_transfers",
          description: "Get ERC20 token transfers",
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

describe("EtherscanAdapter", () => {
  describe("with API key", () => {
    let adapter: EtherscanAdapter;

    beforeEach(async () => {
      adapter = new EtherscanAdapter("https://mock.etherscan.test/mcp", "test-api-key");
      await adapter.initialize();
    });

    it("prefixes all tools with etherscan_", () => {
      const tools = adapter.getTools();
      expect(tools.every((t) => t.name.startsWith("etherscan_"))).toBe(true);
    });

    it("exposes get_address_balance as etherscan_get_address_balance", () => {
      const tools = adapter.getTools();
      expect(tools.some((t) => t.name === "etherscan_get_address_balance")).toBe(true);
    });

    it("sets upstreamName on PrefixedTool", () => {
      const tools = adapter.getTools();
      const balanceTool = tools.find((t) => t.name === "etherscan_get_address_balance");
      expect(balanceTool?.upstreamName).toBe("get_address_balance");
      expect(balanceTool?.prefix).toBe("etherscan");
    });

    it("forwards callTool with stripped prefix", async () => {
      const result = await adapter.callTool("etherscan_get_address_balance", {
        address: "0x1",
      });
      expect(result).toBeDefined();
    });

    it("rejects callTool for unknown tool", async () => {
      await expect(adapter.callTool("etherscan_nonexistent", {})).rejects.toThrow("Unknown tool");
    });

    it("health reports ok after successful init", () => {
      const health = adapter.getHealth();
      expect(health.status).toBe("ok");
      expect(health.toolCount).toBe(3);
    });

    it("exposes correct tool count", () => {
      expect(adapter.getTools()).toHaveLength(3);
    });
  });

  describe("without API key", () => {
    let adapter: EtherscanAdapter;

    beforeEach(async () => {
      adapter = new EtherscanAdapter("https://mock.etherscan.test/mcp");
      await adapter.initialize();
    });

    it("reports not_configured health", () => {
      const health = adapter.getHealth();
      expect(health.status).toBe("not_configured");
    });

    it("exposes zero tools", () => {
      expect(adapter.getTools()).toHaveLength(0);
    });

    it("health message indicates missing API key", () => {
      const health = adapter.getHealth();
      expect(health.message).toContain("No API key");
    });
  });
});
