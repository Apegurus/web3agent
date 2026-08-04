import { beforeEach, describe, expect, it, vi } from "vitest";

const viemMocks = vi.hoisted(() => ({
  getBlockNumber: vi.fn(),
  readContract: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => viemMocks),
  };
});

vi.mock("../../src/config/wallet-factory.js", () => ({
  getTransportForChain: vi.fn(() => vi.fn()),
}));

import type { ZeroExQuote } from "../../src/zerox/client.js";
import { prepareZeroExExecution } from "../../src/zerox/confirmed-execution.js";

const account = "0x1234567890123456789012345678901234567890";
const fromToken = "0x3333333333333333333333333333333333333333";
const allowanceHolder = "0x0000000000001fF3684f28c67538d4D072C22734";
const settler = "0x6666666666666666666666666666666666666666";
const quote = {
  adapterSource: "native" as const,
  allowance: { amount: "1000", target: allowanceHolder },
  buyAmount: "999",
  capabilityDecisionId: "zeroex-goat-v2-admission-v1",
  capabilityReason: "goat-chain-4663-unavailable",
  chainId: 4663,
  provider: "0x" as const,
  sellAmount: "1000",
  transaction: { data: "0xabcdef" as const, to: settler, value: "0" },
} satisfies ZeroExQuote;

describe("canonical 0x prepared execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viemMocks.getBlockNumber.mockResolvedValue(123n);
    viemMocks.readContract.mockImplementation(({ functionName }: { functionName: string }) =>
      Promise.resolve(
        functionName === "ownerOf" ? settler : "0x7777777777777777777777777777777777777777"
      )
    );
  });

  it("rejects an approval target outside the Robinhood AllowanceHolder", async () => {
    await expect(
      prepareZeroExExecution(
        {
          ...quote,
          allowance: {
            amount: "1000",
            target: "0x9999999999999999999999999999999999999999",
          },
        },
        "1000",
        fromToken,
        account
      )
    ).rejects.toMatchObject({ code: "ZEROEX_CONFIRMED_ALLOWANCE_TARGET_MISMATCH" });
  });

  it("rejects a transaction target outside the pinned Settler owners", async () => {
    await expect(
      prepareZeroExExecution(
        {
          ...quote,
          transaction: {
            ...quote.transaction,
            to: "0x9999999999999999999999999999999999999999",
          },
        },
        "1000",
        fromToken,
        account
      )
    ).rejects.toMatchObject({ code: "ZEROEX_CONFIRMED_SETTLER_TARGET_MISMATCH" });
  });

  it("rejects an approval amount larger than the exact sell amount", async () => {
    await expect(
      prepareZeroExExecution(
        { ...quote, allowance: { amount: "1001", target: allowanceHolder } },
        "1000",
        fromToken,
        account
      )
    ).rejects.toMatchObject({ code: "ZEROEX_CONFIRMED_ALLOWANCE_AMOUNT_MISMATCH" });
  });

  it("rejects native value attached to an ERC-20 swap quote", async () => {
    await expect(
      prepareZeroExExecution(
        { ...quote, transaction: { ...quote.transaction, value: "1000" } },
        "1000",
        fromToken,
        account
      )
    ).rejects.toMatchObject({ code: "ZEROEX_CONFIRMED_VALUE_MISMATCH" });
  });

  it("accepts an exact native sell value without an ERC-20 allowance", async () => {
    await expect(
      prepareZeroExExecution(
        {
          ...quote,
          allowance: undefined,
          transaction: { ...quote.transaction, value: "1000" },
        },
        "1000",
        "0x0000000000000000000000000000000000000000",
        account
      )
    ).resolves.toMatchObject({ transaction: { value: "1000" } });
  });

  it("accepts the current Settler without requiring a previous deployment", async () => {
    viemMocks.readContract.mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === "prev") throw new Error("NoInstance");
      return Promise.resolve(settler);
    });

    await expect(prepareZeroExExecution(quote, "1000", fromToken, account)).resolves.toMatchObject({
      settler: { owner: settler },
    });
    expect(viemMocks.readContract).toHaveBeenCalledTimes(1);
  });
});
