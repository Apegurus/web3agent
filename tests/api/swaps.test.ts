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
  executeSameChainSwap,
  getSwapQuote,
  isTokenSwappable,
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
});
