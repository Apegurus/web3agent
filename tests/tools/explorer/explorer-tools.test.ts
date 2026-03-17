import { describe, expect, it, beforeEach } from "vitest";
import type { ExplorerRouter } from "../../../src/api/explorer/router.js";
import type { BlockscoutClient } from "../../../src/api/explorer/blockscout/client.js";
import type { EtherscanClient } from "../../../src/api/explorer/etherscan/client.js";
import { getExplorerToolDefinitions, type ExplorerDeps } from "../../../src/tools/explorer/index.js";

function createMockDeps(): ExplorerDeps {
  const router = {
    resolve: () => "blockscout" as const,
    getFallback: () => undefined,
    isChainSupported: () => true,
  } as unknown as ExplorerRouter;

  const blockscout = {} as unknown as BlockscoutClient;
  const etherscan = undefined;

  return { router, blockscout, etherscan };
}

describe("explorer tools", () => {
  let tools: ReturnType<typeof getExplorerToolDefinitions>;

  beforeEach(() => {
    tools = getExplorerToolDefinitions(createMockDeps());
  });

  it("registers 10 tools", () => {
    expect(tools).toHaveLength(10);
  });

  it("all tools have category explorer", () => {
    for (const tool of tools) {
      expect(tool.category).toBe("explorer");
    }
  });

  it("all tools have readOnlyHint annotation", () => {
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  it("all tools have inputSchema from zodToJsonSchema", () => {
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("explorer_get_address_info rejects invalid input", async () => {
    const tool = tools.find((t) => t.name === "explorer_get_address_info")!;
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_tx_history rejects invalid input", async () => {
    const tool = tools.find((t) => t.name === "explorer_get_tx_history")!;
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_block rejects invalid input", async () => {
    const tool = tools.find((t) => t.name === "explorer_get_block")!;
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("all tools have unique names", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all tool names start with explorer_", () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^explorer_/);
    }
  });
});
