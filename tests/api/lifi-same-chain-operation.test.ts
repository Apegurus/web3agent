import { maxUint256 } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const viemMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createPublicClient: vi.fn(),
  recoverTypedDataAddress: vi.fn(),
}));

const lifiMocks = vi.hoisted(() => ({
  convertQuoteToRoute: vi.fn(),
  createConfig: vi.fn(),
  EVM: vi.fn((provider: unknown) => ({ provider })),
  getChains: vi.fn(),
  getQuote: vi.fn(),
  setAllowance: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createClient: (...args: unknown[]) => viemMocks.createClient(...args),
    createPublicClient: (...args: unknown[]) => viemMocks.createPublicClient(...args),
    recoverTypedDataAddress: (...args: unknown[]) => viemMocks.recoverTypedDataAddress(...args),
  };
});

vi.mock("@lifi/sdk", () => ({
  EVM: lifiMocks.EVM,
  convertQuoteToRoute: lifiMocks.convertQuoteToRoute,
  createConfig: lifiMocks.createConfig,
  getChains: lifiMocks.getChains,
  getQuote: lifiMocks.getQuote,
  setAllowance: lifiMocks.setAllowance,
}));

const account = "0x1234567890123456789012345678901234567890";
const fromToken = "0x3333333333333333333333333333333333333333";
const toToken = "0x4444444444444444444444444444444444444444";
const permit2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const permit2Proxy = "0x1111111111111111111111111111111111111111";
const diamond = "0x2222222222222222222222222222222222222222";

function configureSameChainQuote(): void {
  lifiMocks.getChains.mockResolvedValue([
    {
      diamondAddress: diamond,
      id: 4663,
      permit2,
      permit2Proxy,
    },
  ]);
  lifiMocks.getQuote.mockResolvedValue({
    action: {
      fromAmount: "1000",
      fromChainId: 4663,
      fromToken: { address: fromToken, symbol: "USDG" },
      toChainId: 4663,
      toToken: { address: toToken, symbol: "WETH" },
    },
    estimate: {
      approvalAddress: "0x5555555555555555555555555555555555555555",
      toAmount: "999",
      toAmountMin: "990",
    },
    transactionRequest: {
      chainId: 4663,
      data: "0xabcdef",
      to: diamond,
      value: "0",
    },
  });
}

