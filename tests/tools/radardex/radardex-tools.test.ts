import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerExecutor: vi.fn(),
}));

vi.mock("../../../src/wallet/persistence.js", () => ({
  getWalletState: vi.fn().mockReturnValue({
    mode: "private-key",
    address: "0x9999999999999999999999999999999999999999",
    chainId: 5042,
  }),
}));

vi.mock("../../../src/wallet/confirmation.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../src/wallet/confirmation.js")>();
  return {
    ...real,
    confirmationQueue: new real.ConfirmationQueueManager(true),
    registerExecutor: mocks.registerExecutor,
  };
});

const FROM_TOKEN = "0x1111111111111111111111111111111111111111";
const TO_TOKEN = "0x2222222222222222222222222222222222222222";
const SPENDER = "0x3333333333333333333333333333333333333333";

const route = {
  id: "v3-direct-500",
  family: "v3_direct" as const,
  label: "V3 direct 500",
  fromToken: FROM_TOKEN,
  toToken: TO_TOKEN,
  grossInput: 1_000_000n,
  netInput: 997_000n,
  expectedOutput: 995_000n,
  spender: SPENDER,
  feeBps: 30,
  executable: true as const,
  path: [FROM_TOKEN, TO_TOKEN],
  gasEstimate: 120_000n,
  execution: { kind: "v3_direct" as const, poolFee: 500 },
};

function payload(result: CallToolResult): unknown {
  return result.structuredContent;
}

describe("RadarDEX MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("discovers the four public RadarDEX tools", async () => {
    // Given: a RadarDEX adapter with deterministic in-memory dependencies.
    const { getRadarDexToolDefinitions } = await import("../../../src/tools/radardex/index.js");

    // When: the tool catalog is built.
    const tools = getRadarDexToolDefinitions({
      listTokens: vi.fn().mockResolvedValue([]),
      getQuote: vi.fn(),
      getRouteHealth: vi.fn().mockResolvedValue([]),
      executeSwap: vi.fn(),
    });

    // Then: only the requested public names are exposed.
    expect(tools.map(({ name }) => name)).toEqual([
      "radardex_list_tokens",
      "radardex_get_quote",
      "radardex_get_route_health",
      "radardex_swap",
    ]);
  });

  it("serializes quote bigint fields as decimal strings", async () => {
    // Given: the provider returns a bigint-heavy route.
    const { getRadarDexToolDefinitions } = await import("../../../src/tools/radardex/index.js");
    const tools = getRadarDexToolDefinitions({
      listTokens: vi.fn().mockResolvedValue([]),
      getQuote: vi.fn().mockResolvedValue({
        request: {
          chainId: 5042,
          fromToken: FROM_TOKEN,
          toToken: TO_TOKEN,
          fromAmount: "1000000",
          slippageBps: 50,
        },
        routes: [route],
        best: route,
        health: [{ venue: "v3:direct", available: true }],
      }),
      getRouteHealth: vi.fn().mockResolvedValue([]),
      executeSwap: vi.fn(),
    });
    const quoteTool = tools.find(({ name }) => name === "radardex_get_quote");
    if (!quoteTool) throw new Error("RadarDEX quote tool missing");

    // When: the quote handler formats its MCP response.
    const result = await quoteTool.handler({
      chainId: 5042,
      fromToken: FROM_TOKEN,
      toToken: TO_TOKEN,
      fromAmount: "1000000",
      slippageBps: 50,
    });

    // Then: every amount that crossed the JSON boundary is a decimal string.
    expect(payload(result)).toEqual({
      ok: true,
      data: {
        request: {
          chainId: 5042,
          fromToken: FROM_TOKEN,
          toToken: TO_TOKEN,
          fromAmount: "1000000",
          slippageBps: 50,
        },
        routes: [
          {
            ...route,
            grossInput: "1000000",
            netInput: "997000",
            expectedOutput: "995000",
            gasEstimate: "120000",
          },
        ],
        best: {
          ...route,
          grossInput: "1000000",
          netInput: "997000",
          expectedOutput: "995000",
          gasEstimate: "120000",
        },
        health: [{ venue: "v3:direct", available: true }],
      },
    });
    expect(() => JSON.stringify(result.structuredContent)).not.toThrow();
  });

  it("returns typed token discovery and route-health result shapes", async () => {
    // Given: RadarDEX metadata and health probes return valid Arc records.
    const { getRadarDexToolDefinitions } = await import("../../../src/tools/radardex/index.js");
    const tools = getRadarDexToolDefinitions({
      listTokens: vi
        .fn()
        .mockResolvedValue([
          { address: FROM_TOKEN, symbol: "AAA", name: "Token AAA", decimals: 18 },
        ]),
      getQuote: vi.fn(),
      getRouteHealth: vi
        .fn()
        .mockResolvedValue([{ venue: "v4:native", available: true, feeBps: 30 }]),
      executeSwap: vi.fn(),
    });
    const listTool = tools.find(({ name }) => name === "radardex_list_tokens");
    const healthTool = tools.find(({ name }) => name === "radardex_get_route_health");
    if (!listTool || !healthTool) throw new Error("RadarDEX read tools missing");

    // When: both read handlers are invoked for Arc.
    const tokenResult = await listTool.handler({ chainId: 5042 });
    const healthResult = await healthTool.handler({ chainId: 5042 });

    // Then: each result carries its Arc chain context and typed records.
    expect(payload(tokenResult)).toEqual({
      ok: true,
      data: {
        chainId: 5042,
        tokens: [{ address: FROM_TOKEN, symbol: "AAA", name: "Token AAA", decimals: 18 }],
      },
    });
    expect(payload(healthResult)).toEqual({
      ok: true,
      data: {
        chainId: 5042,
        venues: [{ venue: "v4:native", available: true, feeBps: 30 }],
      },
    });
  });

  it("queues swaps through the confirmation manager", async () => {
    // Given: confirmations are enabled and an active Arc wallet exists.
    const { getRadarDexToolDefinitions } = await import("../../../src/tools/radardex/index.js");
    const executeSwap = vi.fn();
    const tools = getRadarDexToolDefinitions({
      listTokens: vi.fn().mockResolvedValue([]),
      getQuote: vi.fn(),
      getRouteHealth: vi.fn().mockResolvedValue([]),
      executeSwap,
    });
    const swapTool = tools.find(({ name }) => name === "radardex_swap");
    if (!swapTool) throw new Error("RadarDEX swap tool missing");

    // When: a valid swap is requested.
    const result = await swapTool.handler({
      chainId: 5042,
      fromToken: FROM_TOKEN,
      toToken: TO_TOKEN,
      fromAmount: "1000000",
      slippageBps: 50,
    });

    // Then: execution pauses for confirmation instead of submitting a transaction.
    expect(payload(result)).toMatchObject({
      ok: true,
      data: { status: "pending_confirmation" },
    });
    expect(executeSwap).not.toHaveBeenCalled();
  });

  it("registers the persisted swap executor", async () => {
    // Given: the RadarDEX executor registry is empty.
    const { registerRadarDexExecutors } = await import("../../../src/tools/radardex/index.js");

    // When: RadarDEX executors are registered during startup.
    registerRadarDexExecutors();

    // Then: restored radardex_swap operations have an executor.
    expect(mocks.registerExecutor).toHaveBeenCalledWith("radardex_swap", expect.any(Function));
  });
});
