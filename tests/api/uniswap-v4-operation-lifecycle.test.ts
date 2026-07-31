import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT,
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
  getRuntime: vi.fn(),
  prepareExternalPlan: vi.fn(),
  verifyTransaction: vi.fn(),
  acceptSignature: vi.fn(),
  reconcileConfirmedReceipt: vi.fn(),
}));
vi.mock("../../src/api/shared.js", () => ({
  getRuntime: (...args: unknown[]) => mocks.getRuntime(...args),
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
vi.mock("../../src/uniswap-v4/reconcile-confirmed.js", () => ({
  assertUniswapV4ReconciliationComplete: () => undefined,
  reconcileUniswapV4ConfirmedReceipt: (...args: unknown[]) =>
    mocks.reconcileConfirmedReceipt(...args),
}));
vi.mock("../../src/operations/chain-access.js", () => ({
  createPublicClientForRuntimeChain: () => ({
    getTransactionReceipt: () => Promise.resolve({}),
  }),
}));
import { prepareOperation } from "../../src/api/operations.js";
import {
  prepareUniswapV4Operation,
  resumeUniswapV4Operation,
} from "../../src/api/operations/uniswap-v4.js";

function requirePending(result: Awaited<ReturnType<typeof resumeUniswapV4Operation>>) {
  if (result.completed) throw new Error("expected pending operation");
  return result.operation;
}

describe("Uniswap v4 walletless lifecycle happy flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRuntime.mockResolvedValue({});
    mocks.prepareExternalPlan.mockImplementation(async (input: { readonly kind: LifecycleKind }) =>
      plan(input.kind, input.kind === "burn")
    );
    mocks.reconcileConfirmedReceipt.mockResolvedValue({
      expectedDeltas: { kind: "mint" },
      postState: {
        pool: { status: "available" },
        position: { status: "available" },
      },
    });
  });
  it("Given an uninitialized SDK process When preparing a lifecycle Then initializes the managed runtime before planning", async () => {
    await prepareOperation({ integration: "uniswap-v4", ...operation("collect") });

    expect(mocks.getRuntime).toHaveBeenCalledTimes(1);
    expect(mocks.getRuntime.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prepareExternalPlan.mock.invocationCallOrder[0] ?? 0
    );
  });
  it.each([
    ["mint", false, "transaction"],
    ["increase", false, "transaction"],
    ["decrease", false, "transaction"],
    ["collect", false, "transaction"],
    ["burn", true, "signTypedData"],
  ] as const)(
    "Given a %s plan When prepared Then emits only its first safe stage",
    async (kind, delegated, type) => {
      mocks.prepareExternalPlan.mockResolvedValueOnce(plan(kind, delegated));
      const prepared = await prepareUniswapV4Operation(operation(kind));
      expect(prepared.actions).toHaveLength(1);
      expect(prepared.actions[0]?.type).toBe(type);
    }
  );
  it.each([
    ["mint", false],
    ["increase", false],
    ["decrease", false],
    ["collect", false],
    ["burn", true],
  ] as const)(
    "Given a %s lifecycle When each canonical action is confirmed Then it completes without accepting replay",
    async (kind, delegated) => {
      mocks.acceptSignature.mockResolvedValue({
        signer: delegated ? TOKEN : ACCOUNT,
        transaction: {
          data: "0xcafe",
          dataHash: HASH,
          to: delegated ? POSITION_MANAGER : PERMIT2,
          value: "0",
        },
        typedDataHash: HASH,
      });
      let current = await prepareUniswapV4Operation(operation(kind));
      let replayState = current.resumeState;
      for (let stage = 0; stage < 4; stage += 1) {
        const action = current.actions[0];
        if (!action) throw new Error("fixture lifecycle must expose a next action");
        const result = await resumeUniswapV4Operation(replayState, {
          [action.id]:
            action.type === "transaction"
              ? { status: "confirmed", txHash: `0x${stage + 1}`, type: "transaction" }
              : { signature: `0x${"11".repeat(65)}`, type: "signature" },
        });
        if (result.completed) {
          expect(result.kind).toBe(kind);
          await expect(resumeUniswapV4Operation(replayState, {})).resolves.toMatchObject({
            completed: false,
          });
          return;
        }
        replayState = result.operation.resumeState;
        current = result.operation;
      }
      throw new Error("fixture lifecycle did not complete in its canonical stage budget");
    }
  );
  it("Given mint approval and Permit2 signature When resumed Then the derived calldata is response-only", async () => {
    mocks.acceptSignature.mockResolvedValueOnce({
      signer: ACCOUNT,
      transaction: { data: "0xcafe", dataHash: HASH, to: PERMIT2, value: "0" },
      typedDataHash: HASH,
    });
    const prepared = await prepareUniswapV4Operation(operation("mint"));
    const approval = await resumeUniswapV4Operation(prepared.resumeState, {
      "uniswap-v4:mint:0": { status: "confirmed", txHash: "0xaaa", type: "transaction" },
    });
    const signed = await resumeUniswapV4Operation(requirePending(approval).resumeState, {
      "uniswap-v4:mint:1": { signature: `0x${"11".repeat(65)}`, type: "signature" },
    });
    expect(JSON.stringify(requirePending(signed).resumeState.state)).not.toContain("0xcafe");
  });
});
