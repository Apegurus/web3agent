import { readFile } from "node:fs/promises";

import { URVersion, V4BaseActionsParser, V4PositionManager } from "@uniswap/v4-sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { UniswapV4PoolKey } from "../../src/api/types.js";
import { buildPositionManagerCalldata } from "../../src/uniswap-v4/sdk-adapter-api.js";

const ZERO_ADDRESS: `0x${string}` = "0x0000000000000000000000000000000000000000";
const DAI: `0x${string}` = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC: `0x${string}` = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const RECIPIENT: `0x${string}` = "0x0000000000000000000000000000000000000003";
const transactionSchema = z.object({ calldata: z.string(), value: z.string() });
const fixtureSchema = z.object({
  transactions: z.object({
    mint: transactionSchema,
    increase: transactionSchema,
    decrease: transactionSchema,
    collect: transactionSchema,
    burn: transactionSchema,
  }),
});
const poolKey = {
  currency0: {
    kind: "erc20" as const,
    chainId: 1,
    address: DAI,
    symbol: "DAI",
    name: "DAI Stablecoin",
    decimals: 18,
  },
  currency1: {
    kind: "erc20" as const,
    chainId: 1,
    address: USDC,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  fee: 500,
  tickSpacing: 10,
  hooks: ZERO_ADDRESS,
} satisfies UniswapV4PoolKey;
const position = {
  poolKey,
  sqrtPriceX96: 79228162514264337593543n,
  liquidity: 99999999999999999976n,
  tickCurrent: -276325,
  tickLower: -276340,
  tickUpper: -276300,
  slippageBps: 100,
  deadline: 123n,
  recipient: RECIPIENT,
};

function decimal(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return value.toString();
  if (value !== null && typeof value === "object") return value.toString();
  throw new Error("official V4 action parameter was not serializable");
}

function decode(calldata: string, value: string) {
  const outer = V4PositionManager.INTERFACE.parseTransaction({ data: calldata });
  if (outer === null || outer.name !== "modifyLiquidities") {
    throw new Error("fixture must invoke PositionManager.modifyLiquidities");
  }
  const unlockData = outer.args[0];
  const deadline = outer.args[1];
  if (typeof unlockData !== "string") throw new Error("modifyLiquidities unlockData was not bytes");

  return {
    deadline: decimal(deadline),
    nativeValue: BigInt(value).toString(),
    actions: V4BaseActionsParser.parseCalldata(unlockData, URVersion.V2_0).actions.map(
      (action) => ({
        name: action.actionName,
        params: Object.fromEntries(
          action.params.map((param) => [param.name, decimal(param.value)])
        ),
      })
    ),
  };
}

function action(decoded: ReturnType<typeof decode>, name: string) {
  const result = decoded.actions.find((candidate) => candidate.name === name);
  if (result === undefined) throw new Error(`missing official action ${name}`);
  return result.params;
}

function transactionFor(kind: keyof z.infer<typeof fixtureSchema>["transactions"]) {
  switch (kind) {
    case "mint":
      return buildPositionManagerCalldata({ kind, ...position });
    case "increase":
      return buildPositionManagerCalldata({ kind, ...position, tokenId: 1n });
    case "decrease":
      return buildPositionManagerCalldata({ kind, ...position, tokenId: 1n, liquidityBps: 2500 });
    case "collect":
      return buildPositionManagerCalldata({ kind, ...position, tokenId: 1n });
    case "burn":
      return buildPositionManagerCalldata({ kind, ...position, tokenId: 1n, liquidityBps: 10000 });
  }
}

describe("Uniswap v4 official lifecycle action decode", () => {
  it("Given static lifecycle bytes When parsing official action schemas Then meaningful action fields match the production adapter", async () => {
    const fixture = fixtureSchema.parse(
      JSON.parse(await readFile(new URL("fixtures/sdk-vectors.json", import.meta.url), "utf8"))
    );

    for (const kind of ["mint", "increase", "decrease", "collect", "burn"] as const) {
      const expected = decode(
        fixture.transactions[kind].calldata,
        fixture.transactions[kind].value
      );
      const actualTransaction = transactionFor(kind);
      const actual = decode(actualTransaction.calldata, actualTransaction.value.toString());

      expect(actual).toEqual(expected);
      expect(actual.deadline).toBe("123");
      expect(actual.nativeValue).toBe("0");
    }

    const mint = decode(fixture.transactions.mint.calldata, fixture.transactions.mint.value);
    expect(action(mint, "MINT_POSITION")).toMatchObject({
      tickLower: "-276340",
      tickUpper: "-276300",
      liquidity: "99999999999999999976",
      amount0Max: "199949777670523732150261",
      amount1Max: "200030298425",
      owner: RECIPIENT,
      hookData: "0x",
    });

    const increase = decode(
      fixture.transactions.increase.calldata,
      fixture.transactions.increase.value
    );
    expect(action(increase, "INCREASE_LIQUIDITY")).toMatchObject({
      tokenId: "1",
      liquidity: "99999999999999999976",
      amount0Max: "199949777670523732150261",
      amount1Max: "200030298425",
      hookData: "0x",
    });

    const decrease = decode(
      fixture.transactions.decrease.calldata,
      fixture.transactions.decrease.value
    );
    expect(action(decrease, "DECREASE_LIQUIDITY")).toMatchObject({
      tokenId: "1",
      liquidity: "24999999999999999994",
      hookData: "0x",
    });
    expect(action(decrease, "DECREASE_LIQUIDITY").amount0Min).toMatch(/^\d+$/);
    expect(action(decrease, "DECREASE_LIQUIDITY").amount1Min).toMatch(/^\d+$/);

    const collect = decode(
      fixture.transactions.collect.calldata,
      fixture.transactions.collect.value
    );
    expect(action(collect, "DECREASE_LIQUIDITY")).toMatchObject({
      tokenId: "1",
      liquidity: "0",
      amount0Min: "0",
      amount1Min: "0",
      hookData: "0x",
    });
    expect(action(collect, "TAKE_PAIR").recipient).toBe(RECIPIENT);

    const burn = decode(fixture.transactions.burn.calldata, fixture.transactions.burn.value);
    expect(action(burn, "BURN_POSITION")).toMatchObject({ tokenId: "1", hookData: "0x" });
    expect(action(burn, "BURN_POSITION").amount0Min).toMatch(/^\d+$/);
    expect(action(burn, "BURN_POSITION").amount1Min).toMatch(/^\d+$/);
    expect(action(burn, "TAKE_PAIR").recipient).toMatch(/^0x[0-9a-f]{40}$/i);
  });
});
