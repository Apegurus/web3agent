import { maxUint256 } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupDefaultOperationMocks } from "../helpers/operation-mocks.js";

const viemMocks = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
  createClient: vi.fn(),
}));

const liquidityHubMocks = vi.hoisted(() => ({
  getIntentQuote: vi.fn(),
  submitSwap: vi.fn(),
}));

const twapMocks = vi.hoisted(() => ({
  getSrcTokenChunkAmount: vi.fn(),
  prepareTwapOrder: vi.fn(),
  submitSignedOrder: vi.fn(),
}));

const lifiMocks = vi.hoisted(() => ({
  getQuote: vi.fn(),
  getChains: vi.fn(),
  convertQuoteToRoute: vi.fn(),
  setAllowance: vi.fn(),
  createConfig: vi.fn(),
  EVM: vi.fn((provider: unknown) => ({ provider })),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: (...args: unknown[]) => viemMocks.createPublicClient(...args),
    createClient: (...args: unknown[]) => viemMocks.createClient(...args),
  };
});

vi.mock("../../src/orbs/liquidity-hub.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/orbs/liquidity-hub.js")>();
  return {
    ...actual,
    getIntentQuote: (...args: unknown[]) => liquidityHubMocks.getIntentQuote(...args),
    submitSwap: (...args: unknown[]) => liquidityHubMocks.submitSwap(...args),
  };
});

vi.mock("../../src/orbs/twap.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/orbs/twap.js")>();
  return {
    ...actual,
    getSrcTokenChunkAmount: (...args: unknown[]) => twapMocks.getSrcTokenChunkAmount(...args),
    prepareTwapOrder: (...args: unknown[]) => twapMocks.prepareTwapOrder(...args),
    submitSignedOrder: (...args: unknown[]) => twapMocks.submitSignedOrder(...args),
  };
});

vi.mock("@lifi/sdk", () => ({
  getQuote: (...args: unknown[]) => lifiMocks.getQuote(...args),
  getChains: (...args: unknown[]) => lifiMocks.getChains(...args),
  convertQuoteToRoute: (...args: unknown[]) => lifiMocks.convertQuoteToRoute(...args),
  setAllowance: (...args: unknown[]) => lifiMocks.setAllowance(...args),
  createConfig: (...args: unknown[]) => lifiMocks.createConfig(...args),
  EVM: (...args: unknown[]) => lifiMocks.EVM(...args),
}));

