import { maxUint256 } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const viemMocks = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
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
  convertQuoteToRoute: vi.fn(),
}));

const goatMocks = vi.hoisted(() => ({
  prepareOrResumeGoatOperation: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: (...args: unknown[]) => viemMocks.createPublicClient(...args),
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
  convertQuoteToRoute: (...args: unknown[]) => lifiMocks.convertQuoteToRoute(...args),
}));

vi.mock("../../src/operations/goat.js", () => ({
  prepareOrResumeGoatOperation: (...args: unknown[]) =>
    goatMocks.prepareOrResumeGoatOperation(...args),
}));

describe("generic prepared operations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viemMocks.createPublicClient.mockReturnValue({
      readContract: vi.fn().mockResolvedValue(0n),
    });
    twapMocks.getSrcTokenChunkAmount.mockReturnValue("200");
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

  it("resumeOperation keeps a bridge operation pending until all tx actions are provided", async () => {
    const { resumeOperation } = await import("../../src/api/operations.js");
    const result = await resumeOperation({
      resumeState: {
        version: 1,
        integration: "lifi",
        kind: "bridge",
        state: {
          summary: "Bridge",
          actions: [
            {
              id: "bridge:0",
              type: "transaction",
              label: "Approve bridge spender",
              tx: {
                to: "0x1111111111111111111111111111111111111111",
                chainId: 1,
                data: "0xaaaa",
                value: "0",
              },
            },
            {
              id: "bridge:1",
              type: "transaction",
              label: "Execute bridge",
              tx: {
                to: "0x2222222222222222222222222222222222222222",
                chainId: 1,
                data: "0xbbbb",
                value: "100",
              },
            },
          ],
        },
      },
      actionResults: {
        "bridge:0": {
          type: "transaction",
          txHash: "0xapprove",
        },
      },
    });

    expect(result.completed).toBe(false);
    if (result.completed) return;
    expect(result.operation.actions).toHaveLength(1);
    expect(result.operation.actions[0]?.id).toBe("bridge:1");
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
