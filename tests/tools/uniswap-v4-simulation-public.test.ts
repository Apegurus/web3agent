import { describe, expect, it, vi } from "vitest";

const simulation = vi.hoisted(() => ({
  simulate: vi.fn(),
}));
const planner = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

vi.mock("../../src/api/simulation.js", () => ({
  simulateTransaction: (...args: unknown[]) => simulation.simulate(...args),
}));
vi.mock("../../src/tools/uniswap-v4/write-planner.js", () => ({
  prepareExternalUniswapV4WritePlan: (...args: unknown[]) => planner.prepare(...args),
}));

import { getUniswapV4ToolDefinitions } from "../../src/tools/uniswap-v4/index.js";

const SOURCE_BLOCK = {
  blockHash: `0x${"aa".repeat(32)}`,
  blockNumber: "16437583",
  chainId: 4663,
};
const INPUT = {
  operation: {
    account: "0x1111111111111111111111111111111111111111",
    amount0Max: "100",
    amount1Max: "100",
    chainId: 4663,
    createPool: false,
    deadline: "4102444800",
    hookData: "0x",
    kind: "mint" as const,
    liquidity: "10",
    poolKey: {
      currency0: {
        chainId: 4663,
        decimals: 18,
        kind: "native" as const,
        name: "Ether",
        symbol: "ETH",
      },
      currency1: {
        address: "0x2222222222222222222222222222222222222222",
        chainId: 4663,
        decimals: 18,
        kind: "erc20" as const,
        name: "Fixture token",
        symbol: "FIX",
      },
      fee: 500,
      hooks: "0x0000000000000000000000000000000000000000",
      tickSpacing: 60,
    },
    slippageBps: 0,
    sourceBlock: SOURCE_BLOCK,
    tickLower: -120,
    tickUpper: 120,
  },
  sourceBlock: SOURCE_BLOCK,
};

const PLAN = {
  actions: [
    {
      data: "0x095ea7b3",
      kind: "erc20Approval" as const,
      to: "0x2222222222222222222222222222222222222222",
      value: "0",
    },
    {
      data: "0x1234",
      kind: "positionManager" as const,
      to: "0x3333333333333333333333333333333333333333",
      value: "0",
    },
  ],
  expectedDeltas: {
    kind: "mint" as const,
    liquidityDelta: "10",
    nativeValueDelta: "0",
    token0Delta: "-1",
    token1Delta: "-1",
  },
  operation: INPUT.operation,
  sourceBlock: SOURCE_BLOCK,
};

function simulationTool(options?: Parameters<typeof getUniswapV4ToolDefinitions>[0]) {
  const tool = getUniswapV4ToolDefinitions(options).find(
    (definition) => definition.name === "uniswap_v4_simulate_operation"
  );
  if (tool === undefined) throw new Error("Expected Uniswap v4 simulation MCP tool");
  return tool;
}

describe("Uniswap v4 public simulation backends", () => {
  it("Given the default stateless backend, when the MCP simulation includes a prerequisite approval, then it returns an honest blocked-by-prerequisite result", async () => {
    planner.prepare.mockResolvedValueOnce(PLAN);
    simulation.simulate.mockResolvedValue({
      balanceChanges: [],
      balanceChangesSource: "fallback",
      gasEstimate: "52000",
      success: true,
    });

    const result = await simulationTool().handler(INPUT);

    expect(result.structuredContent).toMatchObject({
      data: {
        stages: [
          { id: "uniswap-v4:mint:0", status: "succeeded" },
          {
            blockedBy: "uniswap-v4:mint:0",
            id: "uniswap-v4:mint:1",
            status: "blocked_by_prerequisite",
          },
        ],
        success: false,
      },
      ok: true,
    });
  });

  it("Given a stateful runtime backend, when the public MCP simulation applies each prerequisite, then it executes the PositionManager stage", async () => {
    planner.prepare.mockResolvedValueOnce(PLAN);
    const applied: string[] = [];
    const result = await simulationTool({
      simulationBackend: {
        applyPriorStage: async ({ stage }) => {
          applied.push(stage.id);
          return true;
        },
        simulate: async () => ({
          balanceChanges: [],
          balanceChangesSource: "trace",
          gasEstimate: "52000",
          success: true,
        }),
      },
    }).handler(INPUT);

    expect(result.structuredContent).toMatchObject({
      data: {
        stages: [
          { id: "uniswap-v4:mint:0", status: "succeeded" },
          { id: "uniswap-v4:mint:1", status: "succeeded" },
        ],
        success: true,
      },
      ok: true,
    });
    expect(applied).toEqual(["uniswap-v4:mint:0"]);
  });
});
