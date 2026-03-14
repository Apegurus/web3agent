import { encodeFunctionData, numberToHex, parseAbi } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: (...args: unknown[]) => clientMocks.createPublicClient(...args),
  };
});

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function padTopic(address: string): `0x${string}` {
  return `0x${address.toLowerCase().slice(2).padStart(64, "0")}`;
}

describe("simulateTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("uses debug_traceCall when available and resolves balance changes", async () => {
    clientMocks.createPublicClient.mockReturnValue({
      estimateGas: vi.fn().mockResolvedValue(145000n),
      request: vi.fn().mockResolvedValue({
        from: "0x1234567890123456789012345678901234567890",
        to: "0x4200000000000000000000000000000000000006",
        value: "0xde0b6b3a7640000",
        logs: [
          {
            address: BASE_USDC,
            topics: [
              TRANSFER_TOPIC,
              padTopic("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
              padTopic("0x1234567890123456789012345678901234567890"),
            ],
            data: numberToHex(3200000000n, { size: 32 }),
          },
        ],
      }),
      call: vi.fn(),
    });

    const { simulateTransaction } = await import("../../src/api/simulation.js");
    const result = await simulateTransaction({
      chainId: 8453,
      from: "0x1234567890123456789012345678901234567890",
      to: "0x4200000000000000000000000000000000000006",
      data: "0xdeadbeef",
      value: "1000000000000000000",
    });

    expect(result.success).toBe(true);
    expect(result.gasEstimate).toBe("145000");
    expect(result.balanceChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
          symbol: "ETH",
          direction: "out",
          amount: "1000000000000000000",
        }),
        expect.objectContaining({
          token: BASE_USDC,
          symbol: "USDC",
          decimals: 6,
          direction: "in",
          amount: "3200000000",
        }),
      ])
    );
  });

  it("falls back to static decoding and caches missing debug_traceCall support", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("Method not found"))
      .mockRejectedValue(new Error("should not be called twice"));
    const call = vi.fn().mockResolvedValue({ data: "0x" });

    clientMocks.createPublicClient.mockReturnValue({
      estimateGas: vi.fn().mockResolvedValue(52000n),
      request,
      call,
    });

    const transferData = encodeFunctionData({
      abi: parseAbi(["function transfer(address to, uint256 amount)"]),
      functionName: "transfer",
      args: ["0x9999999999999999999999999999999999999999", 123n],
    });

    const { simulateTransaction } = await import("../../src/api/simulation.js");

    const first = await simulateTransaction({
      chainId: 8453,
      from: "0x1234567890123456789012345678901234567890",
      to: BASE_USDC,
      data: transferData,
    });
    const second = await simulateTransaction({
      chainId: 8453,
      from: "0x1234567890123456789012345678901234567890",
      to: BASE_USDC,
      data: transferData,
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(2);
    expect(first.balanceChanges).toEqual([
      {
        token: BASE_USDC,
        symbol: "USDC",
        decimals: 6,
        amount: "123",
        direction: "out",
      },
    ]);
    expect(second.balanceChanges).toEqual(first.balanceChanges);
  });

  it("returns null token metadata when the token is unknown", async () => {
    clientMocks.createPublicClient.mockReturnValue({
      estimateGas: vi.fn().mockResolvedValue(30000n),
      request: vi.fn().mockRejectedValue(new Error("Method not found")),
      call: vi.fn().mockResolvedValue({ data: "0x" }),
    });

    const transferData = encodeFunctionData({
      abi: parseAbi(["function transfer(address to, uint256 amount)"]),
      functionName: "transfer",
      args: ["0x9999999999999999999999999999999999999999", 42n],
    });

    const { simulateTransaction } = await import("../../src/api/simulation.js");
    const result = await simulateTransaction({
      chainId: 8453,
      from: "0x1234567890123456789012345678901234567890",
      to: "0x1111111111111111111111111111111111111111",
      data: transferData,
    });

    expect(result.balanceChanges).toEqual([
      {
        token: "0x1111111111111111111111111111111111111111",
        symbol: null,
        decimals: null,
        amount: "42",
        direction: "out",
      },
    ]);
  });

  it("throws SIMULATION_REVERT when estimateGas reverts", async () => {
    clientMocks.createPublicClient.mockReturnValue({
      estimateGas: vi.fn().mockRejectedValue(new Error("execution reverted: bad swap")),
      request: vi.fn(),
      call: vi.fn(),
    });

    const { simulateTransaction } = await import("../../src/api/simulation.js");

    await expect(
      simulateTransaction({
        chainId: 8453,
        from: "0x1234567890123456789012345678901234567890",
        to: BASE_USDC,
        data: "0xdeadbeef",
      })
    ).rejects.toMatchObject({
      name: "Web3AgentError",
      code: "SIMULATION_REVERT",
      message: "execution reverted: bad swap",
    });
  });
});
