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

  it("registers 35 tools", () => {
    expect(tools).toHaveLength(35);
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

  it("explorer_get_historical_balance rejects invalid input", async () => {
    const tool = findTool("explorer_get_historical_balance", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_historical_token_balance rejects invalid input", async () => {
    const tool = findTool("explorer_get_historical_token_balance", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_address_funded_by rejects invalid input", async () => {
    const tool = findTool("explorer_get_address_funded_by", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_internal_txs rejects invalid input", async () => {
    const tool = findTool("explorer_get_internal_txs", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_tx_execution_status rejects invalid input", async () => {
    const tool = findTool("explorer_get_tx_execution_status", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_nft_transfers rejects invalid input", async () => {
    const tool = findTool("explorer_get_nft_transfers", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_token_info rejects invalid input", async () => {
    const tool = findTool("explorer_get_token_info", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_token_supply rejects invalid input", async () => {
    const tool = findTool("explorer_get_token_supply", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_token_holders rejects invalid input", async () => {
    const tool = findTool("explorer_get_token_holders", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_top_token_holders rejects invalid input", async () => {
    const tool = findTool("explorer_get_top_token_holders", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_block_by_timestamp rejects invalid input", async () => {
    const tool = findTool("explorer_get_block_by_timestamp", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_block_rewards rejects invalid input", async () => {
    const tool = findTool("explorer_get_block_rewards", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_blocks_by_validator rejects invalid input", async () => {
    const tool = findTool("explorer_get_blocks_by_validator", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_contract_creator rejects invalid input", async () => {
    const tool = findTool("explorer_get_contract_creator", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it("explorer_get_contract_code rejects invalid input", async () => {
    const tool = findTool("explorer_get_contract_code", tools);
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});
