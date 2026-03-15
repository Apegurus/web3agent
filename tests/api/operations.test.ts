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

const goatMocks = vi.hoisted(() => ({
  prepareOrResumeGoatOperation: vi.fn(),
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

vi.mock("../../src/operations/goat.js", () => ({
  prepareOrResumeGoatOperation: (...args: unknown[]) =>
    goatMocks.prepareOrResumeGoatOperation(...args),
}));

describe("generic prepared operations API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setupDefaultOperationMocks({ viemMocks, twapMocks, lifiMocks });
    viemMocks.createPublicClient.mockReturnValue({
      readContract: vi.fn().mockResolvedValue(0n),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", to: null }),
    });
    viemMocks.createClient.mockReturnValue({
      extend: vi.fn().mockReturnValue({
        readContract: vi.fn().mockResolvedValue(7n),
      }),
    });
    lifiMocks.getChains.mockResolvedValue([
      { id: 1 },
      {
        id: 8453,
        permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        permit2Proxy: "0x1111111111111111111111111111111111111111",
        diamondAddress: "0x2222222222222222222222222222222222222222",
      },
    ]);

    const { clearLifiChainsCache } = await import("../../src/api/operations.js");
    clearLifiChainsCache();
  });

  it("prepareOperation builds an Orbs swap operation with approval actions", async () => {
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

    const { prepareOperation } = await import("../../src/api/operations.js");
    const result = await prepareOperation({
      integration: "orbs",
      kind: "swap",
      chainId: 8453,
      fromToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      toToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      inAmount: "1000000000000000000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect("completed" in result).toBe(false);
    if ("completed" in result) return;

    expect(result.actions.map((action) => action.type)).toEqual(["transaction", "transaction"]);
    expect(result.resumeState.integration).toBe("orbs");
    expect(result.meta?.intent).toBeDefined();
  });

  it("resumeOperation submits a signed swap after prerequisites are satisfied", async () => {
    liquidityHubMocks.submitSwap.mockResolvedValue({
      sessionId: "session-1",
      txHash: "0xabc",
      status: "completed",
    });

    const { resumeOperation } = await import("../../src/api/operations.js");
    const result = await resumeOperation({
      resumeState: {
        version: 1,
        integration: "orbs",
        kind: "swap",
        state: {
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
          approvalActions: [],
          signAction: {
            id: "sign-typed-data:0",
            type: "signTypedData",
            label: "Sign swap intent",
            chainId: 8453,
            eip712: {
              domain: {},
              types: {},
              primaryType: "PermitWitnessTransferFrom",
              message: {},
            },
          },
        },
      },
      actionResults: {
        "sign-typed-data:0": {
          type: "signature",
          signature: "0xsigned",
        },
      },
    });

    expect(result).toEqual({
      completed: true,
      integration: "orbs",
      kind: "swap",
      result: {
        sessionId: "session-1",
        txHash: "0xabc",
        status: "completed",
      },
    });
  });

  it("resumeOperation merges persisted GOAT action results on subsequent resumes", async () => {
    goatMocks.prepareOrResumeGoatOperation.mockResolvedValueOnce({
      integration: "goat",
      kind: "tool",
      summary: "Prepared GOAT tool",
      actions: [
        {
          id: "transaction:1",
          type: "transaction",
          label: "Second step",
          tx: {
            to: "0x1111111111111111111111111111111111111111",
            chainId: 8453,
            data: "0xdeadbeef",
            value: "0",
          },
        },
      ],
      resumeState: {
        version: 1,
        integration: "goat",
        kind: "tool",
        state: {
          toolName: "swap_on_balancer",
          params: {},
          chainId: 8453,
          account: "0x1234567890123456789012345678901234567890",
          actionResults: {
            "transaction:0": {
              type: "transaction",
              txHash: "0xapprove",
              status: "confirmed",
            },
          },
        },
      },
    });

    const { resumeOperation } = await import("../../src/api/operations.js");
    await resumeOperation({
      resumeState: {
        version: 1,
        integration: "goat",
        kind: "tool",
        state: {
          toolName: "swap_on_balancer",
          params: {},
          chainId: 8453,
          account: "0x1234567890123456789012345678901234567890",
          actionResults: {
            "transaction:0": {
              type: "transaction",
              txHash: "0xapprove",
              status: "confirmed",
            },
          },
        },
      },
      actionResults: {
        "transaction:1": {
          type: "transaction",
          txHash: "0xswap",
          status: "confirmed",
        },
      },
    });

    expect(goatMocks.prepareOrResumeGoatOperation).toHaveBeenCalledWith({
      input: {
        integration: "goat",
        kind: "tool",
        toolName: "swap_on_balancer",
        params: {},
        chainId: 8453,
        account: "0x1234567890123456789012345678901234567890",
      },
      actionResults: {
        "transaction:0": {
          type: "transaction",
          txHash: "0xapprove",
          status: "confirmed",
        },
        "transaction:1": {
          type: "transaction",
          txHash: "0xswap",
          status: "confirmed",
        },
      },
    });
  });

  it("resumeOperation rejects malformed GOAT resume state values", async () => {
    const { resumeOperation } = await import("../../src/api/operations.js");

    await expect(
      resumeOperation({
        resumeState: {
          version: 1,
          integration: "goat",
          kind: "tool",
          state: {
            toolName: "swap_on_balancer",
            params: {},
            chainId: 8453,
            account: "not-an-address",
            actionResults: {},
          },
        },
      })
    ).rejects.toMatchObject({
      code: "INVALID_PARAMS",
    });

    expect(goatMocks.prepareOrResumeGoatOperation).not.toHaveBeenCalled();
  });

  it("resumeOperation rejects malformed Orbs swap chainId values", async () => {
    const { resumeOperation } = await import("../../src/api/operations.js");

    await expect(
      resumeOperation({
        resumeState: {
          version: 1,
          integration: "orbs",
          kind: "swap",
          state: {
            chainId: "oops",
            quote: {
              sessionId: "session-1",
              inToken: "0x4200000000000000000000000000000000000006",
              outToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              inAmount: "1000000000000000000",
              outAmount: "3200000000",
              minAmountOut: "3100000000",
              user: "0x1234567890123456789012345678901234567890",
            },
            approvalActions: [],
            signAction: {
              id: "sign-typed-data:0",
              type: "signTypedData",
              label: "Sign swap intent",
              chainId: 8453,
              eip712: {
                domain: {},
                types: {},
                primaryType: "PermitWitnessTransferFrom",
                message: {},
              },
            },
          },
        },
        actionResults: {
          "sign-typed-data:0": {
            type: "signature",
            signature: "0xsigned",
          },
        },
      })
    ).rejects.toMatchObject({
      name: "Web3AgentError",
      code: "INVALID_PARAMS",
      message: "resumeState.state.chainId must be an integer",
    });
  });

  it("prepareOperation defaults LI.FI transaction values to zero when omitted", async () => {
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
          symbol: "USDC",
        },
        fromAmount: "1000",
      },
      estimate: {
        approvalAddress: "0x5555555555555555555555555555555555555555",
        toAmount: "999",
        toAmountMin: "990",
        executionDuration: 300,
      },
      transactionRequest: {
        to: "0x6666666666666666666666666666666666666666",
        data: "0xabcdef",
        chainId: 1,
      },
    });

    const { prepareOperation } = await import("../../src/api/operations.js");
    const result = await prepareOperation({
      integration: "lifi",
      kind: "bridge",
      fromChainId: 1,
      toChainId: 8453,
      fromTokenAddress: "0x3333333333333333333333333333333333333333",
      toTokenAddress: "0x4444444444444444444444444444444444444444",
      fromAmount: "1000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect("completed" in result).toBe(false);
    if ("completed" in result) return;

    expect(result.actions).toEqual([
      expect.objectContaining({
        id: "bridge:approval:0",
        type: "transaction",
      }),
    ]);
    const intent = result.meta?.intent as {
      actions: Array<{ id: string; tx?: { value?: string } }>;
    };
    expect(intent.actions.find((action) => action.id === "bridge:execute:0")?.tx?.value).toBe("0");
    expect(lifiMocks.createConfig).toHaveBeenCalledTimes(1);
  });

  it("prepareOperation falls back to approval transactions for unsafe LI.FI permits", async () => {
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
        approvalAddress: "0x5555555555555555555555555555555555555555",
        toAmount: "999",
        toAmountMin: "990",
      },
      transactionRequest: {
        to: "0x6666666666666666666666666666666666666666",
        data: "0xabcdef",
        chainId: 1,
      },
      typedData: [
        {
          primaryType: "Permit",
          domain: {
            chainId: 1,
            name: "USDC",
            verifyingContract: "0x3333333333333333333333333333333333333333",
          },
          types: {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          message: {
            owner: "0x1234567890123456789012345678901234567890",
            spender: "0x5555555555555555555555555555555555555555",
            value: "1000",
            nonce: "1",
            deadline: "9999999999",
          },
        },
      ],
    });

    const { prepareOperation } = await import("../../src/api/operations.js");
    const result = await prepareOperation({
      integration: "lifi",
      kind: "bridge",
      fromChainId: 1,
      toChainId: 8453,
      fromTokenAddress: "0x3333333333333333333333333333333333333333",
      toTokenAddress: "0x4444444444444444444444444444444444444444",
      fromAmount: "1000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect("completed" in result).toBe(false);
    if ("completed" in result) return;

    expect(result.actions).toEqual([
      expect.objectContaining({
        id: "bridge:approval:0",
        type: "transaction",
      }),
    ]);
    const intent = result.meta?.intent as {
      actions: Array<{ id: string; type: string }>;
    };
    expect(intent.actions.map((action) => action.id)).toEqual([
      "bridge:approval:0",
      "bridge:execute:0",
    ]);
  });

  it("resumeOperation advances LI.FI permit2 bridges with only new action results", async () => {
    viemMocks.createPublicClient.mockReturnValue({
      readContract: vi.fn().mockResolvedValue(maxUint256),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    });
    lifiMocks.getQuote.mockResolvedValue({
      action: {
        fromChainId: 8453,
        toChainId: 1,
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
        approvalAddress: "0x5555555555555555555555555555555555555555",
        toAmount: "999",
        toAmountMin: "990",
        executionDuration: 300,
      },
      transactionRequest: {
        to: "0x2222222222222222222222222222222222222222",
        data: "0xabcdef",
        chainId: 8453,
        value: "0",
      },
    });
    lifiMocks.getChains.mockResolvedValue([
      {
        id: 8453,
        permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        permit2Proxy: "0x1111111111111111111111111111111111111111",
        diamondAddress: "0x2222222222222222222222222222222222222222",
      },
      { id: 1 },
    ]);

    const { prepareOperation, resumeOperation } = await import("../../src/api/operations.js");
    const prepared = await prepareOperation({
      integration: "lifi",
      kind: "bridge",
      fromChainId: 8453,
      toChainId: 1,
      fromTokenAddress: "0x3333333333333333333333333333333333333333",
      toTokenAddress: "0x4444444444444444444444444444444444444444",
      fromAmount: "1000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect("completed" in prepared).toBe(false);
    if ("completed" in prepared) return;
    expect(prepared.actions).toEqual([
      expect.objectContaining({
        id: "bridge:permit2:0",
        type: "signTypedData",
      }),
    ]);
    expect(prepared.actions[0]).toMatchObject({
      eip712: {
        primaryType: "PermitWitnessTransferFrom",
        message: {
          witness: {
            diamondAddress: "0x2222222222222222222222222222222222222222",
            diamondCalldataHash: expect.any(String),
          },
        },
      },
    });

    const afterSignature = await resumeOperation({
      resumeState: prepared.resumeState,
      actionResults: {
        "bridge:permit2:0": {
          type: "signature",
          signature: `0x${"11".repeat(65)}`,
        },
      },
    });

    expect(afterSignature.completed).toBe(false);
    if (afterSignature.completed) return;
    expect(afterSignature.operation.actions).toEqual([
      expect.objectContaining({
        id: "bridge:execute:0",
        type: "transaction",
        tx: expect.objectContaining({
          to: "0x1111111111111111111111111111111111111111",
        }),
      }),
    ]);

    const completed = await resumeOperation({
      resumeState: afterSignature.operation.resumeState,
      actionResults: {
        "bridge:execute:0": {
          type: "transaction",
          txHash: "0xbridge",
          status: "confirmed",
        },
      },
    });

    expect(completed).toEqual({
      completed: true,
      integration: "lifi",
      kind: "bridge",
      result: {
        status: "completed",
        message: "Bridge steps executed externally",
        txHash: "0xbridge",
      },
    });
  });

  it("resumeOperation rejects tampered LI.FI witness final actions", async () => {
    viemMocks.createPublicClient.mockReturnValue({
      readContract: vi.fn().mockResolvedValue(maxUint256),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    });
    lifiMocks.getQuote.mockResolvedValue({
      action: {
        fromChainId: 8453,
        toChainId: 1,
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
        approvalAddress: "0x5555555555555555555555555555555555555555",
        toAmount: "999",
        toAmountMin: "990",
      },
      transactionRequest: {
        to: "0x2222222222222222222222222222222222222222",
        data: "0xabcdef",
        chainId: 8453,
      },
    });
    lifiMocks.getChains.mockResolvedValue([
      {
        id: 8453,
        permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        permit2Proxy: "0x1111111111111111111111111111111111111111",
        diamondAddress: "0x2222222222222222222222222222222222222222",
      },
      { id: 1 },
    ]);

    const { prepareOperation, resumeOperation } = await import("../../src/api/operations.js");
    const prepared = await prepareOperation({
      integration: "lifi",
      kind: "bridge",
      fromChainId: 8453,
      toChainId: 1,
      fromTokenAddress: "0x3333333333333333333333333333333333333333",
      toTokenAddress: "0x4444444444444444444444444444444444444444",
      fromAmount: "1000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect("completed" in prepared).toBe(false);
    if ("completed" in prepared) return;

    const tamperedState = prepared.resumeState.state as {
      finalAction: { tx: { to: string; data?: string } };
    };

    await expect(
      resumeOperation({
        resumeState: {
          ...prepared.resumeState,
          state: {
            ...prepared.resumeState.state,
            finalAction: {
              ...tamperedState.finalAction,
              tx: {
                ...tamperedState.finalAction.tx,
                data: "0xfeedface",
              },
            },
          },
        },
        actionResults: {
          "bridge:permit2:0": {
            type: "signature",
            signature: `0x${"11".repeat(65)}`,
          },
        },
      })
    ).rejects.toMatchObject({
      name: "Web3AgentError",
      code: "INVALID_PARAMS",
      message: "resumeState.state.finalAction.tx.data does not match the signed Permit2 witness",
    });
  });

  it("resumeOperation rejects expired LI.FI Permit2 resumptions", async () => {
    viemMocks.createPublicClient.mockReturnValue({
      readContract: vi.fn().mockResolvedValue(maxUint256),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    });
    lifiMocks.getQuote.mockResolvedValue({
      action: {
        fromChainId: 8453,
        toChainId: 1,
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
        approvalAddress: "0x5555555555555555555555555555555555555555",
        toAmount: "999",
        toAmountMin: "990",
      },
      transactionRequest: {
        to: "0x2222222222222222222222222222222222222222",
        data: "0xabcdef",
        chainId: 8453,
      },
    });
    lifiMocks.getChains.mockResolvedValue([
      {
        id: 8453,
        permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        permit2Proxy: "0x1111111111111111111111111111111111111111",
        diamondAddress: "0x2222222222222222222222222222222222222222",
      },
      { id: 1 },
    ]);

    const { prepareOperation, resumeOperation } = await import("../../src/api/operations.js");
    const prepared = await prepareOperation({
      integration: "lifi",
      kind: "bridge",
      fromChainId: 8453,
      toChainId: 1,
      fromTokenAddress: "0x3333333333333333333333333333333333333333",
      toTokenAddress: "0x4444444444444444444444444444444444444444",
      fromAmount: "1000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect("completed" in prepared).toBe(false);
    if ("completed" in prepared) return;

    await expect(
      resumeOperation({
        resumeState: {
          ...prepared.resumeState,
          state: {
            ...prepared.resumeState.state,
            finalization: {
              ...(prepared.resumeState.state as { finalization: Record<string, unknown> })
                .finalization,
              deadline: "1",
            },
          },
        },
        actionResults: {
          "bridge:permit2:0": {
            type: "signature",
            signature: `0x${"11".repeat(65)}`,
          },
        },
      })
    ).rejects.toMatchObject({
      name: "Web3AgentError",
      code: "BRIDGE_INTENT_ERROR",
      message: "Permit2 authorization expired; prepare the bridge again",
    });
  });

  it("resumeOperation rejects reverted confirmed transaction receipts", async () => {
    viemMocks.createPublicClient.mockReturnValue({
      readContract: vi.fn().mockResolvedValue(maxUint256),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "reverted" }),
    });
    lifiMocks.getQuote.mockResolvedValue({
      action: {
        fromChainId: 8453,
        toChainId: 1,
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
        approvalAddress: "0x5555555555555555555555555555555555555555",
        toAmount: "999",
        toAmountMin: "990",
        executionDuration: 300,
      },
      transactionRequest: {
        to: "0x2222222222222222222222222222222222222222",
        data: "0xabcdef",
        chainId: 8453,
        value: "0",
      },
    });
    lifiMocks.getChains.mockResolvedValue([
      {
        id: 8453,
        permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        permit2Proxy: "0x1111111111111111111111111111111111111111",
        diamondAddress: "0x2222222222222222222222222222222222222222",
      },
      { id: 1 },
    ]);

    const { prepareOperation, resumeOperation } = await import("../../src/api/operations.js");
    const prepared = await prepareOperation({
      integration: "lifi",
      kind: "bridge",
      fromChainId: 8453,
      toChainId: 1,
      fromTokenAddress: "0x3333333333333333333333333333333333333333",
      toTokenAddress: "0x4444444444444444444444444444444444444444",
      fromAmount: "1000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect("completed" in prepared).toBe(false);
    if ("completed" in prepared) return;

    const afterSignature = await resumeOperation({
      resumeState: prepared.resumeState,
      actionResults: {
        "bridge:permit2:0": {
          type: "signature",
          signature: `0x${"11".repeat(65)}`,
        },
      },
    });

    expect(afterSignature.completed).toBe(false);
    if (afterSignature.completed) return;

    await expect(
      resumeOperation({
        resumeState: afterSignature.operation.resumeState,
        actionResults: {
          "bridge:execute:0": {
            type: "transaction",
            txHash: "0xbridge",
            status: "confirmed",
          },
        },
      })
    ).rejects.toMatchObject({
      name: "Web3AgentError",
      code: "INVALID_PARAMS",
      message: "Action result bridge:execute:0 must reference a successful confirmed transaction",
    });
  });

  it("clearLifiChainsCache invalidates cached LI.FI chain metadata", async () => {
    viemMocks.createPublicClient.mockReturnValue({
      readContract: vi.fn().mockResolvedValue(maxUint256),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    });
    lifiMocks.getQuote.mockResolvedValue({
      action: {
        fromChainId: 8453,
        toChainId: 1,
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
        approvalAddress: "0x5555555555555555555555555555555555555555",
        toAmount: "999",
        toAmountMin: "990",
      },
      transactionRequest: {
        to: "0x2222222222222222222222222222222222222222",
        data: "0xabcdef",
        chainId: 8453,
      },
    });

    const { clearLifiChainsCache, prepareOperation } = await import("../../src/api/operations.js");

    await prepareOperation({
      integration: "lifi",
      kind: "bridge",
      fromChainId: 8453,
      toChainId: 1,
      fromTokenAddress: "0x3333333333333333333333333333333333333333",
      toTokenAddress: "0x4444444444444444444444444444444444444444",
      fromAmount: "1000",
      account: "0x1234567890123456789012345678901234567890",
    });

    clearLifiChainsCache();

    await prepareOperation({
      integration: "lifi",
      kind: "bridge",
      fromChainId: 8453,
      toChainId: 1,
      fromTokenAddress: "0x3333333333333333333333333333333333333333",
      toTokenAddress: "0x4444444444444444444444444444444444444444",
      fromAmount: "1000",
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(lifiMocks.getChains).toHaveBeenCalledTimes(2);
  });

  it("prepareOperation delegates GOAT tool preparation to the shared GOAT adapter", async () => {
    goatMocks.prepareOrResumeGoatOperation.mockResolvedValue({
      integration: "goat",
      kind: "tool",
      summary: "Prepared GOAT tool",
      actions: [],
      resumeState: {
        version: 1,
        integration: "goat",
        kind: "tool",
        state: {},
      },
    });

    const { prepareOperation } = await import("../../src/api/operations.js");
    const result = await prepareOperation({
      integration: "goat",
      kind: "tool",
      toolName: "erc20_transfer",
      params: { tokenAddress: "0x1" },
      chainId: 8453,
      account: "0x1234567890123456789012345678901234567890",
    });

    expect(goatMocks.prepareOrResumeGoatOperation).toHaveBeenCalledWith({
      input: {
        integration: "goat",
        kind: "tool",
        toolName: "erc20_transfer",
        params: { tokenAddress: "0x1" },
        chainId: 8453,
        account: "0x1234567890123456789012345678901234567890",
      },
    });
    expect("completed" in result).toBe(false);
  });
});
