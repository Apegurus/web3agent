import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRuntime: vi.fn(),
  invokeAndRequireData: vi.fn(),
  getConfig: vi.fn(),
  parseInput: vi.fn(),
  getWalletState: vi.fn(),
  readAuditLog: vi.fn(),
  confirmationQueue: {
    list: vi.fn(),
  },
}));

vi.mock("../../src/api/shared.js", () => ({
  getRuntime: mocks.getRuntime,
  invokeAndRequireData: mocks.invokeAndRequireData,
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("../../src/api/validation.js", () => ({
  parseInput: mocks.parseInput,
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: mocks.getWalletState,
}));

vi.mock("../../src/wallet/audit.js", () => ({
  readAuditLog: mocks.readAuditLog,
}));

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: mocks.confirmationQueue,
}));

import {
  executeBridge,
  executeRadarDexSwap,
  executeSameChainSwap,
  getRadarDexQuote,
  getRadarDexRouteHealth,
  getSwapHistory,
  getSwapQuote,
  isTokenSwappable,
  listRadarDexTokens,
} from "../../src/api/swaps.js";

describe("api/swaps", () => {
  const runtime = { invokeTool: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRuntime.mockResolvedValue(runtime);
    mocks.getConfig.mockReturnValue({ chainId: 8453 });
    mocks.getWalletState.mockReturnValue({ address: "0x1234567890123456789012345678901234567890" });
    mocks.readAuditLog.mockResolvedValue([]);
    mocks.confirmationQueue.list.mockReturnValue([]);
    mocks.parseInput.mockImplementation((_schema: unknown, input: unknown) => input);
  });

  it("getSwapQuote uses lifi_get_quote for cross-chain params", async () => {
    const params = {
      fromChainId: 1,
      toChainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    const quote = { routeId: "route-1" };
    mocks.invokeAndRequireData.mockResolvedValue(quote);

    const result = await getSwapQuote(params as never);

    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "lifi_get_quote", params);
    expect(result).toEqual({
      kind: "cross-chain",
      provider: "lifi",
      quote,
    });
  });

  it("getSwapQuote uses orbs_get_quote for same-chain params", async () => {
    const params = {
      chainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    const quote = { outAmount: "95" };
    mocks.invokeAndRequireData.mockResolvedValue(quote);

    const result = await getSwapQuote(params as never);

    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "orbs_get_quote", params);
    expect(result).toEqual({
      kind: "same-chain",
      provider: "orbs",
      chainId: 8453,
      quote,
    });
  });

  it("isTokenSwappable returns swappable=true when quote succeeds", async () => {
    mocks.invokeAndRequireData.mockResolvedValue({ quote: "ok" });

    const result = await isTokenSwappable({
      chainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    } as never);

    expect(result).toEqual({
      swappable: true,
      provider: "orbs",
      kind: "same-chain",
    });
  });

  it("isTokenSwappable returns swappable=false with reason when quote fails", async () => {
    mocks.invokeAndRequireData.mockRejectedValue(new Error("no route available"));

    const result = await isTokenSwappable({
      chainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    } as never);

    expect(result).toEqual({
      swappable: false,
      provider: "orbs",
      kind: "same-chain",
      reason: "no route available",
    });
  });

  it("isTokenSwappable returns false when RadarDEX has no executable route", async () => {
    // Given: RadarDEX completed the quote request but found no executable route.
    mocks.invokeAndRequireData.mockResolvedValue({ routes: [], health: [] });

    // When: a consumer checks whether the Arc pair is swappable.
    // Then: a fulfilled but empty quote is not advertised as swappable.
    await expect(
      isTokenSwappable({
        provider: "radardex",
        chainId: 5042,
        fromToken: "0x1111111111111111111111111111111111111111",
        toToken: "0x2222222222222222222222222222222222222222",
        fromAmount: "1000000",
        slippageBps: 50,
      })
    ).resolves.toEqual({
      swappable: false,
      provider: "radardex",
      kind: "same-chain",
      reason: "RadarDEX returned no executable routes",
    });
  });

  it("executeSameChainSwap invokes orbs_swap", async () => {
    const params = {
      chainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    const pending = {
      status: "pending_confirmation",
      id: "op-1",
      summary: "Awaiting confirmation",
    };
    mocks.invokeAndRequireData.mockResolvedValue(pending);

    const result = await executeSameChainSwap(params as never);

    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "orbs_swap", params);
    expect(result).toEqual(pending);
  });

  it("executeBridge invokes lifi_execute_bridge", async () => {
    const params = {
      fromChainId: 1,
      toChainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
      walletAddress: "0x1234567890123456789012345678901234567890",
    };
    const resultData = { status: "submitted", txHash: "0xabc" };
    mocks.invokeAndRequireData.mockResolvedValue(resultData);

    const result = await executeBridge(params as never);

    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "lifi_execute_bridge", params);
    expect(result).toEqual(resultData);
  });

  it("explicit RadarDEX wrappers invoke their dedicated MCP tools", async () => {
    // Given: each RadarDEX tool returns a distinct typed payload.
    const quoteInput = {
      chainId: 5042,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "1000000",
      slippageBps: 50,
    } as const;
    mocks.invokeAndRequireData
      .mockResolvedValueOnce({ chainId: 5042, tokens: [] })
      .mockResolvedValueOnce({ request: quoteInput, routes: [], health: [] })
      .mockResolvedValueOnce({ chainId: 5042, venues: [] })
      .mockResolvedValueOnce({ status: "pending_confirmation", id: "radar-1", summary: "queued" });

    // When: consumers call the explicit RadarDEX SDK surface.
    const tokens = await listRadarDexTokens();
    const quote = await getRadarDexQuote(quoteInput);
    const health = await getRadarDexRouteHealth();
    const swap = await executeRadarDexSwap(quoteInput);

    // Then: each wrapper targets the matching public MCP tool and preserves the result shape.
    expect(mocks.invokeAndRequireData.mock.calls).toEqual([
      [runtime, "radardex_list_tokens", { chainId: 5042 }],
      [runtime, "radardex_get_quote", quoteInput],
      [runtime, "radardex_get_route_health", { chainId: 5042 }],
      [runtime, "radardex_swap", quoteInput],
    ]);
    expect(tokens).toEqual({ chainId: 5042, tokens: [] });
    expect(quote).toEqual({ request: quoteInput, routes: [], health: [] });
    expect(health).toEqual({ chainId: 5042, venues: [] });
    expect(swap).toEqual({ status: "pending_confirmation", id: "radar-1", summary: "queued" });
  });

  it("generic same-chain APIs dispatch provider radardex without changing the Orbs default", async () => {
    // Given: an Arc quote request explicitly selects RadarDEX.
    const params = {
      provider: "radardex",
      chainId: 5042,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "1000000",
      slippageBps: 50,
    } as const;
    const toolInput = {
      chainId: 5042,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: "1000000",
      slippageBps: 50,
    };
    mocks.invokeAndRequireData
      .mockResolvedValueOnce({ request: toolInput, routes: [], health: [] })
      .mockResolvedValueOnce({ status: "pending_confirmation", id: "radar-2", summary: "queued" });

    // When: quote and execution use the generic same-chain SDK functions.
    const quote = await getSwapQuote(params);
    const swap = await executeSameChainSwap(params);

    // Then: RadarDEX tools receive provider-free inputs and the quote identifies its provider.
    expect(mocks.invokeAndRequireData.mock.calls).toEqual([
      [runtime, "radardex_get_quote", toolInput],
      [runtime, "radardex_swap", toolInput],
    ]);
    expect(quote).toEqual({
      kind: "same-chain",
      provider: "radardex",
      chainId: 5042,
      quote: { request: toolInput, routes: [], health: [] },
    });
    expect(swap).toEqual({ status: "pending_confirmation", id: "radar-2", summary: "queued" });
  });

  it("includes RadarDEX operations in swap history", async () => {
    mocks.confirmationQueue.list.mockReturnValue([
      {
        id: "radar-3",
        type: "radardex_swap",
        description: "RadarDEX swap on Arc",
        createdAt: new Date("2026-09-17T00:00:00.000Z"),
        walletAddress: "0x1234567890123456789012345678901234567890",
      },
    ]);

    await expect(getSwapHistory()).resolves.toEqual({
      walletAddress: "0x1234567890123456789012345678901234567890",
      entries: [
        {
          id: "radar-3",
          provider: "radardex",
          status: "pending_confirmation",
          walletAddress: "0x1234567890123456789012345678901234567890",
          description: "RadarDEX swap on Arc",
          timestamp: "2026-09-17T00:00:00.000Z",
        },
      ],
    });
  });
});
