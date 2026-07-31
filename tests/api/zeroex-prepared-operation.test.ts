import { beforeEach, describe, expect, it, vi } from "vitest";

const viemMocks = vi.hoisted(() => ({ createPublicClient: vi.fn() }));
const zeroExMocks = vi.hoisted(() => ({
  classifyZeroExError: vi.fn(() => ({ fallbackAllowed: false, kind: "unknown" })),
  getZeroExQuote: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: (...args: unknown[]) => viemMocks.createPublicClient(...args),
  };
});

vi.mock("../../src/zerox/client.js", () => ({
  classifyZeroExError: (...args: unknown[]) => zeroExMocks.classifyZeroExError(...args),
  getZeroExQuote: (...args: unknown[]) => zeroExMocks.getZeroExQuote(...args),
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/config/env.js")>();
  return { ...actual, getConfig: () => ({ zeroxApiKey: "test-api-key" }) };
});

const account = "0x1234567890123456789012345678901234567890";
const fromToken = "0x3333333333333333333333333333333333333333";
const toToken = "0x4444444444444444444444444444444444444444";
const allowanceTarget = "0x5555555555555555555555555555555555555555";
const swapTarget = "0x6666666666666666666666666666666666666666";

describe("0x prepared swaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viemMocks.createPublicClient.mockReturnValue({
      getTransaction: vi.fn().mockImplementation(({ hash }: { hash: string }) => {
        if (hash === "0xaaa") {
          return {
            input:
              "0x095ea7b3000000000000000000000000555555555555555555555555555555555555555500000000000000000000000000000000000000000000000000000000000003e8",
            from: account,
            to: fromToken,
            value: 0n,
          };
        }
        return { input: "0xabcdef", from: account, to: swapTarget, value: 0n };
      }),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", to: null }),
    });
    zeroExMocks.getZeroExQuote.mockResolvedValue({
      adapterSource: "native",
      allowance: { amount: "1000", target: allowanceTarget },
      buyAmount: "999",
      capabilityDecisionId: "zeroex-goat-v2-admission-v1",
      capabilityReason: "goat-chain-4663-unavailable",
      chainId: 4663,
      provider: "0x",
      sellAmount: "1000",
      transaction: { data: "0xabcdef", to: swapTarget, value: "0" },
    });
  });

  it("Given the selected native adapter quote, when approval and swap receipts are confirmed, then the external-wallet 0x operation completes", async () => {
    const { prepareOperation, resumeOperation } = await import("../../src/api/operations.js");

    const prepared = await prepareOperation({
      account,
      chainId: 4663,
      fromAmount: "1000",
      fromToken,
      integration: "zeroex",
      kind: "swap",
      toToken,
    });

    expect("completed" in prepared).toBe(false);
    if ("completed" in prepared) return;
    expect(prepared).toMatchObject({
      actions: [
        {
          id: "zeroex:approval:0",
          tx: { chainId: 4663, to: fromToken },
          type: "transaction",
        },
      ],
      integration: "zeroex",
      kind: "swap",
      meta: {
        adapterSource: "native",
        capabilityDecisionId: "zeroex-goat-v2-admission-v1",
        capabilityReason: "goat-chain-4663-unavailable",
        provider: "0x",
      },
    });

    const afterApproval = await resumeOperation({
      actionResults: {
        "zeroex:approval:0": { status: "confirmed", txHash: "0xaaa", type: "transaction" },
      },
      resumeState: prepared.resumeState,
    });

    expect(afterApproval).toMatchObject({
      completed: false,
      operation: {
        actions: [
          {
            id: "zeroex:swap:0",
            tx: { chainId: 4663, data: "0xabcdef", to: swapTarget, value: "0" },
            type: "transaction",
          },
        ],
      },
    });
    if (afterApproval.completed) return;

    await expect(
      resumeOperation({
        actionResults: {
          "zeroex:swap:0": { status: "confirmed", txHash: "0xbbb", type: "transaction" },
        },
        resumeState: afterApproval.operation.resumeState,
      })
    ).resolves.toMatchObject({
      completed: true,
      integration: "zeroex",
      kind: "swap",
      result: { status: "completed", txHash: "0xbbb" },
    });
  });

  it("Given a confirmed approval hash with different live calldata, when resuming, then it rejects before advancing", async () => {
    // Given: the canonical 0x approval action but a transaction hash for different calldata
    viemMocks.createPublicClient.mockReturnValue({
      getTransaction: vi.fn().mockResolvedValue({
        data: "0xdeadbeef",
        from: account,
        to: fromToken,
        value: 0n,
      }),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", to: fromToken }),
    });
    const { prepareOperation, resumeOperation } = await import("../../src/api/operations.js");
    const prepared = await prepareOperation({
      account,
      chainId: 4663,
      fromAmount: "1000",
      fromToken,
      integration: "zeroex",
      kind: "swap",
      toToken,
    });

    // When: a caller reports the tampered transaction as confirmed
    if ("completed" in prepared) return;
    const result = resumeOperation({
      actionResults: {
        "zeroex:approval:0": { status: "confirmed", txHash: "0xaaa", type: "transaction" },
      },
      resumeState: prepared.resumeState,
    });

    // Then: the live transaction payload, not caller-provided facts, gates progress
    await expect(result).rejects.toMatchObject({ code: "INVALID_PARAMS" });
  });

  it("Given a presented final swap and an unavailable quote provider When the transaction is confirmed Then resume completes from persisted facts", async () => {
    zeroExMocks.getZeroExQuote.mockResolvedValueOnce({
      adapterSource: "native",
      buyAmount: "999",
      capabilityDecisionId: "zeroex-goat-v2-admission-v1",
      capabilityReason: "goat-chain-4663-unavailable",
      chainId: 4663,
      provider: "0x",
      sellAmount: "1000",
      transaction: { data: "0xabcdef", to: swapTarget, value: "0" },
    });
    const { prepareOperation, resumeOperation } = await import("../../src/api/operations.js");
    const prepared = await prepareOperation({
      account,
      chainId: 4663,
      fromAmount: "1000",
      fromToken,
      integration: "zeroex",
      kind: "swap",
      toToken,
    });
    if ("completed" in prepared) throw new Error("Expected a prepared 0x operation");
    zeroExMocks.getZeroExQuote.mockRejectedValueOnce(new Error("provider unavailable"));

    const completed = await resumeOperation({
      actionResults: {
        "zeroex:swap:0": { status: "confirmed", txHash: "0xbbb", type: "transaction" },
      },
      resumeState: prepared.resumeState,
    });

    expect(completed).toMatchObject({
      completed: true,
      integration: "zeroex",
      result: { status: "completed", txHash: "0xbbb" },
    });
    expect(zeroExMocks.getZeroExQuote).toHaveBeenCalledTimes(1);
  });
});
