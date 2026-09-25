import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSwapClient: vi.fn(),
  requestQuote: vi.fn(),
  prepareSwap: vi.fn(),
  submitSwap: vi.fn(),
  pollSwapStatus: vi.fn(),
  signTypedData: vi.fn(),
}));

vi.mock("../../../src/orbs/liquidity-hub.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/orbs/liquidity-hub.js")>();
  return {
    ...actual,
    createSwapClient: mocks.createSwapClient,
    requestQuote: mocks.requestQuote,
    prepareSwap: mocks.prepareSwap,
    submitSwap: mocks.submitSwap,
    pollSwapStatus: mocks.pollSwapStatus,
  };
});

vi.mock("../../../src/wallet/persistence.js", () => ({
  getActiveAccount: vi.fn(() => ({
    address: "0x1234567890123456789012345678901234567890",
    signTypedData: mocks.signTypedData,
  })),
}));

vi.mock("../../../src/tools/shared/chain-context.js", () => ({
  resolveToolChainId: vi.fn((chainId?: number) => chainId ?? 8453),
}));

const QUOTE = {
  inToken: "0x4200000000000000000000000000000000000006",
  outToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  inAmount: "1000",
  outAmount: "2000",
  minAmountOut: "1990",
  user: "0x1234567890123456789012345678901234567890",
  sessionId: "session-1",
  permitData: { domain: {}, types: {}, values: {} },
  eip712: {
    domain: { name: "Permit2", chainId: 8453 },
    types: { PermitWitnessTransferFrom: [{ name: "nonce", type: "uint256" }] },
    primaryType: "PermitWitnessTransferFrom",
    message: { nonce: "1" },
  },
};

const PARAMS = {
  chainId: 8453,
  fromToken: QUOTE.inToken,
  toToken: QUOTE.outToken,
  fromAmount: "1000",
};

// biome-ignore lint/suspicious/noExplicitAny: test helper reads the structured tool envelope
function parse(result: { structuredContent?: Record<string, unknown> }): any {
  return result.structuredContent;
}

describe("executeOrbsSwapNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareSwap.mockResolvedValue({ fromToken: QUOTE.inToken });
    mocks.signTypedData.mockResolvedValue(`0x${"ab".repeat(65)}`);
  });

  it("uses a dedicated client for each swap", async () => {
    const { executeOrbsSwapNow } = await import("../../../src/tools/orbs/swaps.js");
    const clients = [
      { swap: vi.fn().mockResolvedValue("0xaa") },
      { swap: vi.fn().mockResolvedValue("0xbb") },
    ];
    mocks.createSwapClient.mockReturnValueOnce(clients[0]).mockReturnValueOnce(clients[1]);
    mocks.requestQuote.mockResolvedValue(QUOTE);

    const [first, second] = await Promise.all([
      executeOrbsSwapNow(PARAMS),
      executeOrbsSwapNow(PARAMS),
    ]);

    expect(mocks.createSwapClient).toHaveBeenCalledTimes(2);
    expect(mocks.requestQuote).toHaveBeenNthCalledWith(1, clients[0], expect.any(Object));
    expect(mocks.requestQuote).toHaveBeenNthCalledWith(2, clients[1], expect.any(Object));
    expect(parse(first).data.txHash).toBe("0xaa");
    expect(parse(second).data.txHash).toBe("0xbb");
    expect(mocks.submitSwap).not.toHaveBeenCalled();
  });

  it("returns ORBS_QUOTE_ERROR when the quote request throws", async () => {
    const { executeOrbsSwapNow } = await import("../../../src/tools/orbs/swaps.js");
    mocks.createSwapClient.mockReturnValue({ swap: vi.fn() });
    mocks.requestQuote.mockRejectedValue(new Error("Liquidity Hub quote error: no route"));

    const result = await executeOrbsSwapNow(PARAMS);

    expect(result.isError).toBe(true);
    const body = parse(result);
    expect(body.error.code).toBe("ORBS_QUOTE_ERROR");
    expect(body.error.message).toBe("Liquidity Hub quote error: no route");
    expect(mocks.signTypedData).not.toHaveBeenCalled();
  });

  it("falls back to direct submission when the SDK swap fails", async () => {
    const { executeOrbsSwapNow } = await import("../../../src/tools/orbs/swaps.js");
    mocks.createSwapClient.mockReturnValue({
      swap: vi.fn().mockRejectedValue(new Error("Liquidity Hub swap timed out")),
    });
    mocks.requestQuote.mockResolvedValue(QUOTE);
    mocks.submitSwap.mockResolvedValue({
      sessionId: "session-1",
      status: "completed",
      txHash: "0xcc",
    });

    const result = await executeOrbsSwapNow(PARAMS);

    expect(mocks.submitSwap).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 8453, quote: QUOTE })
    );
    expect(parse(result).data.txHash).toBe("0xcc");
  });
});
