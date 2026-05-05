import { maxUint256 } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Web3AgentError } from "../../src/api/errors.js";
import { setupDefaultOperationMocks } from "../helpers/operation-mocks.js";

const viemMocks = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
  createClient: vi.fn(),
}));

const liquidityHubMocks = vi.hoisted(() => ({
  getIntentQuote: vi.fn(),
  submitSwap: vi.fn(),
}));

const lifiMocks = vi.hoisted(() => ({
  getQuote: vi.fn(),
  getChains: vi.fn(),
  convertQuoteToRoute: vi.fn(),
  setAllowance: vi.fn(),
  createConfig: vi.fn(),
  EVM: vi.fn((provider: unknown) => ({ provider })),
}));

const spotClientMocks = vi.hoisted(() => ({
  submitSpotOrder: vi.fn(),
}));

const spotConfigMocks = vi.hoisted(() => ({
  getSpotApiUrl: vi.fn().mockReturnValue("https://test-api.example.com"),
}));

const operationsMocks = vi.hoisted(() => ({
  prepareOperation: vi.fn(),
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

vi.mock("@lifi/sdk", () => ({
  getQuote: (...args: unknown[]) => lifiMocks.getQuote(...args),
  getChains: (...args: unknown[]) => lifiMocks.getChains(...args),
  convertQuoteToRoute: (...args: unknown[]) => lifiMocks.convertQuoteToRoute(...args),
  setAllowance: (...args: unknown[]) => lifiMocks.setAllowance(...args),
  createConfig: (...args: unknown[]) => lifiMocks.createConfig(...args),
  EVM: (...args: unknown[]) => lifiMocks.EVM(...args),
}));

vi.mock("../../src/orbs/spot-client.js", () => ({
  submitSpotOrder: (...args: unknown[]) => spotClientMocks.submitSpotOrder(...args),
}));

vi.mock("../../src/orbs/spot-config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/orbs/spot-config.js")>();
  return {
    ...actual,
    getSpotApiUrl: () => spotConfigMocks.getSpotApiUrl(),
  };
});

vi.mock("../../src/api/operations.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api/operations.js")>();
  return {
    ...actual,
    prepareOperation: (...args: unknown[]) => operationsMocks.prepareOperation(...args),
  };
});

describe("browser wallet intent APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultOperationMocks({ viemMocks, lifiMocks });
    // Let prepareOperation passthrough to real implementation for these tests
    const realOperations = vi.importActual<typeof import("../../src/api/operations.js")>(
      "../../src/api/operations.js"
    );
    operationsMocks.prepareOperation.mockImplementation(async (...args: unknown[]) =>
      (await realOperations).prepareOperation(...args)
    );
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

  it("getRequiredApprovals checks RePermit allowance when mode is 'order'", async () => {
    const readContractMock = vi.fn().mockResolvedValue(0n);
    viemMocks.createPublicClient.mockReturnValue({
      readContract: readContractMock,
    });

    const { getRequiredApprovals } = await import("../../src/api/intents.js");
    const result = await getRequiredApprovals({
      chainId: 42161,
      fromToken: "0x4200000000000000000000000000000000000006",
      fromAmount: "1000",
      account: "0x1234567890123456789012345678901234567890",
      mode: "order",
    });

    const REPERMIT_ADDRESS = "0x00002a9C4D9497df5Bd31768eC5d30eEf5405000";
    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "allowance",
        args: ["0x1234567890123456789012345678901234567890", REPERMIT_ADDRESS],
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("approve");
    expect(result[0].label).toContain("RePermit");
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
      fromToken: "0x3333333333333333333333333333333333333333",
      toToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
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
      fromToken: "0x3333333333333333333333333333333333333333",
      toToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
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
      fromToken: "0x0000000000000000000000000000000000000000",
      toToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
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
      fromToken: "0x0000000000000000000000000000000000001010",
      toToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
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
});

describe("submitSignedOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spotConfigMocks.getSpotApiUrl.mockReturnValue("https://test-api.example.com");
  });

  it("splits signature, submits to spot API, and returns response", async () => {
    spotClientMocks.submitSpotOrder.mockResolvedValue({
      ok: true,
      status: 200,
      response: { id: "abc" },
    });

    const { submitSignedOrder } = await import("../../src/api/intents.js");
    // Valid 65-byte signature (130 hex chars + 0x prefix = 132 chars)
    const signature =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" +
      "1b";

    const result = await submitSignedOrder({
      submitUrl: "https://test-api.example.com/orders/new",
      order: { maker: "0x123" },
      signature: signature as `0x${string}`,
    });

    expect(spotClientMocks.submitSpotOrder).toHaveBeenCalledWith({
      url: "https://test-api.example.com/orders/new",
      order: { maker: "0x123" },
      signature: {
        r: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        s: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        v: "0x1b",
      },
    });
    expect(result).toEqual({ status: "submitted", response: { id: "abc" } });
  });

  it("throws INVALID_PARAMS when submitUrl does not match Spot API base", async () => {
    const { submitSignedOrder } = await import("../../src/api/intents.js");
    const signature =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" +
      "1b";

    await expect(
      submitSignedOrder({
        submitUrl: "https://evil.example.com/orders/new",
        order: { maker: "0x123" },
        signature: signature as `0x${string}`,
      })
    ).rejects.toThrow(Web3AgentError);

    try {
      await submitSignedOrder({
        submitUrl: "https://evil.example.com/orders/new",
        order: { maker: "0x123" },
        signature: signature as `0x${string}`,
      });
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(Web3AgentError);
      expect((e as Web3AgentError).code).toBe("INVALID_PARAMS");
    }
  });

  it("throws INVALID_PARAMS when submitUrl only matches the Spot API base by prefix", async () => {
    const { submitSignedOrder } = await import("../../src/api/intents.js");
    const signature =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" +
      "1b";

    await expect(
      submitSignedOrder({
        submitUrl: "https://test-api.example.com.evil.com/orders/new",
        order: { maker: "0x123" },
        signature: signature as `0x${string}`,
      })
    ).rejects.toThrow(Web3AgentError);

    expect(spotClientMocks.submitSpotOrder).not.toHaveBeenCalled();
  });

  it("throws ORBS_ORDER_ERROR when submit returns non-ok response", async () => {
    spotClientMocks.submitSpotOrder.mockResolvedValue({
      ok: false,
      status: 400,
      response: "bad request",
    });

    const { submitSignedOrder } = await import("../../src/api/intents.js");
    const signature =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" +
      "1b";

    try {
      await submitSignedOrder({
        submitUrl: "https://test-api.example.com/orders/new",
        order: { maker: "0x123" },
        signature: signature as `0x${string}`,
      });
      expect.unreachable("should have thrown");
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(Web3AgentError);
      expect((e as Web3AgentError).code).toBe("ORBS_ORDER_ERROR");
    }
  });
});

