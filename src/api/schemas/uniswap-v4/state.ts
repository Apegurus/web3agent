import { z } from "zod";

import { addressSchema } from "../common.js";
import {
  UNISWAP_V4_MAX_TICK,
  addSourceBlockChainIssue,
  decimalIntegerSchema,
  uint24Schema,
  uint256DecimalSchema,
  uniswapV4BlockReferenceSchema,
  uniswapV4DeploymentSchema,
  uniswapV4PoolIdSchema,
  uniswapV4PoolIdentitySchema,
  uniswapV4PoolKeySchema,
} from "./primitives.js";

export const uniswapV4PoolStateSchema = z.object({
  deployment: uniswapV4DeploymentSchema.describe("Deployment used for the pool read"),
  sourceBlock: uniswapV4BlockReferenceSchema.describe("Single block shared by all pool reads"),
  pool: uniswapV4PoolIdentitySchema.describe("Canonical pool identity"),
  initialized: z.boolean().describe("Whether the pool has been initialized"),
  dynamicFee: z.boolean().describe("Whether the pool fee is hook-controlled"),
  currentFee: uint24Schema.describe("Current effective pool fee"),
  sqrtPriceX96: decimalIntegerSchema.describe("Current Q64.96 square-root price"),
  tick: z.number().int().describe("Current pool tick"),
  liquidity: decimalIntegerSchema.describe("Current in-range pool liquidity"),
  feeGrowthGlobal0X128: decimalIntegerSchema.describe(
    "Global fee growth for currency0 in Q128.128"
  ),
  feeGrowthGlobal1X128: decimalIntegerSchema.describe(
    "Global fee growth for currency1 in Q128.128"
  ),
});

export const uniswapV4PositionStateSchema = z
  .object({
    sourceBlock: uniswapV4BlockReferenceSchema.describe(
      "Single block shared by all position reads"
    ),
    tokenId: uint256DecimalSchema.describe("PositionManager NFT token ID"),
    positionId: uniswapV4PoolIdSchema.describe(
      "Core position storage key derived from owner, ticks, and token salt"
    ),
    owner: addressSchema.describe("Current position NFT owner"),
    operator: addressSchema.describe("Approved position NFT operator"),
    pool: uniswapV4PoolIdentitySchema.describe("Canonical pool identity for the position"),
    tickLower: z.number().int().describe("Lower position tick"),
    tickUpper: z.number().int().describe("Upper position tick"),
    liquidity: decimalIntegerSchema.describe("Current position liquidity"),
    feeGrowthInside0X128: decimalIntegerSchema.describe(
      "Current inside fee growth for currency0 in Q128.128"
    ),
    feeGrowthInside1X128: decimalIntegerSchema.describe(
      "Current inside fee growth for currency1 in Q128.128"
    ),
    feeGrowthInside0LastX128: decimalIntegerSchema.describe(
      "Cached inside fee growth for currency0 from the core position state in Q128.128"
    ),
    feeGrowthInside1LastX128: decimalIntegerSchema.describe(
      "Cached inside fee growth for currency1 from the core position state in Q128.128"
    ),
    tokensOwedAvailability: z
      .literal("not-exposed-by-uniswap-v4-core")
      .describe("Stored owed-token balances are not exposed by Uniswap v4 core position state"),
    amount0: decimalIntegerSchema.describe("Current currency0 principal amount"),
    amount1: decimalIntegerSchema.describe("Current currency1 principal amount"),
    uncollectedFees0: decimalIntegerSchema.describe(
      "Estimated uncollected currency0 fees from modular fee-growth delta and position liquidity"
    ),
    uncollectedFees1: decimalIntegerSchema.describe(
      "Estimated uncollected currency1 fees from modular fee-growth delta and position liquidity"
    ),
  })
  .superRefine((value, context) => {
    addSourceBlockChainIssue(
      value.pool.poolKey.currency0.chainId,
      value.sourceBlock,
      context,
      "position source block chainId must match the pool chainId"
    );
    const spacing = value.pool.poolKey.tickSpacing;
    if (
      value.tickLower >= value.tickUpper ||
      value.tickLower < -UNISWAP_V4_MAX_TICK ||
      value.tickUpper > UNISWAP_V4_MAX_TICK ||
      value.tickLower % spacing !== 0 ||
      value.tickUpper % spacing !== 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tickLower"],
        message: "position ticks must be ordered, in range, and divisible by tickSpacing",
      });
    }
  });

const uniswapV4PoolRequestSchema = z.object({
  poolKey: uniswapV4PoolKeySchema.describe("Canonical PoolKey to read"),
  sourceBlock: uniswapV4BlockReferenceSchema.describe("Pinned block for every pool read"),
});

function addPoolRequestChainIssue(
  value: {
    readonly poolKey: { readonly currency0: { readonly chainId: number } };
    readonly sourceBlock: { readonly chainId: number };
  },
  context: z.RefinementCtx
): void {
  addSourceBlockChainIssue(
    value.poolKey.currency0.chainId,
    value.sourceBlock,
    context,
    "pool source block chainId must match the PoolKey chainId"
  );
}

export const uniswapV4GetPoolSchema =
  uniswapV4PoolRequestSchema.superRefine(addPoolRequestChainIssue);

export const uniswapV4GetPositionSchema = uniswapV4PoolRequestSchema
  .extend({
    expectedOwner: addressSchema
      .optional()
      .describe("Optional owner required for the position NFT"),
    tokenId: uint256DecimalSchema.describe("PositionManager NFT token ID to read"),
  })
  .superRefine(addPoolRequestChainIssue);
