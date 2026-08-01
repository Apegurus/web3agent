import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  classifyZeroExError: vi.fn(),
  executeWrite: vi.fn(),
  getConfig: vi.fn(),
  getWalletState: vi.fn(),
  getZeroExQuote: vi.fn(),
  prepareLifiRoute: vi.fn(),
}));

vi.mock("../../src/config/env.js", () => ({ getConfig: mocks.getConfig }));
vi.mock("../../src/lifi/route-execution.js", () => ({
  prepareLifiRoute: mocks.prepareLifiRoute,
}));
vi.mock("../../src/utils/write.js", () => ({ executeWrite: mocks.executeWrite }));
vi.mock("../../src/wallet/confirmation.js", () => ({ registerExecutor: vi.fn() }));
vi.mock("../../src/wallet/persistence.js", () => ({ getWalletState: mocks.getWalletState }));
vi.mock("../../src/zerox/client.js", () => ({
  classifyZeroExError: mocks.classifyZeroExError,
  getZeroExQuote: mocks.getZeroExQuote,
}));

import { zeroExSwap } from "../../src/tools/zerox/index.js";

const account = "0x3333333333333333333333333333333333333333";
const params = {
  chainId: 4663,
  fromAmount: "100",
  fromToken: "0x1111111111111111111111111111111111111111",
  slippageBps: 75,
  toToken: "0x2222222222222222222222222222222222222222",
};
const preparedRoute = {
  id: "route",
  steps: [
    {
      action: {
        fromAmount: params.fromAmount,
        fromChainId: 4663,
        fromToken: { address: params.fromToken },
        toAmount: "95",
        toChainId: 4663,
        toToken: { address: params.toToken },
      },
      id: "step",
      transactionRequest: {
        chainId: 4663,
        data: "0x1234",
        from: account,
        to: "0x4444444444444444444444444444444444444444",
        value: "0",
      },
    },
  ],
};

describe("0x tool LI.FI fallback slippage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({ chainId: 4663, zeroxApiKey: "key" });
    mocks.getWalletState.mockReturnValue({ address: account });
    mocks.getZeroExQuote.mockRejectedValue(new Error("no route"));
    mocks.classifyZeroExError.mockReturnValue({ fallbackAllowed: true, kind: "no-route" });
    mocks.prepareLifiRoute.mockResolvedValue(preparedRoute);
    mocks.executeWrite.mockReturnValue({ structuredContent: { ok: true } });
  });

  it("converts 0x basis points back to a percentage for LI.FI", async () => {
    // Given: 0x cannot route a swap carrying a 75 BPS tolerance
    // When: the tool prepares its LI.FI fallback
    await zeroExSwap(params);

    // Then: LI.FI receives the equivalent 0.75% public tolerance
    expect(mocks.prepareLifiRoute).toHaveBeenCalledWith({
      account,
      fromAmount: params.fromAmount,
      fromChainId: 4663,
      fromToken: params.fromToken,
      slippagePct: 0.75,
      toChainId: 4663,
      toToken: params.toToken,
    });
  });
});