describe("LI.FI prepared same-chain swaps", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    viemMocks.recoverTypedDataAddress.mockResolvedValue(account);
    viemMocks.createPublicClient.mockReturnValue({
      getTransaction: vi.fn().mockResolvedValue({
        from: account,
        input: "0x095ea7b3",
        to: fromToken,
        value: 0n,
      }),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", to: null }),
      readContract: vi.fn().mockResolvedValue(0n),
    });
    viemMocks.createClient.mockReturnValue({
      extend: vi.fn().mockReturnValue({ readContract: vi.fn().mockResolvedValue(9n) }),
    });
    lifiMocks.convertQuoteToRoute.mockImplementation((quote: Record<string, unknown>) => ({
      steps: [{ transactionRequest: quote.transactionRequest }],
    }));
    lifiMocks.setAllowance.mockResolvedValue("0x095ea7b3");
    configureSameChainQuote();
    const { clearLifiChainsCache } = await import("../../src/api/operations.js");
    clearLifiChainsCache();
  });

  it("Given a Robinhood route requiring Permit2, when actions are confirmed in order, then the same-chain swap completes", async () => {
    const { prepareOperation, resumeOperation } = await import("../../src/api/operations.js");

    const prepared = await prepareOperation({
      account,
      fromAmount: "1000",
      fromChainId: 4663,
      fromToken,
      integration: "lifi",
      kind: "swap",
      toChainId: 4663,
      toToken,
    });

    expect("completed" in prepared).toBe(false);
    if ("completed" in prepared) return;
    expect(prepared).toMatchObject({
      actions: [{ id: "bridge:approval:0", type: "transaction" }],
      integration: "lifi",
      kind: "swap",
      meta: {
        provider: "lifi",
      },
      resumeState: { version: 1 },
    });

    viemMocks.createPublicClient.mockReturnValue({
      getTransaction: vi.fn().mockResolvedValue({
        from: account,
        input: "0x095ea7b3",
        to: fromToken,
        value: 0n,
      }),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", to: null }),
      readContract: vi.fn().mockResolvedValue(maxUint256),
    });
    const afterApproval = await resumeOperation({
      actionResults: {
        "bridge:approval:0": { status: "confirmed", txHash: "0xaaa", type: "transaction" },
      },
      resumeState: prepared.resumeState,
    });

    expect(afterApproval).toMatchObject({
      completed: false,
      operation: {
        actions: [{ id: "bridge:permit2:0", type: "signTypedData" }],
        integration: "lifi",
        kind: "swap",
      },
    });
    if (afterApproval.completed) return;

    const postApprovalState = afterApproval.operation.resumeState.state as {
      finalAction: { tx: Record<string, unknown> };
    };
    await expect(
      resumeOperation({
        actionResults: {
          "bridge:permit2:0": { signature: `0x${"11".repeat(65)}`, type: "signature" },
        },
        resumeState: {
          ...afterApproval.operation.resumeState,
          state: {
            ...afterApproval.operation.resumeState.state,
            finalAction: {
              ...postApprovalState.finalAction,
              tx: { ...postApprovalState.finalAction.tx, value: "100" },
            },
          },
        },
      })
    ).rejects.toMatchObject({
      code: "INVALID_PARAMS",
      message: "LI.FI Permit2 transaction facts do not match the canonical replanned action",
    });
    const afterPermit = await resumeOperation({
      actionResults: {
        "bridge:permit2:0": { signature: `0x${"11".repeat(65)}`, type: "signature" },
      },
      resumeState: afterApproval.operation.resumeState,
    });

    expect(afterPermit).toMatchObject({
      completed: false,
      operation: {
        actions: [
          {
            id: "bridge:execute:0",
            tx: { chainId: 4663, to: permit2Proxy, value: "0" },
            type: "transaction",
          },
        ],
      },
    });
    if (afterPermit.completed) return;

    const finalAction = afterPermit.operation.actions[0];
    if (finalAction?.type !== "transaction") return;
    expect(afterPermit.operation.resumeState.state.actionResults).not.toHaveProperty(
      "bridge:permit2:0"
    );
    expect(JSON.stringify(afterPermit.operation.resumeState.state)).not.toContain("11".repeat(65));
    viemMocks.createClient.mockReturnValue({
      extend: vi.fn().mockReturnValue({
        readContract: vi.fn().mockResolvedValue(10n),
      }),
    });
    viemMocks.createPublicClient.mockReturnValue({
      getTransaction: vi.fn().mockResolvedValue({
        from: account,
        input: finalAction.tx.data,
        to: permit2Proxy,
        value: 0n,
      }),
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValueOnce({ status: "success", to: null })
        .mockResolvedValue({ status: "success", to: permit2Proxy }),
      readContract: vi.fn().mockResolvedValue(maxUint256),
    });

    await expect(
      resumeOperation({
        actionResults: {
          "bridge:execute:0": { status: "confirmed", txHash: "0xbbb", type: "transaction" },
        },
        resumeState: afterPermit.operation.resumeState,
      })
    ).resolves.toMatchObject({
      completed: true,
      integration: "lifi",
      kind: "swap",
      result: { status: "completed", txHash: "0xbbb" },
    });
    expect(lifiMocks.getQuote).toHaveBeenCalledTimes(5);
  });

  it("Given a caller-tampered same-chain resume action, when resuming, then it rebuilds the canonical LI.FI transaction before surfacing it", async () => {
    viemMocks.createPublicClient.mockReturnValue({
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", to: null }),
      readContract: vi.fn().mockResolvedValue(maxUint256),
    });
    lifiMocks.getQuote.mockResolvedValue({
      action: {
        fromAmount: "1000",
        fromChainId: 4663,
        fromToken: { address: fromToken, symbol: "USDG" },
        toChainId: 4663,
        toToken: { address: toToken, symbol: "WETH" },
      },
      estimate: {
        approvalAddress: diamond,
        skipPermit: true,
        toAmount: "999",
        toAmountMin: "990",
      },
      transactionRequest: { chainId: 4663, data: "0xabcdef", to: diamond, value: "0" },
    });
    const { prepareOperation, resumeOperation } = await import("../../src/api/operations.js");
    const prepared = await prepareOperation({
      account,
      fromAmount: "1000",
      fromChainId: 4663,
      fromToken,
      integration: "lifi",
      kind: "swap",
      toChainId: 4663,
      toToken,
    });
    if ("completed" in prepared) throw new Error("Expected a prepared operation");
    const tamperedResumeState = {
      ...prepared.resumeState,
      state: {
        ...prepared.resumeState.state,
        finalAction: {
          id: "bridge:execute:0",
          label: "Execute attacker transaction",
          tx: {
            chainId: 4663,
            data: "0xdeadbeef",
            from: account,
            to: "0x9999999999999999999999999999999999999999",
            value: "0",
          },
          type: "transaction",
        },
        finalization: { kind: "none" },
        stages: [],
      },
    };

    const result = await resumeOperation({ actionResults: {}, resumeState: tamperedResumeState });

    expect(result).toMatchObject({
      completed: false,
      operation: { actions: [{ tx: { data: "0xabcdef", to: diamond } }] },
    });
  });
});
