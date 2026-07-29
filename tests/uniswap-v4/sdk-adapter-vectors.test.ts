import { readFile } from "node:fs/promises";

import { decodeAbiParameters, decodeFunctionData, parseAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { uniswapV4CalculationSchema, uniswapV4PoolIdentitySchema } from "../../src/api/schemas.js";
import type { UniswapV4PoolKey } from "../../src/api/types.js";
import {
  buildPermit2Batch,
  buildPositionManagerCalldata,
  getPoolIdentity,
  getPositionAmounts,
} from "../../src/uniswap-v4/sdk-adapter-api.js";

const ZERO_ADDRESS: `0x${string}` = "0x0000000000000000000000000000000000000000";
const DAI: `0x${string}` = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC: `0x${string}` = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const RECIPIENT: `0x${string}` = "0x0000000000000000000000000000000000000003";
const transactionSchema = z.object({
  calldata: z.string().regex(/^0x[0-9a-f]+$/i),
  value: z.string(),
});
const fixtureSchema = z.object({
  provenance: z.object({
    package: z.literal("@uniswap/v4-sdk"),
    version: z.literal("2.3.0"),
    gitHead: z.literal("ab3a18a62922c0bda493130e53f2c8f6fad59558"),
    integrityReference: z.literal(
      "sha512-aMsDxVFjnwxjWeX8lXJy+4SRPgllfEU05SJ6CRsiPOeqBMd9RHxvb0RXF4q42wNG/iKoUVg9O2q6s5uoRDXPrQ=="
    ),
    generatorSha256: z.string().length(64),
  }),
  poolId: z.string().regex(/^0x[0-9a-f]{64}$/i),
  position: z.object({ mintMaximum: z.object({ amount0: z.string(), amount1: z.string() }) }),
  permit2: z.object({
    permit: z.object({
      spender: z.string(),
      sigDeadline: z.string(),
      details: z.array(
        z.object({
          token: z.string(),
          amount: z.string(),
          expiration: z.string(),
          nonce: z.string(),
        })
      ),
    }),
  }),
  transactions: z.object({
    create: transactionSchema,
    mint: transactionSchema,
    increase: transactionSchema,
    decrease: transactionSchema,
    collect: transactionSchema,
    burn: transactionSchema,
  }),
});

const positionManagerAbi = [
  {
    type: "function",
    name: "modifyLiquidities",
    stateMutability: "payable",
    inputs: [
      { name: "unlockData", type: "bytes" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
const plannerParameters = parseAbiParameters("bytes actions, bytes[] params");
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
const positionInput = {
  poolKey,
  sqrtPriceX96: 79228162514264337593543n,
  liquidity: 99999999999999999976n,
  tickCurrent: -276325,
  tickLower: -276340,
  tickUpper: -276300,
  slippageBps: 100,
};

async function loadFixture(): Promise<z.infer<typeof fixtureSchema>> {
  return fixtureSchema.parse(
    JSON.parse(await readFile(new URL("fixtures/sdk-vectors.json", import.meta.url), "utf8"))
  );
}

function transactionFor(kind: keyof z.infer<typeof fixtureSchema>["transactions"]) {
  const common = { ...positionInput, deadline: 123n, recipient: RECIPIENT };
  switch (kind) {
    case "create":
      return buildPositionManagerCalldata({
        kind,
        poolKey,
        sqrtPriceX96: positionInput.sqrtPriceX96,
      });
    case "mint":
      return buildPositionManagerCalldata({ kind, ...common });
    case "increase":
      return buildPositionManagerCalldata({ kind, ...common, tokenId: 1n });
    case "decrease":
      return buildPositionManagerCalldata({ kind, ...common, tokenId: 1n, liquidityBps: 2500 });
    case "collect":
      return buildPositionManagerCalldata({ kind, ...common, tokenId: 1n });
    case "burn":
      return buildPositionManagerCalldata({ kind, ...common, tokenId: 1n, liquidityBps: 10000 });
  }
}

function decodeLifecycle(calldata: string): {
  readonly actions: string;
  readonly deadline: bigint;
  readonly parameterCount: number;
} {
  const decoded = decodeFunctionData({ abi: positionManagerAbi, data: calldata as `0x${string}` });
  if (decoded.functionName !== "modifyLiquidities") {
    throw new Error("lifecycle fixture must call PositionManager.modifyLiquidities");
  }
  const [unlockData, deadline] = decoded.args;
  const [actions, parameters] = decodeAbiParameters(plannerParameters, unlockData);
  return { actions, deadline, parameterCount: parameters.length };
}

describe("Uniswap v4 SDK adapter static vectors", () => {
  it("Given static pinned-SDK Permit2 facts When adapting the position Then it returns exact bigint-only values", async () => {
    const fixture = await loadFixture();
    const actual = buildPermit2Batch({
      ...positionInput,
      spender: RECIPIENT,
      nonce: 7n,
      deadline: 123n,
    });

    expect(actual).toEqual({
      spender: fixture.permit2.permit.spender,
      sigDeadline: BigInt(fixture.permit2.permit.sigDeadline),
      details: fixture.permit2.permit.details.map((detail) => ({
        token: detail.token,
        amount: BigInt(detail.amount),
        expiration: BigInt(detail.expiration),
        nonce: BigInt(detail.nonce),
      })),
    });
  });

  it("Given static lifecycle bytes When the production adapter builds every capability Then every calldata byte and value matches", async () => {
    const fixture = await loadFixture();

    for (const kind of ["create", "mint", "increase", "decrease", "collect", "burn"] as const) {
      expect(transactionFor(kind)).toEqual({
        calldata: fixture.transactions[kind].calldata,
        value: BigInt(fixture.transactions[kind].value),
      });
    }
  });

  it("Given static lifecycle calldata When decoding expected and actual sequences Then deadline, actions, and parameter count retain meaning", async () => {
    const fixture = await loadFixture();

    for (const kind of ["mint", "increase", "decrease", "collect", "burn"] as const) {
      const expected = decodeLifecycle(fixture.transactions[kind].calldata);
      const actual = decodeLifecycle(transactionFor(kind).calldata);

      expect(expected).toEqual(actual);
      expect(actual.deadline).toBe(123n);
      expect(actual.actions).toMatch(/^0x[0-9a-f]+$/i);
      expect(actual.parameterCount).toBeGreaterThan(0);
    }
  });

  it("Given adapter results When serializing through public output schemas Then no SDK values escape", async () => {
    const fixture = await loadFixture();
    const identity = uniswapV4PoolIdentitySchema.parse(getPoolIdentity(poolKey));
    const amounts = getPositionAmounts({ ...positionInput, slippageBps: 0 });
    const calculation = uniswapV4CalculationSchema.parse({
      kind: "liquidityAmounts",
      liquidity: positionInput.liquidity.toString(),
      amount0: amounts.mintMaximum.amount0.toString(),
      amount1: amounts.mintMaximum.amount1.toString(),
    });

    expect(identity.poolId).toBe(fixture.poolId);
    expect(calculation).toEqual({
      kind: "liquidityAmounts",
      liquidity: "99999999999999999976",
      amount0: fixture.position.mintMaximum.amount0,
      amount1: fixture.position.mintMaximum.amount1,
    });
  });
});
