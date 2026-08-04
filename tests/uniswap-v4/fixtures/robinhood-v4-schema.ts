import { z } from "zod";

import { addressSchema, hexSchema } from "../../../src/api/schemas/common.js";

const decimalSchema = z.string().regex(/^\d+$/);
const blockSchema = z.object({
  blockHash: hexSchema,
  blockNumber: decimalSchema,
  chainId: z.literal(4663),
});
const currencySchema = z.discriminatedUnion("kind", [
  z.object({
    chainId: z.literal(4663),
    decimals: z.number().int(),
    kind: z.literal("native"),
    name: z.string(),
    symbol: z.string(),
  }),
  z.object({
    address: addressSchema,
    chainId: z.literal(4663),
    decimals: z.number().int(),
    kind: z.literal("erc20"),
    name: z.string(),
    symbol: z.string(),
  }),
]);
const poolKeySchema = z.object({
  currency0: currencySchema,
  currency1: currencySchema,
  fee: z.number().int(),
  hooks: addressSchema,
  tickSpacing: z.number().int(),
});
const deploymentSchema = z.object({
  chainId: z.literal(4663),
  permit2: addressSchema,
  permit2CodeHash: hexSchema,
  poolManager: addressSchema,
  poolManagerCodeHash: hexSchema,
  positionManager: addressSchema,
  positionManagerCodeHash: hexSchema,
  sourceReferences: z.array(z.string().url()),
  stateView: addressSchema,
  stateViewCodeHash: hexSchema,
  verifiedAt: blockSchema,
});
const normalizedPoolSchema = z.object({
  currentFee: z.number().int(),
  deployment: deploymentSchema,
  dynamicFee: z.boolean(),
  feeGrowthGlobal0X128: decimalSchema,
  feeGrowthGlobal1X128: decimalSchema,
  initialized: z.boolean(),
  liquidity: decimalSchema,
  pool: z.object({ poolId: hexSchema, poolKey: poolKeySchema }),
  sourceBlock: blockSchema,
  sqrtPriceX96: decimalSchema,
  tick: z.number().int(),
});
const normalizedPositionSchema = z.object({
  amount0: decimalSchema,
  amount1: decimalSchema,
  feeGrowthInside0LastX128: decimalSchema,
  feeGrowthInside0X128: decimalSchema,
  feeGrowthInside1LastX128: decimalSchema,
  feeGrowthInside1X128: decimalSchema,
  liquidity: decimalSchema,
  operator: addressSchema,
  owner: addressSchema,
  pool: z.object({ poolId: hexSchema, poolKey: poolKeySchema }),
  positionId: hexSchema,
  sourceBlock: blockSchema,
  tickLower: z.number().int(),
  tickUpper: z.number().int(),
  tokenId: decimalSchema,
  tokensOwedAvailability: z.literal("not-exposed-by-uniswap-v4-core"),
  uncollectedFees0: decimalSchema,
  uncollectedFees1: decimalSchema,
});
const quoteSchema = z.object({
  adapterSource: z.literal("native"),
  allowance: z.object({ amount: decimalSchema, target: addressSchema }),
  buyAmount: decimalSchema,
  capabilityDecisionId: z.literal("zeroex-goat-v2-admission-v1"),
  capabilityReason: z.literal("goat-chain-4663-unavailable"),
  chainId: z.literal(4663),
  priceImpactBps: z.object({ denominator: decimalSchema, numerator: decimalSchema }),
  provider: z.literal("0x"),
  sellAmount: decimalSchema,
  transaction: z.object({ data: hexSchema, to: addressSchema, value: decimalSchema }),
});

export const robinhoodV4FixtureSchema = z.object({
  chainId: z.literal(4663),
  deployment: deploymentSchema,
  eventDeployment: z.object({
    chainId: z.literal(4663),
    poolManager: addressSchema,
    positionManager: addressSchema,
  }),
  eventOtherPoolId: hexSchema,
  evidence: z.record(z.string()),
  live: z.object({
    eventPageSize: z.number().int().positive(),
    poolId: hexSchema,
    slot0: z.tuple([decimalSchema, z.number().int(), z.number().int(), z.number().int()]),
    timeoutMs: z.literal(15_000),
  }),
  logs: z.object({ otherPoolSalt: hexSchema }),
  normalized: z.object({
    events: z.array(
      z.object({
        blockNumber: decimalSchema,
        kind: z.literal("initialize"),
        logIndex: z.number().int(),
        poolAssociation: z.object({
          kind: z.literal("associated"),
          poolId: hexSchema,
          source: z.literal("pool-manager"),
        }),
        sqrtPriceX96: decimalSchema,
        tick: z.number().int(),
        transactionHash: hexSchema,
        transactionIndex: z.number().int(),
      })
    ),
    pool: normalizedPoolSchema,
    position: normalizedPositionSchema,
    quote: quoteSchema,
  }),
  pool: z.object({ poolId: hexSchema, poolKey: poolKeySchema }),
  position: z.object({
    feeGrowthInside0LastX128: decimalSchema,
    feeGrowthInside0X128: decimalSchema,
    feeGrowthInside1LastX128: decimalSchema,
    feeGrowthInside1X128: decimalSchema,
    liquidity: decimalSchema,
    operator: addressSchema,
    owner: addressSchema,
    tickLower: z.number().int(),
    tickUpper: z.number().int(),
    tokenId: decimalSchema,
  }),
  quote: z.object({
    request: z.object({
      chainId: z.literal(4663),
      fromAmount: decimalSchema,
      fromToken: addressSchema,
      referencePrice: z.string(),
      slippageBps: z.number().int(),
      taker: addressSchema,
      toToken: addressSchema,
    }),
    response: z.object({
      buyAmount: decimalSchema,
      issues: z.object({ allowance: z.object({ spender: addressSchema }) }),
      liquidityAvailable: z.literal(true),
      price: z.string(),
      sellAmount: decimalSchema,
      transaction: z.object({ data: hexSchema, to: addressSchema, value: decimalSchema }),
    }),
  }),
  schemaVersion: z.literal(1),
  sourceBlock: blockSchema,
  token: z.object({
    address: addressSchema,
    decimals: z.number().int(),
    name: z.string(),
    symbol: z.string(),
  }),
  transactionRequest: z.object({ data: hexSchema, to: addressSchema, value: decimalSchema }),
});

export type RobinhoodV4Fixture = z.infer<typeof robinhoodV4FixtureSchema>;

export function parseRobinhoodV4Fixture(input: unknown): RobinhoodV4Fixture {
  return robinhoodV4FixtureSchema.parse(input);
}
