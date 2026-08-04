import { z } from "zod";
import {
  addressSchema,
  hexSchema,
  operationActionResultsMapSchema,
  resumeStateBaseSchema,
} from "../common.js";
import { uniswapV4ExpectedDeltasSchema } from "./calculations.js";
import { uniswapV4ProgressSchema } from "./lifecycle-progress.js";
import {
  UNISWAP_V4_MAX_TICK,
  addPoolChainConsistencyIssues,
  chainIdSchema,
  decimalIntegerSchema,
  positiveDecimalIntegerSchema,
  uniswapV4BlockReferenceSchema,
  uniswapV4PoolIdSchema,
  uniswapV4PoolKeySchema,
} from "./primitives.js";

const uniswapV4OperationBaseSchema = z.object({
  integration: z
    .literal("uniswap-v4")
    .optional()
    .describe("Walletless prepared-operation integration discriminator"),
  chainId: chainIdSchema.describe("Chain ID for the lifecycle operation"),
  account: addressSchema.describe("Account authorizing the lifecycle operation"),
  poolKey: uniswapV4PoolKeySchema.describe("Canonical pool targeted by the lifecycle operation"),
  hookData: hexSchema.describe("Hook callback data supplied to PositionManager"),
  deadline: positiveDecimalIntegerSchema.describe("Unix deadline timestamp as a decimal string"),
  sourceBlock: uniswapV4BlockReferenceSchema.describe("Pinned block used to plan the operation"),
});

const rangeSchema = z.object({
  tickLower: z.number().int().describe("Lower liquidity range tick"),
  tickUpper: z.number().int().describe("Upper liquidity range tick"),
});

function validRangeForPool(
  poolKey: z.infer<typeof uniswapV4PoolKeySchema>,
  tickLower: number,
  tickUpper: number
): boolean {
  return (
    tickLower < tickUpper &&
    tickLower >= -UNISWAP_V4_MAX_TICK &&
    tickUpper <= UNISWAP_V4_MAX_TICK &&
    tickLower % poolKey.tickSpacing === 0 &&
    tickUpper % poolKey.tickSpacing === 0
  );
}

const liquidityOperationSchema = uniswapV4OperationBaseSchema.merge(rangeSchema).extend({
  liquidity: positiveDecimalIntegerSchema.describe("Positive liquidity amount"),
  slippageBps: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .default(0)
    .describe("Maximum add-liquidity slippage in basis points"),
});

export const uniswapV4MintOperationSchema = liquidityOperationSchema
  .extend({
    kind: z.literal("mint").describe("Mint lifecycle operation discriminator"),
    amount0Max: decimalIntegerSchema.describe("Maximum currency0 spend"),
    amount1Max: decimalIntegerSchema.describe("Maximum currency1 spend"),
    createPool: z
      .boolean()
      .default(false)
      .describe("Whether to explicitly initialize an uninitialized pool"),
    initializeSqrtPriceX96: decimalIntegerSchema
      .optional()
      .describe("Initial Q64.96 price when explicitly creating a pool"),
  })
  .superRefine((value, context) => {
    if (!validRangeForPool(value.poolKey, value.tickLower, value.tickUpper)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tickLower"],
        message: "mint ticks must be in range and divisible by pool tickSpacing",
      });
    }
    if (value.createPool !== (value.initializeSqrtPriceX96 !== undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["createPool"],
        message: "initializeSqrtPriceX96 is required exactly when createPool is true",
      });
    }
  });

export const uniswapV4IncreaseOperationSchema = liquidityOperationSchema
  .extend({
    kind: z.literal("increase").describe("Increase lifecycle operation discriminator"),
    tokenId: positiveDecimalIntegerSchema.describe("Existing PositionManager NFT token ID"),
    amount0Max: decimalIntegerSchema.describe("Maximum currency0 spend"),
    amount1Max: decimalIntegerSchema.describe("Maximum currency1 spend"),
  })
  .superRefine((value, context) => {
    if (!validRangeForPool(value.poolKey, value.tickLower, value.tickUpper)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tickLower"],
        message: "increase ticks must be in range and divisible by pool tickSpacing",
      });
    }
  });

const removalOperationSchema = uniswapV4OperationBaseSchema.extend({
  tokenId: positiveDecimalIntegerSchema.describe("Existing PositionManager NFT token ID"),
  recipient: addressSchema
    .optional()
    .describe("Explicit recipient of removed position proceeds required by transaction planners"),
  liquidity: positiveDecimalIntegerSchema.describe("Liquidity to remove"),
  liquidityBps: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .describe("Liquidity removal percentage in basis points"),
  amount0Min: decimalIntegerSchema.describe("Minimum currency0 amount received"),
  amount1Min: decimalIntegerSchema.describe("Minimum currency1 amount received"),
  slippageBps: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .default(0)
    .describe("Maximum remove-liquidity slippage in basis points"),
});

