import { encodeAbiParameters, isHex, keccak256, toBytes } from "viem";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import { hexSchema } from "../../src/api/schemas/common.js";
import { decodeUniswapV4ReceiptEvents } from "../../src/uniswap-v4/reconcile-receipt.js";
import {
  compareUniswapV4ExpectedDeltas,
  simulateUniswapV4Stages,
} from "../../src/uniswap-v4/reconcile.js";

const APPROVAL = {
  data: fixtureHex("0x095ea7b3"),
  id: "uniswap-v4:mint:0",
  kind: "erc20Approval" as const,
  to: "0x2222222222222222222222222222222222222222" as const,
  value: "0",
};

const POSITION_MANAGER = {
  data: fixtureHex("0x1234"),
  id: "uniswap-v4:mint:1",
  kind: "positionManager" as const,
  to: "0x3333333333333333333333333333333333333333" as const,
  value: "0",
};

function fixtureHex(value: string): Hex {
  const parsed = hexSchema.parse(value);
  if (!isHex(parsed, { strict: true })) throw new Error("fixture value must be hex");
  return parsed;
}

describe("Uniswap v4 stage simulation", () => {
  it("Given an approval-required stateless RPC, when simulating ordered stages, then blocks PositionManager without reporting full success", async () => {
    const result = await simulateUniswapV4Stages({
      actions: [APPROVAL, POSITION_MANAGER],
      backend: {
        simulate: async () => ({
          balanceChanges: [],
          balanceChangesSource: "fallback" as const,
          gasEstimate: "52000",
          success: true as const,
        }),
      },
    });

    expect(result).toMatchObject({
      success: false,
      stages: [
        { id: APPROVAL.id, status: "succeeded" },
        {
          blockedBy: APPROVAL.id,
          id: POSITION_MANAGER.id,
          status: "blocked_by_prerequisite",
        },
      ],
    });
  });

  it("Given a stateful fork applying an approval, when simulating the sequence, then simulates the final PositionManager stage", async () => {
    const result = await simulateUniswapV4Stages({
      actions: [APPROVAL, POSITION_MANAGER],
      backend: {
        applyPriorStage: async () => true,
        simulate: async (stage) => ({
          balanceChanges: [],
          balanceChangesSource: stage.id === POSITION_MANAGER.id ? "trace" : "fallback",
          gasEstimate: "52000",
          success: true as const,
        }),
      },
    });

    expect(result).toMatchObject({
      success: true,
      stages: [
        { id: APPROVAL.id, status: "succeeded" },
        {
          balanceChangesSource: "trace",
          id: POSITION_MANAGER.id,
          status: "succeeded",
        },
      ],
    });
  });

  it("Given partial actual deltas with an out-of-range observed token delta, when reconciling planner bounds, then reports a mismatch without inventing unavailable values", () => {
    const comparison = compareUniswapV4ExpectedDeltas({
      actual: {
        kind: "increase",
        liquidityDelta: {
          reason: "receipt did not emit a matching liquidity event",
          status: "unavailable",
        },
        nativeValueDelta: { reason: "native balance includes gas", status: "unavailable" },
        token0Delta: { status: "available", value: "-101" },
        token1Delta: { status: "available", value: "-1" },
      },
      expected: {
        kind: "increase",
        liquidityDelta: "1",
        nativeValueDelta: "0",
        token0Delta: "-1",
        token0Max: "-1",
        token0Min: "-100",
        token1Delta: "-1",
      },
    });

    expect(comparison).toEqual({
      matchesExpected: false,
      mismatches: ["token0Delta -101 is outside expected range [-100, -1]"],
      status: "mismatched",
      unavailable: ["liquidityDelta", "nativeValueDelta"],
    });
  });
});

describe("Uniswap v4 receipt lifecycle decoding", () => {
  it("Given a PositionManager receipt with a pool-scoped modification and NFT mint, when decoded, then retains both lifecycle facts without inventing a PoolId for Transfer", () => {
    const poolId = `0x${"bb".repeat(32)}` as const;
    const positionManager = "0x3333333333333333333333333333333333333333" as const;
    const account = "0x1111111111111111111111111111111111111111" as const;
    const zero = "0x0000000000000000000000000000000000000000" as const;
    const tokenIdTopic = `0x${"01".padStart(64, "0")}` as const;
    const senderTopic = `0x${account.slice(2).padStart(64, "0")}` as const;
    const poolIdTopic = poolId;
    const transferTopic = keccak256(toBytes("Transfer(address,address,uint256)"));
    const modifyTopic = keccak256(
      toBytes("ModifyPosition(bytes32,address,int24,int24,int256,bytes32)")
    );
    const modifyData = encodeAbiParameters(
      [
        { name: "tickLower", type: "int24" },
        { name: "tickUpper", type: "int24" },
        { name: "liquidityDelta", type: "int256" },
        { name: "salt", type: "bytes32" },
      ],
      [-60, 60, 10n, `0x${"00".repeat(32)}`]
    );

    const events = decodeUniswapV4ReceiptEvents({
      deployment: { poolManager: "0x4444444444444444444444444444444444444444", positionManager },
      logs: [
        {
          address: positionManager,
          blockNumber: 2n,
          data: modifyData,
          logIndex: 0,
          topics: [modifyTopic, poolIdTopic, senderTopic],
          transactionHash: `0x${"cc".repeat(32)}`,
          transactionIndex: 0,
        },
        {
          address: positionManager,
          blockNumber: 2n,
          data: "0x",
          logIndex: 1,
          topics: [
            transferTopic,
            `0x${zero.slice(2).padStart(64, "0")}`,
            senderTopic,
            tokenIdTopic,
          ],
          transactionHash: `0x${"cc".repeat(32)}`,
          transactionIndex: 0,
        },
      ],
      poolId,
      tokenId: "1",
    });

    expect(events).toEqual([
      expect.objectContaining({ kind: "positionModify", liquidityDelta: "10" }),
      expect.objectContaining({
        action: "mint",
        kind: "positionLifecycle",
        poolAssociation: { kind: "unassociated", reason: "erc721-transfer-does-not-emit-pool-id" },
        tokenId: "1",
      }),
    ]);
  });
});
