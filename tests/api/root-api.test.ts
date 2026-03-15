import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  invokeTool: vi.fn(),
}));

vi.mock("../../src/runtime/default.js", () => ({
  getDefaultRuntime: vi.fn().mockResolvedValue({
    invokeTool: (...args: unknown[]) => runtimeMocks.invokeTool(...args),
  }),
}));

describe("root API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getSwapQuote wraps same-chain quotes from the runtime", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce({
      isError: false,
      structuredContent: {
        ok: true,
        data: {
          outAmount: "100",
          minAmountOut: "95",
        },
      },
      content: [{ type: "text", text: '{\n  "outAmount": "100",\n  "minAmountOut": "95"\n}' }],
    });

    const { getSwapQuote } = await import("../../src/api/swaps.js");
    const result = await getSwapQuote({
      chainId: 8453,
      fromToken: "0x1111",
      toToken: "0x2222",
      fromAmount: "1000",
    });

    expect(result).toEqual({
      kind: "same-chain",
      provider: "orbs",
      chainId: 8453,
      quote: {
        outAmount: "100",
        minAmountOut: "95",
      },
    });
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("orbs_get_quote", {
      chainId: 8453,
      fromToken: "0x1111",
      toToken: "0x2222",
      fromAmount: "1000",
    });
  });

  it("executeBridge throws Web3AgentError on runtime errors", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: "BRIDGE_ERROR",
          message: "route unavailable",
        },
      },
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "BRIDGE_ERROR", message: "route unavailable" }),
        },
      ],
    });

    const { executeBridge } = await import("../../src/api/swaps.js");

    await expect(
      executeBridge({
        fromChainId: 1,
        toChainId: 8453,
        fromTokenAddress: "0x1111",
        toTokenAddress: "0x2222",
        fromAmount: "1000",
      })
    ).rejects.toMatchObject({
      name: "Web3AgentError",
      code: "BRIDGE_ERROR",
      message: "route unavailable",
    });
  });

  it("resolveCanonicalToken throws a helpful error for non-canonical tokens", async () => {
    const { resolveCanonicalToken } = await import("../../src/api/tokens.js");

    await expect(
      resolveCanonicalToken({
        symbol: "ZZZZNOTREAL",
        chainId: 1,
      })
    ).rejects.toMatchObject({
      name: "Web3AgentError",
      code: "TOKEN_NOT_FOUND",
    });
  });

  it("placeLimitOrder preserves pending confirmation results", async () => {
    runtimeMocks.invokeTool.mockResolvedValueOnce({
      isError: false,
      structuredContent: {
        ok: true,
        data: {
          status: "pending_confirmation",
          id: "order-123",
          summary: "Queued order",
        },
      },
      content: [
        {
          type: "text",
          text: '{"status":"pending_confirmation","id":"order-123","summary":"Queued order"}',
        },
      ],
    });

    const { placeLimitOrder } = await import("../../src/api/orders.js");
    const result = await placeLimitOrder({
      chainId: 8453,
      fromToken: "0x1111",
      toToken: "0x2222",
      fromAmount: "1000",
      toMinAmount: "900",
    });

    expect(result).toEqual({
      status: "pending_confirmation",
      id: "order-123",
      summary: "Queued order",
    });
  });

  it("root index re-exports browser wallet helpers", async () => {
    const root = await import("../../src/index.js");

    expect(typeof root.prepareSwapIntent).toBe("function");
    expect(typeof root.prepareOperation).toBe("function");
    expect(typeof root.getRequiredApprovals).toBe("function");
    expect(typeof root.prepareTwapIntent).toBe("function");
    expect(typeof root.prepareLimitIntent).toBe("function");
    expect(typeof root.prepareBridgeIntent).toBe("function");
    expect(typeof root.resumeOperation).toBe("function");
    expect(typeof root.parseEnv).toBe("function");
    expect(typeof root.resetConfig).toBe("function");
    expect(typeof root.setConfig).toBe("function");
    expect(typeof root.pollSwapStatus).toBe("function");
    expect(typeof root.submitSignedSwap).toBe("function");
    expect(typeof root.submitSignedTwapOrder).toBe("function");
    expect(typeof root.simulateTransaction).toBe("function");
    expect(root.orbsPrepareSwapIntentSchema).toBeDefined();
    expect(root.lifiPrepareBridgeIntentSchema).toBeDefined();
    expect(root.prepareOperationSchema).toBeDefined();
    expect(root.resumeOperationSchema).toBeDefined();
    expect(root.transactionSimulateSchema).toBeDefined();
  });
});
