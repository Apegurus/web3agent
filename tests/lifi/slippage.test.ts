import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  convertQuoteToRoute: vi.fn(),
  getChains: vi.fn(),
  getQuote: vi.fn(),
}));

vi.mock("@lifi/sdk", () => ({
  convertQuoteToRoute: mocks.convertQuoteToRoute,
  executeRoute: vi.fn(),
  getChains: mocks.getChains,
  getQuote: mocks.getQuote,
}));

vi.mock("../../src/lifi/config.js", () => ({
  ensureLifiInitialized: vi.fn(),
  withLifiExecutionAccount: vi.fn(),
}));

import { prepareLifiRoute } from "../../src/lifi/route-execution.js";

describe("LI.FI slippage adaptation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getQuote.mockResolvedValue({ id: "quote" });
    mocks.getChains.mockResolvedValue([
      { diamondAddress: "0x5555555555555555555555555555555555555555", id: 4663 },
    ]);
    mocks.convertQuoteToRoute.mockReturnValue({
      id: "route",
      steps: [
        {
          id: "step",
          action: {
            fromAmount: "100",
            fromChainId: 4663,
            fromToken: { address: "0x1111111111111111111111111111111111111111" },
            toChainId: 4663,
            toToken: { address: "0x2222222222222222222222222222222222222222" },
          },
          transactionRequest: {
            chainId: 4663,
            from: "0x3333333333333333333333333333333333333333",
            to: "0x5555555555555555555555555555555555555555",
            value: "0",
          },
        },
      ],
    });
  });

  it("converts a public percentage to the LI.FI fractional quote value", async () => {
    // Given: a same-chain fallback request with a 0.75% tolerance
    const request = {
      account: "0x3333333333333333333333333333333333333333" as const,
      fromAmount: "100",
      fromChainId: 4663,
      fromToken: "0x1111111111111111111111111111111111111111",
      slippagePct: 0.75,
      toChainId: 4663,
      toToken: "0x2222222222222222222222222222222222222222",
    };

    // When: the LI.FI route is prepared
    await prepareLifiRoute(request);

    // Then: LI.FI receives 0.0075 rather than 0.75
    expect(mocks.getQuote).toHaveBeenCalledWith({
      fromAddress: request.account,
      fromAmount: request.fromAmount,
      fromChain: 4663,
      fromToken: request.fromToken,
      slippage: 0.0075,
      toChain: 4663,
      toToken: request.toToken,
    });
  });
});
