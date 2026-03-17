import { beforeEach, describe, expect, it } from "vitest";
import type { BlockscoutClient } from "../../../src/api/explorer/blockscout/client.js";
import type { EtherscanClient } from "../../../src/api/explorer/etherscan/client.js";
import type { ExplorerRouter } from "../../../src/api/explorer/router.js";
import {
  type ExplorerDeps,
  getExplorerToolDefinitions,
} from "../../../src/tools/explorer/index.js";

function findTool(name: string, list: ReturnType<typeof getExplorerToolDefinitions>) {
  const tool = list.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

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
    const tool = findTool("explorer_get_address_info", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_tx_history rejects invalid input", async () => {
    const tool = findTool("explorer_get_tx_history", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_block rejects invalid input", async () => {
    const tool = findTool("explorer_get_block", tools);
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
