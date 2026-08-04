import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
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
const permit2Proxy = "0x8eABB4E117fB70b346592e013855f6d825F50af1";
const diamond = "0xB477751B76CF82d00a686A1232f5fCD772414Af3";
const approvalData = encodeFunctionData({
  abi: erc20Abi,
  functionName: "approve",
  args: [permit2, maxUint256],
});

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
      approvalAddress: permit2,
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
        input: approvalData,
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
    lifiMocks.setAllowance.mockResolvedValue(approvalData);
    configureSameChainQuote();
    const { clearLifiChainsCache } = await import("../../src/api/operations.js");
    clearLifiChainsCache();
  });

  it("Given a Robinhood route requiring Permit2, when actions are confirmed in order, then the same-chain swap completes", async () => {
    const { resumeOperation } = await import("../../src/api/operations.js");
    const { prepareLifiSameChainSwapOperation } = await import(
      "../../src/api/operations/lifi-same-chain.js"
    );

    const prepared = await prepareLifiSameChainSwapOperation({
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
        input: approvalData,
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
    ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
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
    expect(lifiMocks.getQuote).toHaveBeenCalledTimes(3);
  });

  it("rejects a provider quote whose token path differs from the requested fallback", async () => {
    lifiMocks.getQuote.mockResolvedValueOnce({
      action: {
        fromAmount: "1000",
        fromChainId: 4663,
        fromToken: { address: fromToken, symbol: "USDG" },
        toChainId: 4663,
        toToken: { address: "0x9999999999999999999999999999999999999999", symbol: "BAD" },
      },
      estimate: { approvalAddress: permit2, toAmount: "999", toAmountMin: "990" },
      transactionRequest: { chainId: 4663, data: "0xabcdef", to: diamond, value: "0" },
    });
    const { prepareLifiSameChainSwapOperation } = await import(
      "../../src/api/operations/lifi-same-chain.js"
    );

    await expect(
      prepareLifiSameChainSwapOperation({
        account,
        fromAmount: "1000",
        fromChainId: 4663,
        fromToken,
        integration: "lifi",
        kind: "swap",
        toChainId: 4663,
        toToken,
      })
    ).rejects.toMatchObject({ code: "LIFI_ROUTE_AUTHORITY_MISMATCH" });
    expect(lifiMocks.setAllowance).not.toHaveBeenCalled();
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
    const { resumeOperation } = await import("../../src/api/operations.js");
    const { prepareLifiSameChainSwapOperation } = await import(
      "../../src/api/operations/lifi-same-chain.js"
    );
    const prepared = await prepareLifiSameChainSwapOperation({
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

    const result = resumeOperation({ actionResults: {}, resumeState: tamperedResumeState });

    await expect(result).rejects.toMatchObject({ code: "INVALID_PARAMS" });
  });

  it("Given a caller-tampered direct action and a matching historical receipt, when resuming, then it rejects false settlement", async () => {
    viemMocks.createPublicClient.mockReturnValue({
      getTransaction: vi.fn().mockResolvedValue({
        from: account,
        input: "0xdeadbeef",
        to: "0x9999999999999999999999999999999999999999",
        value: 0n,
      }),
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        to: "0x9999999999999999999999999999999999999999",
      }),
      readContract: vi.fn().mockResolvedValue(maxUint256),
    });
    lifiMocks.getQuote.mockResolvedValueOnce({
      action: {
        fromAmount: "1000",
        fromChainId: 4663,
        fromToken: { address: fromToken, symbol: "USDG" },
        toChainId: 4663,
        toToken: { address: toToken, symbol: "WETH" },
      },
      estimate: { approvalAddress: diamond, skipPermit: true, toAmount: "999", toAmountMin: "990" },
      transactionRequest: { chainId: 4663, data: "0xabcdef", to: diamond, value: "0" },
    });
    const { resumeOperation } = await import("../../src/api/operations.js");
    const { prepareLifiSameChainSwapOperation } = await import(
      "../../src/api/operations/lifi-same-chain.js"
    );
    const prepared = await prepareLifiSameChainSwapOperation({
      account,
      fromAmount: "1000",
      fromChainId: 4663,
      fromToken,
      integration: "lifi",
      kind: "swap",
      toChainId: 4663,
      toToken,
    });
    if ("completed" in prepared) throw new Error("Expected a prepared LI.FI operation");

    const result = resumeOperation({
      actionResults: {
        "bridge:execute:0": { status: "confirmed", txHash: "0xbbb", type: "transaction" },
      },
      resumeState: {
        ...prepared.resumeState,
        state: {
          ...prepared.resumeState.state,
          finalAction: {
            id: "bridge:execute:0",
            label: "Historical attacker transaction",
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
      },
    });

    await expect(result).rejects.toMatchObject({ code: "INVALID_PARAMS" });
  });

  it("Given a presented direct LI.FI transaction and provider outage When it confirms Then resume uses persisted transaction facts", async () => {
    viemMocks.createPublicClient.mockReturnValue({
      getTransaction: vi.fn().mockResolvedValue({
        from: account,
        input: "0xabcdef",
        to: diamond,
        value: 0n,
      }),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", to: diamond }),
      readContract: vi.fn().mockResolvedValue(maxUint256),
    });
    lifiMocks.getQuote.mockResolvedValueOnce({
      action: {
        fromAmount: "1000",
        fromChainId: 4663,
        fromToken: { address: fromToken, symbol: "USDG" },
        toChainId: 4663,
        toToken: { address: toToken, symbol: "WETH" },
      },
      estimate: { approvalAddress: diamond, skipPermit: true, toAmount: "999", toAmountMin: "990" },
      transactionRequest: { chainId: 4663, data: "0xabcdef", to: diamond, value: "0" },
    });
    const { resumeOperation } = await import("../../src/api/operations.js");
    const { prepareLifiSameChainSwapOperation } = await import(
      "../../src/api/operations/lifi-same-chain.js"
    );
    const prepared = await prepareLifiSameChainSwapOperation({
      account,
      fromAmount: "1000",
      fromChainId: 4663,
      fromToken,
      integration: "lifi",
      kind: "swap",
      toChainId: 4663,
      toToken,
    });
    if ("completed" in prepared) throw new Error("Expected a prepared LI.FI operation");
    lifiMocks.getQuote.mockRejectedValueOnce(new Error("provider unavailable"));

    const completed = await resumeOperation({
      actionResults: {
        "bridge:execute:0": { status: "confirmed", txHash: "0xbbb", type: "transaction" },
      },
      resumeState: prepared.resumeState,
    });

    expect(completed).toMatchObject({ completed: true, result: { txHash: "0xbbb" } });
    expect(lifiMocks.getQuote).toHaveBeenCalledTimes(1);
  });
});
