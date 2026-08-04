import { describe, expect, it } from "vitest";

import { getUniswapV4ToolDefinitions } from "../../src/tools/uniswap-v4/index.js";

describe("Uniswap v4 MCP tools", () => {
  it("Given the lifecycle surface, when listed, then publishes ordered read, simulation, and confirmation-gated write tools", () => {
    const tools = getUniswapV4ToolDefinitions();

    expect(tools.map((tool) => tool.name)).toEqual([
      "uniswap_v4_get_deployment",
      "uniswap_v4_get_pool",
      "uniswap_v4_get_position",
      "uniswap_v4_get_events",
      "uniswap_v4_calculate_position",
      "uniswap_v4_calculate",
      "uniswap_v4_simulate_operation",
      "uniswap_v4_mint_position",
      "uniswap_v4_increase_liquidity",
      "uniswap_v4_decrease_liquidity",
      "uniswap_v4_collect_fees",
      "uniswap_v4_burn_position",
    ]);
    const reads = tools.slice(0, 7);
    const writes = tools.slice(7);
    expect(reads.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(reads.every((tool) => tool.annotations?.destructiveHint === false)).toBe(true);
    expect(reads.every((tool) => tool.annotations?.idempotentHint === true)).toBe(true);
    expect(writes.every((tool) => tool.annotations?.readOnlyHint === false)).toBe(true);
    expect(writes.every((tool) => tool.annotations?.destructiveHint === true)).toBe(true);
    expect(writes.every((tool) => tool.riskLevel === "financial")).toBe(true);
  });

  it("Given a malformed event cursor, when invoked through the MCP handler, then returns the shared error envelope", async () => {
    const eventsTool = getUniswapV4ToolDefinitions().find(
      (tool) => tool.name === "uniswap_v4_get_events"
    );
    expect(eventsTool).toBeDefined();

    const result = await eventsTool?.handler({
      chainId: 4663,
      endBlock: "1",
      pageSize: 1,
      scope: "position",
      startBlock: "1",
      tokenId: "1",
      cursor: "malformed",
    });

    expect(result?.structuredContent).toMatchObject({
      ok: false,
      error: { code: "INVALID_PARAMS" },
    });
  });
});
