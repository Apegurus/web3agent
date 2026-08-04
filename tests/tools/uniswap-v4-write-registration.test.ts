import { describe, expect, it } from "vitest";

import {
  getUniswapV4ToolDefinitions,
  registerUniswapV4Executors,
} from "../../src/tools/uniswap-v4/index.js";
import { executeUniswapV4WritePlan } from "../../src/tools/uniswap-v4/write-executor.js";
import { getExecutor } from "../../src/wallet/confirmation.js";

const WRITE_TOOL_NAMES = [
  "uniswap_v4_mint_position",
  "uniswap_v4_increase_liquidity",
  "uniswap_v4_decrease_liquidity",
  "uniswap_v4_collect_fees",
  "uniswap_v4_burn_position",
] as const;

describe("Uniswap v4 write registration", () => {
  it("Given the lifecycle write surface, when listed, then exposes all five financial confirmation-gated tools", () => {
    const names = new Set<string>(WRITE_TOOL_NAMES);
    const writes = getUniswapV4ToolDefinitions().filter((tool) => names.has(tool.name));

    expect(writes.map((tool) => tool.name)).toEqual(WRITE_TOOL_NAMES);
    expect(
      writes.every(
        (tool) => tool.riskLevel === "financial" && tool.annotations?.destructiveHint === true
      )
    ).toBe(true);
  });

  it("Given a restored confirmation queue, when lifecycle executors are registered, then each tool name restores the persisted discriminator", () => {
    registerUniswapV4Executors();

    for (const toolName of WRITE_TOOL_NAMES) {
      expect(getExecutor(toolName)).toBe(executeUniswapV4WritePlan);
    }
  });
});
