import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HASH,
  type LifecycleKind,
  PERMIT2,
  POSITION_MANAGER,
  TOKEN,
  operation,
  plan,
} from "./uniswap-v4-lifecycle-fixtures.js";

const mocks = vi.hoisted(() => ({
  assertPostTransactionState: vi.fn(),
  prepareExternalPlan: vi.fn(),
  verifyTransaction: vi.fn(),
  acceptSignature: vi.fn(),
}));
vi.mock("../../src/tools/uniswap-v4/write-planner.js", () => ({
  prepareExternalUniswapV4WritePlan: (...args: unknown[]) => mocks.prepareExternalPlan(...args),
}));
vi.mock("../../src/api/operations/uniswap-v4-signature-validation.js", () => ({
  acceptSignature: (...args: unknown[]) => mocks.acceptSignature(...args),
  nftPermitTypedData: () => ({ domain: {}, message: {}, primaryType: "Permit", types: {} }),
  permitTypedData: () => ({ domain: {}, message: {}, primaryType: "PermitBatch", types: {} }),
}));
vi.mock("../../src/api/operations/uniswap-v4-transaction-verification.js", () => ({
  assertPostTransactionState: (...args: unknown[]) => mocks.assertPostTransactionState(...args),
  verifyTransaction: (...args: unknown[]) => mocks.verifyTransaction(...args),
}));
vi.mock("../../src/uniswap-v4/deployments.js", () => ({
  getUniswapV4Deployment: () => ({
    chainId: 4663,
    permit2: PERMIT2,
    poolManager: "0x4444444444444444444444444444444444444444",
    positionManager: POSITION_MANAGER,
    stateView: "0x5555555555555555555555555555555555555555",
  }),
}));
import {
  prepareUniswapV4Operation,
  resumeUniswapV4Operation,
} from "../../src/api/operations/uniswap-v4.js";
function requirePending(result: Awaited<ReturnType<typeof resumeUniswapV4Operation>>) {
  if (result.completed) throw new Error("expected pending operation");
  return result.operation;
}

describe("Uniswap v4 walletless lifecycle state forgery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareExternalPlan.mockImplementation(async (input: { readonly kind: LifecycleKind }) =>
      plan(input.kind, input.kind === "burn")
    );
  });
  it("Given forged progress When resuming Then rejects before completion", async () => {
    const prepared = await prepareUniswapV4Operation(operation("collect"));
    const forged = {
      ...prepared.resumeState,
      state: {
        ...prepared.resumeState.state,
        progress: {
          completed: {
            "uniswap-v4:collect:0": {
              dataHash: HASH,
              kind: "transaction",
              to: POSITION_MANAGER,
              txHash: "0xdeadbeef",
              value: "0",
            },
          },
          nextActionIndex: 999,
        },
      },
    };
    await expect(resumeUniswapV4Operation(forged, {})).rejects.toMatchObject({
      code: "INVALID_PARAMS",
      message: "Uniswap v4 resume progress index is outside the canonical action sequence",
    });
  });
  it("Given forged persisted typed-data acceptance When resuming without its canonical transaction Then rejects unchanged", async () => {
    const prepared = await prepareUniswapV4Operation(operation("mint"));
    const forged = {
      ...prepared.resumeState,
      state: {
        ...prepared.resumeState.state,
        progress: {
          completed: {
            "uniswap-v4:mint:0": {
              dataHash: HASH,
              kind: "transaction",
              to: TOKEN,
              txHash: "0xdeadbeef",
              value: "0",
            },
            "uniswap-v4:mint:1": {
              kind: "typedDataAccepted",
              signer: TOKEN,
              typedDataHash: HASH,
            },
          },
          nextActionIndex: 2,
        },
      },
    };

    await expect(resumeUniswapV4Operation(forged, {})).rejects.toMatchObject({
      code: "INVALID_PARAMS",
    });
  });
  it("Given an interrupted or foreign result When resuming Then preserves the canonical next stage", async () => {
    mocks.acceptSignature.mockResolvedValueOnce({
      signer: TOKEN,
      transaction: { data: "0xcafe", dataHash: HASH, to: POSITION_MANAGER, value: "0" },
      typedDataHash: HASH,
    });
    const prepared = await prepareUniswapV4Operation(operation("burn"));
    expect(
      requirePending(await resumeUniswapV4Operation(prepared.resumeState, {})).actions[0]?.id
    ).toBe("uniswap-v4:burn:0");
    await expect(
      resumeUniswapV4Operation(prepared.resumeState, {
        replay: { status: "confirmed", txHash: "0xaaa", type: "transaction" },
      })
    ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
  });
  it("Given an NFT signature When resuming Then omits mutable derived transaction facts", async () => {
    mocks.acceptSignature.mockResolvedValueOnce({
      signer: TOKEN,
      transaction: { data: "0xcafe", dataHash: HASH, to: POSITION_MANAGER, value: "0" },
      typedDataHash: HASH,
    });
    const prepared = await prepareUniswapV4Operation(operation("burn"));
    const signed = requirePending(
      await resumeUniswapV4Operation(prepared.resumeState, {
        "uniswap-v4:burn:0": { signature: `0x${"11".repeat(65)}`, type: "signature" },
      })
    );
    expect(signed.resumeState.state.progress).not.toHaveProperty("derivedTransactions");
    const action = signed.actions[0];
    if (!action || action.type !== "transaction")
      throw new Error("NFT signature must return a transaction action");
    expect(action.tx.to).toBe(POSITION_MANAGER);
  });
});