describe("browser wallet intent APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultOperationMocks({ viemMocks, twapMocks, lifiMocks });
  });

  it("prepareSwapIntent returns normalized quote data and required approvals", async () => {
    liquidityHubMocks.getIntentQuote.mockResolvedValue({
      sessionId: "session-1",
      inToken: "0x4200000000000000000000000000000000000006",
      outToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      inAmount: "1000000000000000000",
      outAmount: "3200000000",
      minAmountOut: "3100000000",
      user: "0x1234567890123456789012345678901234567890",
      eip712: {
        domain: {
          name: "Permit2",
          chainId: 8453,
          verifyingContract: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        },
        types: {
          PermitWitnessTransferFrom: [
            { name: "owner", type: "address" },
            { name: "amount", type: "uint256" },
          ],
        },
        primaryType: "PermitWitnessTransferFrom",
        message: {
          owner: "0x1234567890123456789012345678901234567890",
          amount: "1000000000000000000",
        },
      },
    });

    const { prepareSwapIntent } = await import("../../src/api/intents.js");
    const result = await prepareSwapIntent({
      chainId: 8453,
      fromToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      toToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      fromAmount: "1000000000000000000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(liquidityHubMocks.getIntentQuote).toHaveBeenCalledWith(
      8453,
      expect.objectContaining({
        fromToken: "0x4200000000000000000000000000000000000006",
      })
    );
    expect(result.chainId).toBe(8453);
    expect(result.requiredApprovals.map((step) => step.type)).toEqual(["wrap", "approve"]);
    expect(result.quote.sessionId).toBe("session-1");
    expect(result.eip712.primaryType).toBe("PermitWitnessTransferFrom");
    expect(result.eip712.message.owner).toBe("0x1234567890123456789012345678901234567890");
  });

  it("getRequiredApprovals returns empty when allowance is sufficient", async () => {
    viemMocks.createPublicClient.mockReturnValue({
      readContract: vi.fn().mockResolvedValue(maxUint256),
    });

    const { getRequiredApprovals } = await import("../../src/api/intents.js");
    const result = await getRequiredApprovals({
      chainId: 8453,
      fromToken: "0x4200000000000000000000000000000000000006",
      fromAmount: "10",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(result).toEqual([]);
  });

  it("prepareTwapIntent returns signable typed data and metadata", async () => {
    twapMocks.prepareTwapOrder.mockReturnValue({
      domain: { name: "Orbs" },
      types: { RePermitWitnessTransferFrom: [] },
      primaryType: "RePermitWitnessTransferFrom",
      order: { maker: "0xabc" },
    });

    const { prepareTwapIntent } = await import("../../src/api/intents.js");
    const result = await prepareTwapIntent({
      chainId: 8453,
      fromToken: "0x1",
      toToken: "0x2",
      fromAmount: "1000",
      chunks: 5,
      fillDelay: 60,
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(result.meta).toEqual({
      chunks: 5,
      fillDelaySeconds: 60,
      durationSeconds: 600,
      srcAmountPerChunk: "200",
    });
    expect(result.eip712.message).toEqual({ maker: "0xabc" });
  });

  it("prepareLimitIntent applies the default expiry", async () => {
    twapMocks.prepareTwapOrder.mockReturnValue({
      domain: { name: "Orbs" },
      types: { RePermitWitnessTransferFrom: [] },
      primaryType: "RePermitWitnessTransferFrom",
      order: { maker: "0xabc" },
    });

    const { prepareLimitIntent } = await import("../../src/api/intents.js");
    const result = await prepareLimitIntent({
      chainId: 8453,
      fromToken: "0x1",
      toToken: "0x2",
      fromAmount: "1000",
      toMinAmount: "900",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(twapMocks.prepareTwapOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        durationSeconds: 86400,
        dstMinAmountPerTrade: "900",
      })
    );
    expect(result.meta).toEqual({
      expirySeconds: 86400,
      toMinAmount: "900",
    });
  });

  it("prepareBridgeIntent prepends bridge approvals for ERC-20 inputs", async () => {
    lifiMocks.getQuote.mockResolvedValue({
      action: {
        fromChainId: 1,
        toChainId: 8453,
        fromToken: {
          address: "0x3333333333333333333333333333333333333333",
          symbol: "USDC",
        },
        toToken: {
          address: "0x4444444444444444444444444444444444444444",
          symbol: "ETH",
        },
        fromAmount: "1000",
      },
      estimate: {
        approvalAddress: "0x1111111111111111111111111111111111111111",
        toAmount: "999",
        toAmountMin: "990",
        gasCosts: [{ amountUSD: "5" }],
        executionDuration: 300,
      },
      transactionRequest: {
        to: "0x2222222222222222222222222222222222222222",
        data: "0xbbbb",
        gasLimit: "250000",
        chainId: 1,
      },
    });

    const { prepareBridgeIntent } = await import("../../src/api/intents.js");
    const result = await prepareBridgeIntent({
      fromChainId: 1,
      toChainId: 8453,
      fromTokenAddress: "0x3333333333333333333333333333333333333333",
      toTokenAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      fromAmount: "1000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(result.steps).toEqual([
      {
        type: "approval",
        label: "Approve token for bridge",
        tx: {
          to: "0x3333333333333333333333333333333333333333",
          data: "0x095ea7b3",
          value: "0",
          chainId: 1,
        },
      },
      {
        type: "bridge",
        label: "Execute bridge",
        tx: {
          to: "0x2222222222222222222222222222222222222222",
          data: "0xbbbb",
          value: "0",
          gasLimit: "250000",
          chainId: 1,
        },
      },
    ]);
    expect(result.actions).toEqual([
      expect.objectContaining({
        id: "bridge:approval:0",
        type: "transaction",
        tx: expect.objectContaining({
          to: "0x3333333333333333333333333333333333333333",
          data: "0x095ea7b3",
          value: "0",
        }),
      }),
      expect.objectContaining({
        id: "bridge:execute:0",
        type: "transaction",
        tx: expect.objectContaining({
          value: "0",
        }),
      }),
    ]);
    expect(result.estimate.estimatedDurationSeconds).toBe(300);
  });

  it("prepareBridgeIntent skips approvals when allowance is already sufficient", async () => {
    viemMocks.createPublicClient.mockReturnValue({
      readContract: vi.fn().mockResolvedValue(maxUint256),
    });
    lifiMocks.getQuote.mockResolvedValue({
      action: {
        fromChainId: 1,
        toChainId: 8453,
        fromToken: {
          address: "0x3333333333333333333333333333333333333333",
          symbol: "USDC",
        },
        toToken: {
          address: "0x4444444444444444444444444444444444444444",
          symbol: "ETH",
        },
        fromAmount: "1000",
      },
      estimate: {
        approvalAddress: "0x1111111111111111111111111111111111111111",
        toAmount: "999",
        toAmountMin: "990",
      },
      transactionRequest: {
        to: "0x2222222222222222222222222222222222222222",
        data: "0xbbbb",
        chainId: 1,
      },
    });

    const { prepareBridgeIntent } = await import("../../src/api/intents.js");
    const result = await prepareBridgeIntent({
      fromChainId: 1,
      toChainId: 8453,
      fromTokenAddress: "0x3333333333333333333333333333333333333333",
      toTokenAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      fromAmount: "1000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(result.steps).toEqual([
      {
        type: "bridge",
        label: "Execute bridge",
        tx: {
          to: "0x2222222222222222222222222222222222222222",
          data: "0xbbbb",
          value: "0",
          chainId: 1,
        },
      },
    ]);
    expect(result.actions).toEqual([
      expect.objectContaining({
        id: "bridge:execute:0",
        type: "transaction",
      }),
    ]);
  });

  it("prepareBridgeIntent skips approvals for native bridge inputs", async () => {
    lifiMocks.getQuote.mockResolvedValue({
      action: {
        fromChainId: 1,
        toChainId: 8453,
        fromToken: {
          address: "0x0000000000000000000000000000000000000000",
          symbol: "ETH",
        },
        toToken: {
          address: "0x4444444444444444444444444444444444444444",
          symbol: "ETH",
        },
        fromAmount: "1000000000000000000",
      },
      estimate: {
        approvalAddress: "0x1111111111111111111111111111111111111111",
        toAmount: "999000000000000000",
        toAmountMin: "990000000000000000",
      },
      transactionRequest: {
        to: "0x2222222222222222222222222222222222222222",
        data: "0xbbbb",
        chainId: 1,
        value: "1000000000000000000",
      },
    });

    const { prepareBridgeIntent } = await import("../../src/api/intents.js");
    const result = await prepareBridgeIntent({
      fromChainId: 1,
      toChainId: 8453,
      fromTokenAddress: "0x0000000000000000000000000000000000000000",
      toTokenAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      fromAmount: "1000000000000000000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(result.steps).toEqual([
      {
        type: "bridge",
        label: "Execute bridge",
        tx: {
          to: "0x2222222222222222222222222222222222222222",
          data: "0xbbbb",
          value: "1000000000000000000",
          chainId: 1,
        },
      },
    ]);
    expect(result.actions).toEqual([
      expect.objectContaining({
        id: "bridge:execute:0",
        type: "transaction",
      }),
    ]);
  });

  it("prepareBridgeIntent skips approvals for alternate native token aliases", async () => {
    lifiMocks.getQuote.mockResolvedValue({
      action: {
        fromChainId: 137,
        toChainId: 8453,
        fromToken: {
          address: "0x0000000000000000000000000000000000001010",
          symbol: "POL",
        },
        toToken: {
          address: "0x4444444444444444444444444444444444444444",
          symbol: "ETH",
        },
        fromAmount: "1000000000000000000",
      },
      estimate: {
        approvalAddress: "0x1111111111111111111111111111111111111111",
        toAmount: "999000000000000000",
        toAmountMin: "990000000000000000",
      },
      transactionRequest: {
        to: "0x2222222222222222222222222222222222222222",
        data: "0xbbbb",
        chainId: 137,
        value: "1000000000000000000",
      },
    });

    const { prepareBridgeIntent } = await import("../../src/api/intents.js");
    const result = await prepareBridgeIntent({
      fromChainId: 137,
      toChainId: 8453,
      fromTokenAddress: "0x0000000000000000000000000000000000001010",
      toTokenAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      fromAmount: "1000000000000000000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(result.steps).toEqual([
      expect.objectContaining({
        type: "bridge",
      }),
    ]);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      id: "bridge:execute:0",
      type: "transaction",
    });
  });

  it("submitSignedSwap forwards the quote and signature to Orbs", async () => {
    liquidityHubMocks.submitSwap.mockResolvedValue({
      sessionId: "session-1",
      txHash: "0xabc",
      status: "completed",
    });

    const { submitSignedSwap } = await import("../../src/api/intents.js");
    const result = await submitSignedSwap({
      chainId: 8453,
      quote: {
        sessionId: "session-1",
        inToken: "0x4200000000000000000000000000000000000006",
        outToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        inAmount: "1000000000000000000",
        outAmount: "3200000000",
        minAmountOut: "3100000000",
        user: "0x1234567890123456789012345678901234567890",
      },
      signature: "0xsigned",
    });

    expect(liquidityHubMocks.submitSwap).toHaveBeenCalledWith({
      chainId: 8453,
      quote: {
        sessionId: "session-1",
        inToken: "0x4200000000000000000000000000000000000006",
        outToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        inAmount: "1000000000000000000",
        outAmount: "3200000000",
        minAmountOut: "3100000000",
        user: "0x1234567890123456789012345678901234567890",
      },
      signature: "0xsigned",
    });
    expect(result).toEqual({
      sessionId: "session-1",
      txHash: "0xabc",
      status: "completed",
    });
  });

  it("submitSignedTwapOrder converts numeric v to the SDK signature shape", async () => {
    twapMocks.submitSignedOrder.mockResolvedValue({
      id: "order-1",
      status: "OPEN",
      txHash: "0xdef",
    });

    const { submitSignedTwapOrder } = await import("../../src/api/intents.js");
    const result = await submitSignedTwapOrder({
      order: { maker: "0xabc", deadline: "9999999999" },
      signature: {
        v: 27,
        r: `0x${"11".repeat(32)}`,
        s: `0x${"22".repeat(32)}`,
      },
    });

    expect(twapMocks.submitSignedOrder).toHaveBeenCalledWith(
      { maker: "0xabc", deadline: "9999999999" },
      {
        v: "0x1b",
        r: `0x${"11".repeat(32)}`,
        s: `0x${"22".repeat(32)}`,
      }
    );
    expect(result).toEqual({
      orderId: "order-1",
      status: "OPEN",
      txHash: "0xdef",
    });
  });
});
