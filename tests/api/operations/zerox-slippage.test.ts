import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  classifyZeroExError: vi.fn(),
  getConfig: vi.fn(),
  getZeroExQuote: vi.fn(),
  prepareLifiSameChainSwapOperation: vi.fn(),
}));

vi.mock("../../../src/config/env.js", () => ({ getConfig: mocks.getConfig }));
vi.mock("../../../src/zerox/client.js", () => ({
  classifyZeroExError: mocks.classifyZeroExError,
  getZeroExQuote: mocks.getZeroExQuote,
}));
vi.mock("../../../src/api/operations/lifi-same-chain.js", () => ({
  prepareLifiSameChainSwapOperation: mocks.prepareLifiSameChainSwapOperation,
}));

import { prepareZeroExSwapOperation } from "../../../src/api/operations/zerox.js";

describe("prepared 0x fallback slippage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({ zeroxApiKey: "key" });
    mocks.getZeroExQuote.mockRejectedValue(new Error("no route"));
    mocks.classifyZeroExError.mockReturnValue({ fallbackAllowed: true, kind: "no-route" });
    mocks.prepareLifiSameChainSwapOperation.mockResolvedValue({ integration: "lifi" });
  });

  it("converts basis points to a percentage before preparing LI.FI", async () => {
    // Given: a prepared 0x operation with 75 BPS slippage and no 0x route
    const input = {
      account: "0x3333333333333333333333333333333333333333" as const,
      chainId: 4663 as const,
      fromAmount: "100",
      fromToken: "0x1111111111111111111111111111111111111111",
      integration: "zeroex" as const,
      kind: "swap" as const,
      slippageBps: 75,
      toToken: "0x2222222222222222222222222222222222222222",
    };

    // When: the prepared operation falls back to LI.FI
    await prepareZeroExSwapOperation(input);

    // Then: the fallback operation receives 0.75%
    expect(mocks.prepareLifiSameChainSwapOperation).toHaveBeenCalledWith(
      {
        account: input.account,
        fromAmount: input.fromAmount,
        fromChainId: 4663,
        fromToken: input.fromToken,
        integration: "lifi",
        kind: "swap",
        slippagePct: 0.75,
        toChainId: 4663,
        toToken: input.toToken,
      },
      { reason: "no-route" }
    );
  });
});
