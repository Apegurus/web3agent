import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({ invokeTool: vi.fn() }));
const simulationMocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  simulate: vi.fn(),
}));

vi.mock("../../src/runtime/default.js", () => ({
  getDefaultRuntime: vi.fn().mockResolvedValue({
    invokeTool: (...args: unknown[]) => runtimeMocks.invokeTool(...args),
  }),
}));
vi.mock("../../src/api/simulation.js", () => ({
  simulateTransaction: (...args: unknown[]) => simulationMocks.simulate(...args),
}));
vi.mock("../../src/tools/uniswap-v4/write-planner.js", () => ({
  prepareExternalUniswapV4WritePlan: (...args: unknown[]) => simulationMocks.prepare(...args),
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
    chainId: 4663,
    deadline: "4102444800",
    hookData: "0x",
    kind: "collect" as const,
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
    recipient: "0x1111111111111111111111111111111111111111",
    slippageBps: 0,
    sourceBlock: SOURCE_BLOCK,
    tokenId: "1",
  },
  sourceBlock: SOURCE_BLOCK,
};

const STATEFUL_INPUT = {
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
    poolKey: INPUT.operation.poolKey,
    slippageBps: 0,
    sourceBlock: SOURCE_BLOCK,
    tickLower: -120,
    tickUpper: 120,
  },
  sourceBlock: SOURCE_BLOCK,
};
const STATEFUL_PLAN = {
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
  operation: STATEFUL_INPUT.operation,
  sourceBlock: SOURCE_BLOCK,
};

describe("simulateUniswapV4Operation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given a valid lifecycle simulation request, when called through the SDK, then invokes the exact MCP tool with its pinned source block", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce({
      content: [],
      isError: false,
      structuredContent: {
        data: { sourceBlock: SOURCE_BLOCK, stages: [], success: false },
        ok: true,
      },
    });
    const { simulateUniswapV4Operation } = await import("../../src/api/uniswap-v4.js");

    await simulateUniswapV4Operation(INPUT);

    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("uniswap_v4_simulate_operation", INPUT);
  });

  it("Given a runtime-built stateful MCP backend, when the root SDK simulates a lifecycle, then it executes each prerequisite before PositionManager", async () => {
    simulationMocks.prepare.mockResolvedValueOnce(STATEFUL_PLAN);
    simulationMocks.simulate.mockResolvedValue({
      balanceChanges: [],
      balanceChangesSource: "fallback",
      gasEstimate: "52000",
      success: true,
    });
    const applied: string[] = [];
    const tool = getUniswapV4ToolDefinitions({
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
    }).find((definition) => definition.name === "uniswap_v4_simulate_operation");
    if (tool === undefined) throw new Error("Expected Uniswap v4 simulation tool");
    runtimeMocks.invokeTool.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name !== "uniswap_v4_simulate_operation") throw new Error("Unexpected tool invocation");
      return tool.handler(args);
    });
    const { simulateUniswapV4Operation } = await import("../../src/index.js");

    const result = await simulateUniswapV4Operation(STATEFUL_INPUT);

    expect(result).toMatchObject({
      stages: [
        { id: "uniswap-v4:mint:0", status: "succeeded" },
        { id: "uniswap-v4:mint:1", status: "succeeded" },
      ],
      success: true,
    });
    expect(applied).toEqual(["uniswap-v4:mint:0"]);
  });
});
