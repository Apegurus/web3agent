import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { planUniswapV4Add } from "../../src/uniswap-v4/index.js";
import { createFixtureReader, deployment, poolKey, sourceBlock } from "./state-fixtures.js";

const ACCOUNT = "0x5555555555555555555555555555555555555555" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;
const erc20ApprovalAbi = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

describe("Uniswap v4 add planner approval action", () => {
  it("Given a native/ERC-20 mint with insufficient ERC-20 approval, when planning, then orders approval, Permit2 signature, and PositionManager transaction", async () => {
    const reader = createFixtureReader();
    const pool = await reader.readPoolSnapshot({ poolKey, sourceBlock });

    const plan = planUniswapV4Add({
      account: ACCOUNT,
      allowances: [
        {
          erc20Amount: 0n,
          permit2: { amount: 0n, expiration: 0n, nonce: 7n },
          sourceBlock,
          token: TOKEN,
        },
      ],
      deployment,
      operation: {
        account: ACCOUNT,
        amount0Max: "100",
        amount1Max: "100",
        chainId: 4663,
        createPool: false,
        deadline: "2000000000",
        hookData: "0x",
        kind: "mint",
        liquidity: "10",
        poolKey,
        slippageBps: 100,
        sourceBlock,
        tickLower: -120,
        tickUpper: 120,
      },
      pool,
    });

    expect(plan.actions.map((action) => action.kind)).toEqual([
      "erc20Approval",
      "permit2Signature",
      "positionManager",
    ]);
    expect(plan.actions[0]).toMatchObject({ spender: deployment.permit2, token: TOKEN });
    const approval = plan.actions[0];
    if (approval?.kind !== "erc20Approval") {
      throw new Error("Expected ERC-20 approval");
    }
    expect(decodeFunctionData({ abi: erc20ApprovalAbi, data: approval.data })).toMatchObject({
      args: [deployment.permit2, approval.amount],
      functionName: "approve",
    });
    expect(plan.actions[1]).toMatchObject({
      domain: { chainId: 4663, name: "Permit2", verifyingContract: deployment.permit2 },
      kind: "permit2Signature",
    });
    expect(plan.actions[2]).toMatchObject({
      kind: "positionManager",
      to: deployment.positionManager,
      value: 1n,
    });
  });
});