describe("submitSignedTwapOrder (deprecated adapter)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spotConfigMocks.getSpotApiUrl.mockReturnValue("https://test-api.example.com");
  });

  it("joins signature components, delegates to submitSignedOrder with /orders/new endpoint", async () => {
    spotClientMocks.submitSpotOrder.mockResolvedValue({
      ok: true,
      status: 200,
      response: { id: "twap-abc" },
    });

    const { submitSignedTwapOrder } = await import("../../src/api/intents.js");

    const result = await submitSignedTwapOrder({
      order: { maker: "0x123", chunks: 5 },
      signature: {
        v: 27,
        r: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        s: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    });

    expect(spotClientMocks.submitSpotOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://test-api.example.com/orders/new",
      })
    );
    expect(result).toEqual({ status: "submitted", response: { id: "twap-abc" } });
  });

  it("throws INVALID_PARAMS for invalid non-hex r/s values", async () => {
    const { submitSignedTwapOrder } = await import("../../src/api/intents.js");

    try {
      await submitSignedTwapOrder({
        order: { maker: "0x123" },
        signature: {
          v: 27,
          r: "not-hex-value",
          s: "also-not-hex",
        },
      });
      expect.unreachable("should have thrown");
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(Web3AgentError);
      expect((e as Web3AgentError).code).toBe("INVALID_PARAMS");
    }
  });
});

describe("prepareTwapIntent param conversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    operationsMocks.prepareOperation.mockResolvedValue({
      actions: [],
      resumeState: {},
      meta: {
        intent: {
          typedData: {},
          submit: { url: "https://test-api.example.com/orders/new", body: {} },
          meta: {},
          approval: {},
        },
      },
    });
  });

  it("divides fromAmount by chunks and passes fromMaxAmount and epoch", async () => {
    const { prepareTwapIntent } = await import("../../src/api/intents.js");
    await prepareTwapIntent({
      fromToken: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      toToken: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      fromAmount: "1000000",
      chunks: 5,
      fillDelay: 60,
      account: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      chainId: 1,
    });

    expect(operationsMocks.prepareOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        integration: "orbs",
        kind: "order",
        fromAmount: "200000",
        fromMaxAmount: "1000000",
        epoch: 60,
      })
    );
  });

  it("rejects TWAP amounts that are not evenly divisible by chunks", async () => {
    const { prepareTwapIntent } = await import("../../src/api/intents.js");

    await expect(
      prepareTwapIntent({
        fromToken: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        toToken: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        fromAmount: "1000001",
        chunks: 5,
        fillDelay: 60,
        account: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
        chainId: 1,
      })
    ).rejects.toThrow(Web3AgentError);
  });
});

describe("prepareLimitIntent param conversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    operationsMocks.prepareOperation.mockResolvedValue({
      actions: [],
      resumeState: {},
      meta: {
        intent: {
          typedData: {},
          submit: { url: "https://test-api.example.com/orders/new", body: {} },
          meta: {},
          approval: {},
        },
      },
    });
  });

  it("uses 24h default expiry when no expiry is provided", async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    const { prepareLimitIntent } = await import("../../src/api/intents.js");
    await prepareLimitIntent({
      fromToken: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      toToken: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      fromAmount: "1000",
      toMinAmount: "500",
      account: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      chainId: 1,
    });

    const call = operationsMocks.prepareOperation.mock.calls[0][0] as Record<string, unknown>;
    const deadline = call.deadline as number;
    // Deadline should be approximately now + 86400 (allow 5s tolerance)
    expect(deadline).toBeGreaterThanOrEqual(nowSec + 86400 - 5);
    expect(deadline).toBeLessThanOrEqual(nowSec + 86400 + 5);
    expect(call.outputLimit).toBe("500");
  });

  it("uses custom expiry when provided", async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    const { prepareLimitIntent } = await import("../../src/api/intents.js");
    await prepareLimitIntent({
      fromToken: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      toToken: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      fromAmount: "1000",
      toMinAmount: "500",
      account: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      chainId: 1,
      expiry: 3600,
    });

    const call = operationsMocks.prepareOperation.mock.calls[0][0] as Record<string, unknown>;
    const deadline = call.deadline as number;
    expect(deadline).toBeGreaterThanOrEqual(nowSec + 3600 - 5);
    expect(deadline).toBeLessThanOrEqual(nowSec + 3600 + 5);
  });
});
