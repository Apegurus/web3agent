import { beforeEach, describe, expect, it, vi } from "vitest";

import { plan } from "../api/uniswap-v4-lifecycle-fixtures.js";

const boundaries = vi.hoisted(() => ({
  balances: vi.fn(),
  decode: vi.fn(),
  readPoolSnapshot: vi.fn(),
  readPositionSnapshot: vi.fn(),
}));

vi.mock("../../src/uniswap-v4/client.js", () => ({
  createUniswapV4ReadClient: vi.fn(() => ({})),
}));
vi.mock("../../src/uniswap-v4/state.js", () => ({
  createUniswapV4StateReader: vi.fn(() => ({
    readPoolSnapshot: boundaries.readPoolSnapshot,
    readPositionSnapshot: boundaries.readPositionSnapshot,
  })),
}));
vi.mock("../../src/uniswap-v4/reconcile-balances.js", () => ({
  observeUniswapV4TokenBalances: (...args: unknown[]) => boundaries.balances(...args),
}));
vi.mock("../../src/uniswap-v4/reconcile-receipt.js", () => ({
  decodeUniswapV4ReceiptEvents: (...args: unknown[]) => boundaries.decode(...args),
}));

import {
  assertUniswapV4ReconciliationComplete,
  reconcileUniswapV4ConfirmedReceipt,
} from "../../src/uniswap-v4/reconcile-confirmed.js";

const HASH = `0x${"cc".repeat(32)}` as const;

function receipt(status: "success" | "reverted" = "success") {
  return {
    blockHash: `0x${"dd".repeat(32)}` as const,
    blockNumber: 2n,
    logs: [],
    status,
    to: plan("mint").deployment.positionManager,
    transactionHash: HASH,
  };
}

function availableBalances(token0 = "0", token1 = "0") {
  return [
    { currency: "currency0" as const, value: { status: "available" as const, value: token0 } },
    { currency: "currency1" as const, value: { status: "available" as const, value: token1 } },
  ];
}

describe("reconcileUniswapV4ConfirmedReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundaries.decode.mockReturnValue([
      { kind: "modifyLiquidity", liquidityDelta: "1" },
      { action: "mint", kind: "positionLifecycle", tokenId: "1" },
    ]);
    boundaries.balances.mockResolvedValue(availableBalances());
    boundaries.readPoolSnapshot.mockResolvedValue({ liquidity: "1" });
    boundaries.readPositionSnapshot.mockResolvedValue({ liquidity: "1" });
  });

  it.each(["mint", "increase", "decrease", "collect", "burn"] as const)(
    "Given a %s receipt, when the real reconciler observes boundary fakes, then it preserves decoded lifecycle events and receipt-block reads",
    async (kind) => {
      const result = await reconcileUniswapV4ConfirmedReceipt({
        plan: plan(kind, kind === "burn"),
        receipt: receipt(),
      });

      expect(result.decodedEvents).toEqual(boundaries.decode.mock.results[0]?.value);
      expect(boundaries.readPoolSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceBlock: { blockHash: receipt().blockHash, blockNumber: "2", chainId: 4663 },
        })
      );
      if (kind === "burn") {
        expect(result.postState.position).toMatchObject({ status: "unavailable" });
      } else {
        expect(boundaries.readPositionSnapshot).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceBlock: { blockHash: receipt().blockHash, blockNumber: "2", chainId: 4663 },
          })
        );
      }
    }
  );

  it("Given a reverted final receipt, when reconciled, then rejects before external state reads", async () => {
    await expect(
      reconcileUniswapV4ConfirmedReceipt({ plan: plan("mint"), receipt: receipt("reverted") })
    ).rejects.toMatchObject({
      code: "UNISWAP_V4_RECEIPT_REVERTED",
    });
    expect(boundaries.readPoolSnapshot).not.toHaveBeenCalled();
  });

  it("Given partial balance observations, when reconciled, then preserves unavailable deltas instead of zeroing them", async () => {
    boundaries.balances.mockResolvedValue([
      { currency: "currency0", value: { reason: "rpc unavailable", status: "unavailable" } },
      { currency: "currency1", value: { status: "available", value: "0" } },
    ]);

    const result = await reconcileUniswapV4ConfirmedReceipt({
      plan: plan("mint"),
      receipt: receipt(),
    });

    expect(result.actualDeltas.token0Delta).toEqual({
      reason: "rpc unavailable",
      status: "unavailable",
    });
    expect(result.matchesExpected.status).toBe("unavailable");
  });

  it("Given expected delta bounds, when observed values are inside then outside the range, then reports match then mismatch", async () => {
    const bounded = plan("mint");
    const within = {
      ...bounded,
      expectedDeltas: { ...bounded.expectedDeltas, token0Max: "1", token0Min: "-1" },
    };
    const matching = await reconcileUniswapV4ConfirmedReceipt({ plan: within, receipt: receipt() });
    boundaries.balances.mockResolvedValue(availableBalances("2"));
    const mismatching = await reconcileUniswapV4ConfirmedReceipt({
      plan: within,
      receipt: receipt(),
    });

    expect(matching.matchesExpected.status).toBe("unavailable");
    expect(mismatching.matchesExpected).toMatchObject({
      matchesExpected: false,
      status: "mismatched",
    });
  });

  it("Given unavailable canonical pool or position post-state, when completion is asserted, then blocks completion", async () => {
    boundaries.readPoolSnapshot.mockRejectedValueOnce(new Error("pool read failed"));
    const poolUnavailable = await reconcileUniswapV4ConfirmedReceipt({
      plan: plan("mint"),
      receipt: receipt(),
    });
    boundaries.readPositionSnapshot.mockRejectedValueOnce(new Error("position read failed"));
    const positionUnavailable = await reconcileUniswapV4ConfirmedReceipt({
      plan: plan("increase"),
      receipt: receipt(),
    });

    expect(() => assertUniswapV4ReconciliationComplete(poolUnavailable)).toThrow("pool state");
    expect(() => assertUniswapV4ReconciliationComplete(positionUnavailable)).toThrow(
      "position state"
    );
  });
});
