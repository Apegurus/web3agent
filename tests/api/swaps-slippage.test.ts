import { beforeEach, describe, expect, it, vi } from "vitest";
import { Web3AgentError } from "../../src/api/errors.js";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getRuntime: vi.fn(),
  invokeAndRequireData: vi.fn(),
  parseInput: vi.fn(),
}));

vi.mock("../../src/api/shared.js", () => ({
  getRuntime: mocks.getRuntime,
  invokeAndRequireData: mocks.invokeAndRequireData,
}));

vi.mock("../../src/api/validation.js", () => ({
  parseInput: mocks.parseInput,
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: mocks.getConfig,
}));

import { executeSameChainSwap, getSwapQuote } from "../../src/api/swaps.js";

const runtime = { invokeTool: vi.fn() };
const params = {
  chainId: 4663,
  fromAmount: "100",
  fromToken: "0x1111111111111111111111111111111111111111",
  slippagePct: 0.75,
  toToken: "0x2222222222222222222222222222222222222222",
};

describe("Robinhood same-chain slippage routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({ chainId: 8453 });
    mocks.getRuntime.mockResolvedValue(runtime);
    mocks.parseInput.mockImplementation((_schema: unknown, input: unknown) => input);
  });

  it("converts the public percentage to basis points for a 0x quote", async () => {
    // Given: a public same-chain request with a non-default percentage tolerance
    mocks.invokeAndRequireData.mockResolvedValue({
      adapterSource: "native",
      buyAmount: "95",
      capabilityDecisionId: "zeroex-goat-v2-admission-v1",
      capabilityReason: "goat-chain-4663-unavailable",
      sellAmount: "100",
    });

    // When: Robinhood routes the quote through 0x
    await getSwapQuote(params);

    // Then: 0x receives the equivalent integer basis-point tolerance
    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "zeroex_get_quote", {
      chainId: 4663,
      fromAmount: params.fromAmount,
      fromToken: params.fromToken,
      slippageBps: 75,
      toToken: params.toToken,
    });
  });

  it("preserves the public percentage when a 0x quote falls back to LI.FI", async () => {
    // Given: a fallback-eligible 0x failure
    mocks.invokeAndRequireData
      .mockRejectedValueOnce(new Web3AgentError({ code: "ZEROEX_NO_ROUTE", message: "stable" }))
      .mockResolvedValueOnce({ routeId: "lifi" });

    // When: the quote falls back to a same-chain LI.FI route
    await getSwapQuote(params);

    // Then: LI.FI receives the caller's original percentage tolerance
    expect(mocks.invokeAndRequireData).toHaveBeenNthCalledWith(2, runtime, "lifi_get_quote", {
      fromAmount: params.fromAmount,
      fromChainId: 4663,
      fromToken: params.fromToken,
      slippagePct: 0.75,
      toChainId: 4663,
      toToken: params.toToken,
    });
  });

  it("converts the public percentage to basis points for 0x execution", async () => {
    // Given: a same-chain write that remains pending in the confirmation queue
    mocks.invokeAndRequireData.mockResolvedValue({
      id: "swap",
      status: "pending_confirmation",
      summary: "Awaiting confirmation",
    });

    // When: Robinhood routes execution through 0x
    await executeSameChainSwap(params);

    // Then: the queued 0x operation receives the converted tolerance
    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "zeroex_swap", {
      chainId: 4663,
      fromAmount: params.fromAmount,
      fromToken: params.fromToken,
      slippageBps: 75,
      toToken: params.toToken,
    });
  });

  it("preserves the public percentage when 0x execution falls back to LI.FI", async () => {
    // Given: a fallback-eligible 0x execution failure
    mocks.invokeAndRequireData
      .mockRejectedValueOnce(
        new Web3AgentError({ code: "ZEROEX_PROVIDER_UNAVAILABLE", message: "stable" })
      )
      .mockResolvedValueOnce({ status: "completed" });

    // When: execution falls back to the same-chain LI.FI driver
    await executeSameChainSwap(params);

    // Then: the fallback write retains the original percentage tolerance
    expect(mocks.invokeAndRequireData).toHaveBeenNthCalledWith(2, runtime, "lifi_execute_bridge", {
      fromAmount: params.fromAmount,
      fromChainId: 4663,
      fromToken: params.fromToken,
      slippagePct: 0.75,
      toChainId: 4663,
      toToken: params.toToken,
    });
  });
});