export const uniswapV4DecreaseOperationSchema = removalOperationSchema.extend({
  kind: z.literal("decrease").describe("Decrease lifecycle operation discriminator"),
});

export const uniswapV4CollectOperationSchema = uniswapV4OperationBaseSchema
  .extend({
    kind: z.literal("collect").describe("Collect lifecycle operation discriminator"),
    tokenId: positiveDecimalIntegerSchema.describe("Existing PositionManager NFT token ID"),
    recipient: addressSchema.describe("Recipient of collected position fees"),
    slippageBps: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .default(0)
      .describe("Required SDK collect slippage setting in basis points"),
  })
  .strict();

export const uniswapV4BurnOperationSchema = removalOperationSchema
  .extend({
    kind: z.literal("burn").describe("Burn lifecycle operation discriminator"),
  })
  .superRefine((value, context) => {
    if (value.liquidityBps !== 10000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["liquidityBps"],
        message: "burn requires a 100% liquidity exit",
      });
    }
  });

export const uniswapV4LifecycleOperationSchema = z
  .union([
    uniswapV4MintOperationSchema,
    uniswapV4IncreaseOperationSchema,
    uniswapV4DecreaseOperationSchema,
    uniswapV4CollectOperationSchema,
    uniswapV4BurnOperationSchema,
  ])
  .superRefine(addPoolChainConsistencyIssues);

export { uniswapV4ProgressSchema } from "./lifecycle-progress.js";

const uniswapV4ResumeStateDataSchema = resumeStateBaseSchema.extend({
  chainId: chainIdSchema.describe("Chain ID for the resumable lifecycle operation"),
  operationId: z.string().min(1).describe("Stable resumable lifecycle operation identifier"),
  sourceBlock: uniswapV4BlockReferenceSchema.describe("Pinned plan source block"),
  actionIds: z.array(z.string().min(1)).min(1).describe("Ordered immutable lifecycle action IDs"),
  expectedDeltas: uniswapV4ExpectedDeltasSchema.describe("Planner expected delta bounds"),
  operation: uniswapV4LifecycleOperationSchema.describe(
    "Supplied operation that is replanned from its pinned source block on every resume"
  ),
  typedDataHashes: z
    .array(uniswapV4PoolIdSchema)
    .describe("Canonical hashes of exact EIP-712 payloads"),
  plan: z.record(z.unknown()).describe("Canonical serialized lifecycle plan facts"),
  progress: uniswapV4ProgressSchema,
  stateVersion: z.literal(3).describe("Inner Uniswap v4 external resume-state version"),
  actionResults: operationActionResultsMapSchema.describe(
    "Completed external wallet action results"
  ),
});

export const uniswapV4OperationResumeStateSchema = z
  .discriminatedUnion("kind", [
    z.object({
      version: z.literal(1).describe("Uniswap v4 resume-state schema version"),
      integration: z.literal("uniswap-v4").describe("Prepared operation integration"),
      kind: z.literal("mint").describe("Mint lifecycle resume-state discriminator"),
      state: uniswapV4ResumeStateDataSchema.describe("Serializable mint resume facts"),
    }),
    z.object({
      version: z.literal(1).describe("Uniswap v4 resume-state schema version"),
      integration: z.literal("uniswap-v4").describe("Prepared operation integration"),
      kind: z.literal("increase").describe("Increase lifecycle resume-state discriminator"),
      state: uniswapV4ResumeStateDataSchema.describe("Serializable increase resume facts"),
    }),
    z.object({
      version: z.literal(1).describe("Uniswap v4 resume-state schema version"),
      integration: z.literal("uniswap-v4").describe("Prepared operation integration"),
      kind: z.literal("decrease").describe("Decrease lifecycle resume-state discriminator"),
      state: uniswapV4ResumeStateDataSchema.describe("Serializable decrease resume facts"),
    }),
    z.object({
      version: z.literal(1).describe("Uniswap v4 resume-state schema version"),
      integration: z.literal("uniswap-v4").describe("Prepared operation integration"),
      kind: z.literal("collect").describe("Collect lifecycle resume-state discriminator"),
      state: uniswapV4ResumeStateDataSchema.describe("Serializable collect resume facts"),
    }),
    z.object({
      version: z.literal(1).describe("Uniswap v4 resume-state schema version"),
      integration: z.literal("uniswap-v4").describe("Prepared operation integration"),
      kind: z.literal("burn").describe("Burn lifecycle resume-state discriminator"),
      state: uniswapV4ResumeStateDataSchema.describe("Serializable burn resume facts"),
    }),
  ])
  .superRefine((value, context) => {
    if (value.state.sourceBlock.chainId !== value.state.chainId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state", "sourceBlock", "chainId"],
        message: "resume source block chainId must match the lifecycle chainId",
      });
    }
    for (const result of Object.values(value.state.actionResults)) {
      if (result.type === "signature" || result.type === "messageSignature") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["state", "actionResults"],
          message: "Uniswap v4 resume state must not persist raw signatures",
        });
      }
    }
  });
