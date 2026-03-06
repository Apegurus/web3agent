import { describe, it, expect, vi } from "vitest";
import { BlockscoutAdapter } from "../../src/upstream/blockscout/adapter.js";

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: vi.fn().mockImplementation(() => ({
		connect: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
		listTools: vi.fn(),
		callTool: vi.fn(),
		close: vi.fn().mockResolvedValue(undefined),
	})),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
	StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
	SSEClientTransport: vi.fn().mockImplementation(() => ({})),
}));

describe("BlockscoutAdapter — degraded", () => {
	it("marks degraded when endpoint unreachable", async () => {
		const adapter = new BlockscoutAdapter("https://127.0.0.1:9/mcp");
		await adapter.initialize();
		expect(adapter.getHealth().status).toBe("degraded");
	});

	it("exposes zero tools when degraded", async () => {
		const adapter = new BlockscoutAdapter("https://127.0.0.1:9/mcp");
		await adapter.initialize();
		expect(adapter.getTools()).toHaveLength(0);
	});

	it("does not throw during initialize", async () => {
		const adapter = new BlockscoutAdapter("https://127.0.0.1:9/mcp");
		await expect(adapter.initialize()).resolves.toBeUndefined();
	});

	it("health message mentions connection failure", async () => {
		const adapter = new BlockscoutAdapter("https://127.0.0.1:9/mcp");
		await adapter.initialize();
		expect(adapter.getHealth().message).toContain("Failed to connect");
	});
});
