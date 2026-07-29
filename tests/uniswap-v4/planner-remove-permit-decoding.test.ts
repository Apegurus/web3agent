import { V4PositionManager } from "@uniswap/v4-sdk";
import { decodeAbiParameters } from "viem";
import { describe, expect, it } from "vitest";

import type {
  UniswapV4BurnOperation,
  UniswapV4CollectOperation,
  UniswapV4DecreaseOperation,
} from "../../src/api/types.js";
import { planUniswapV4Remove } from "../../src/uniswap-v4/index.js";
import { OWNER, createFixtureReader, deployment, poolKey, sourceBlock } from "./state-fixtures.js";

const DELEGATE = "0x4444444444444444444444444444444444444444" as const;
const HOOK_DATA = "0x1234" as const;
const SIGNATURE = `0x${"11".repeat(65)}` as const;

describe("Uniswap v4 delegated remove calldata", () => {
  it("Given a delegated collect with hook data, when encoding, then prepends permit and preserves the exact hook bytes", async () => {
    const { pool, position } = await fixture();
    const plan = planUniswapV4Remove({
      account: DELEGATE,
      deployment,
      nftPermit: permit(),
      nftPermitNonce: 9n,
      operation: collect(),
      pool,
      position,
    });

    const calls = multicallCalls(plan.actions[0]?.data);
    expect(permitFields(calls[0])).toEqual({
      deadline: "2000000000",
      nonce: "9",
      spender: DELEGATE,
      tokenId: "42",
    });
    expect(hookData(calls[1])).toBe(HOOK_DATA);
  });

  it("Given delegated partial, full, and burn removals, when encoding, then each prepends permit before modifyLiquidities", async () => {
    const { pool, position } = await fixture();
    const operations = [decrease(2500), decrease(10_000), burn()] as const;

    for (const operation of operations) {
      const plan = planUniswapV4Remove({
        account: DELEGATE,
        deployment,
        nftPermit: permit(),
        nftPermitNonce: 9n,
        operation,
        pool,
        position,
      });
      const calls = multicallCalls(plan.actions[0]?.data);

      expect(V4PositionManager.INTERFACE.parseTransaction({ data: calls[0] })?.name).toBe("permit");
      expect(V4PositionManager.INTERFACE.parseTransaction({ data: calls[1] })?.name).toBe(
        "modifyLiquidities"
      );
      expect(hookData(calls[1])).toBe(HOOK_DATA);
    }
  });

  it("Given owner-authorized removals, when encoding, then emits no unnecessary permit multicall", async () => {
    const { pool, position } = await fixture();
    const operations = [collect(OWNER), decrease(2500, OWNER), burn(OWNER)] as const;

    for (const operation of operations) {
      const plan = planUniswapV4Remove({ account: OWNER, deployment, operation, pool, position });
      const parsed = V4PositionManager.INTERFACE.parseTransaction({ data: plan.actions[0]?.data });

      expect(parsed?.name).toBe("modifyLiquidities");
    }
  });
});

async function fixture() {
  const reader = createFixtureReader();
  return {
    pool: await reader.readPoolSnapshot({ poolKey, sourceBlock }),
    position: await reader.readPositionSnapshot({ poolKey, sourceBlock, tokenId: "42" }),
  };
}

function permit() {
  return {
    deadline: 2000000000n,
    domain: {
      chainId: 4663,
      name: "Uniswap V4 Positions NFT" as const,
      verifyingContract: deployment.positionManager,
    },
    nonce: 9n,
    signature: SIGNATURE,
    spender: DELEGATE,
    tokenId: 42n,
  };
}

function collect(account: `0x${string}` = DELEGATE): UniswapV4CollectOperation {
  return {
    account,
    chainId: 4663,
    deadline: "2000000000",
    hookData: HOOK_DATA,
    kind: "collect",
    poolKey,
    recipient: account,
    slippageBps: 100,
    sourceBlock,
    tokenId: "42",
  };
}

function decrease(
  liquidityBps: number,
  account: `0x${string}` = DELEGATE
): UniswapV4DecreaseOperation {
  return {
    account,
    amount0Min: "0",
    amount1Min: "0",
    chainId: 4663,
    deadline: "2000000000",
    hookData: HOOK_DATA,
    kind: "decrease",
    liquidity: "77",
    liquidityBps,
    poolKey,
    recipient: account,
    slippageBps: 100,
    sourceBlock,
    tokenId: "42",
  };
}

function burn(account: `0x${string}` = DELEGATE): UniswapV4BurnOperation {
  return {
    ...decrease(10_000, account),
    kind: "burn",
  };
}

function multicallCalls(data: `0x${string}` | undefined): readonly `0x${string}`[] {
  if (data === undefined) throw new Error("Expected PositionManager calldata");
  const outer = V4PositionManager.INTERFACE.parseTransaction({ data });
  if (outer === null || outer.name !== "multicall" || !Array.isArray(outer.args[0])) {
    throw new Error("Expected permit multicall");
  }
  return outer.args[0] as readonly `0x${string}`[];
}

function hookData(data: `0x${string}`): `0x${string}` {
  const transaction = V4PositionManager.INTERFACE.parseTransaction({ data });
  if (transaction === null || transaction.name !== "modifyLiquidities") {
    throw new Error("Expected modifyLiquidities calldata");
  }
  const [actions, parameters] = decodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    transaction.args[0]
  );
  const parameter = parameters[0];
  if (parameter === undefined) throw new Error("Expected a lifecycle action parameter");
  if (actions.startsWith("0x01")) {
    const [, , , , decodedHookData] = decodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "bytes" },
      ],
      parameter
    );
    return decodedHookData;
  }
  if (actions.startsWith("0x03")) {
    const [, , , decodedHookData] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "uint128" }, { type: "uint128" }, { type: "bytes" }],
      parameter
    );
    return decodedHookData;
  }
  throw new Error("Expected decrease or burn lifecycle action");
}

function permitFields(data: `0x${string}`) {
  const transaction = V4PositionManager.INTERFACE.parseTransaction({ data });
  if (transaction === null || transaction.name !== "permit") {
    throw new Error("Expected permit calldata");
  }
  return {
    deadline: transaction.args[2].toString(),
    nonce: transaction.args[3].toString(),
    spender: String(transaction.args[0]),
    tokenId: transaction.args[1].toString(),
  };
}
