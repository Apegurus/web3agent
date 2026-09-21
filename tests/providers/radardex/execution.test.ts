import type { Address, Hash } from "viem";
import { describe, expect, it, vi } from "vitest";
import { executeRadarDexSwap } from "../../../src/providers/radardex/execution.js";
import { RADARDEX_ARC } from "../../../src/providers/radardex/manifest.js";
import type { RadarRoute } from "../../../src/providers/radardex/schemas.js";

const TOKEN_A = "0x1111111111111111111111111111111111111111" satisfies Address;
const TOKEN_B = "0x2222222222222222222222222222222222222222" satisfies Address;
const ACCOUNT = "0x3333333333333333333333333333333333333333" satisfies Address;
const APPROVAL_HASH = "0xaaaa" satisfies Hash;
const SWAP_HASH = "0xbbbb" satisfies Hash;

function refreshedRoute(): RadarRoute {
  return {
    id: "fresh-v3",
    family: "v3_direct",
    label: "V3",
    fromToken: TOKEN_A,
    toToken: TOKEN_B,
    grossInput: 1_000n,
    netInput: 997n,
    expectedOutput: 2_000n,
    spender: RADARDEX_ARC.routers.v3Fee,
    feeBps: 30,
    executable: true,
    path: [TOKEN_A, TOKEN_B],
    execution: { kind: "v3_direct", poolFee: 500 },
  };
}

function dependencies(allowance: bigint, swapStatus: "success" | "reverted" = "success") {
  const events: string[] = [];
  const publicClient = {
    readContract: vi.fn().mockResolvedValue(allowance),
    simulateContract: vi.fn(async () => {
      events.push("simulate");
      return { request: { account: ACCOUNT } };
    }),
    waitForTransactionReceipt: vi.fn(
      async ({
        hash,
      }: { hash: Hash }): Promise<{
        readonly status: "success" | "reverted";
        readonly to: Address;
      }> =>
        hash === APPROVAL_HASH
          ? { status: "success" as const, to: TOKEN_A }
          : { status: swapStatus, to: RADARDEX_ARC.routers.v3Fee }
    ),
  };
  const walletClient = {
    writeContract: vi.fn(async (request: { functionName: string }) => {
      events.push(request.functionName);
      return request.functionName === "approve" ? APPROVAL_HASH : SWAP_HASH;
    }),
  };
  return { events, publicClient, walletClient };
}

describe("RadarDEX execution", () => {
  it("refreshes, approves the exact amount, simulates, sends, and verifies receipts", async () => {
    // Given
    const deps = dependencies(0n);
    const refreshQuote = vi.fn().mockResolvedValue(refreshedRoute());

    // When
    const result = await executeRadarDexSwap(
      {
        chainId: 5042,
        fromToken: TOKEN_A,
        toToken: TOKEN_B,
        fromAmount: "1000",
        slippageBps: 100,
        account: ACCOUNT,
      },
      { ...deps, refreshQuote }
    );

    // Then
    expect(refreshQuote).toHaveBeenCalledOnce();
    expect(deps.walletClient.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        functionName: "approve",
        args: [RADARDEX_ARC.routers.v3Fee, 1_000n],
      })
    );
    expect(deps.events).toEqual(["approve", "simulate", "swapExactInput"]);
    expect(result.txHash).toBe(SWAP_HASH);
    expect(result.route.expectedOutput).toBe(2_000n);
    expect(result.minimumOutput).toBe(1_980n);
  });

  it("does not approve when allowance is already sufficient", async () => {
    // Given
    const deps = dependencies(1_000n);

    // When
    await executeRadarDexSwap(
      {
        chainId: 5042,
        fromToken: TOKEN_A,
        toToken: TOKEN_B,
        fromAmount: "1000",
        slippageBps: 100,
        account: ACCOUNT,
      },
      { ...deps, refreshQuote: vi.fn().mockResolvedValue(refreshedRoute()) }
    );

    // Then
    expect(deps.events).toEqual(["simulate", "swapExactInput"]);
  });

  it("does not send when simulation fails", async () => {
    // Given
    const deps = dependencies(1_000n);
    deps.publicClient.simulateContract.mockRejectedValue(new Error("reverted"));

    // When / Then
    await expect(
      executeRadarDexSwap(
        {
          chainId: 5042,
          fromToken: TOKEN_A,
          toToken: TOKEN_B,
          fromAmount: "1000",
          slippageBps: 100,
          account: ACCOUNT,
        },
        { ...deps, refreshQuote: vi.fn().mockResolvedValue(refreshedRoute()) }
      )
    ).rejects.toThrow("simulation");
    expect(deps.walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("rejects a reverted swap receipt", async () => {
    // Given
    const deps = dependencies(1_000n, "reverted");

    // When / Then
    await expect(
      executeRadarDexSwap(
        {
          chainId: 5042,
          fromToken: TOKEN_A,
          toToken: TOKEN_B,
          fromAmount: "1000",
          slippageBps: 100,
          account: ACCOUNT,
        },
        { ...deps, refreshQuote: vi.fn().mockResolvedValue(refreshedRoute()) }
      )
    ).rejects.toThrow("receipt");
  });
});
