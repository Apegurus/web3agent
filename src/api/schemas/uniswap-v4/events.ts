import { z } from "zod";

import { addressSchema } from "../common.js";
import {
  UNISWAP_V4_MAX_EVENT_BLOCK_SPAN,
  UNISWAP_V4_MAX_EVENT_PAGE_SIZE,
  chainIdSchema,
  decimalIntegerSchema,
  signedDecimalIntegerSchema,
  transactionHashSchema,
  uint24Schema,
  uniswapV4PoolIdSchema,
} from "./primitives.js";

export const uniswapV4EventCursorSchema = z
  .string()
  .regex(/^v2:[A-Za-z0-9_-]+$/, "must be a versioned opaque cursor")
  .describe("Versioned opaque event continuation cursor");

const uniswapV4EventQueryBaseSchema = z.object({
  chainId: chainIdSchema.describe("Chain ID for the event query"),
  startBlock: decimalIntegerSchema.describe("Inclusive event range start block"),
  endBlock: decimalIntegerSchema.describe("Inclusive event range end block"),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(UNISWAP_V4_MAX_EVENT_PAGE_SIZE)
    .describe("Maximum events returned in one page"),
  cursor: uniswapV4EventCursorSchema
    .optional()
    .describe("Continuation cursor from the preceding page"),
});

const poolEventKinds = z.enum([
  "initialize",
  "swap",
  "modifyLiquidity",
  "donate",
  "positionModify",
]);
const positionEventKinds = z.enum(["positionTransfer", "positionLifecycle"]);

export const uniswapV4EventQuerySchema = z
  .discriminatedUnion("scope", [
    uniswapV4EventQueryBaseSchema
      .extend({
        scope: z.literal("pool").describe("Query PoolManager events associated by emitted PoolId"),
        poolId: uniswapV4PoolIdSchema.describe(
          "PoolId used to post-filter singleton PoolManager logs"
        ),
        eventKinds: z
          .array(poolEventKinds)
          .min(1)
          .optional()
          .describe("Pool event kinds to include"),
      })
      .strict(),
    uniswapV4EventQueryBaseSchema
      .extend({
        scope: z
          .literal("position")
          .describe("Query PositionManager events for one position token ID"),
        tokenId: decimalIntegerSchema.describe(
          "Position NFT token ID used to filter PositionManager logs"
        ),
        eventKinds: z
          .array(positionEventKinds)
          .min(1)
          .optional()
          .describe("Position event kinds to include"),
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    const start = BigInt(value.startBlock);
    const end = BigInt(value.endBlock);
    if (end < start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endBlock"],
        message: "endBlock must be greater than or equal to startBlock",
      });
    }
    if (end - start + 1n > BigInt(UNISWAP_V4_MAX_EVENT_BLOCK_SPAN)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endBlock"],
        message: `inclusive block range must not exceed ${UNISWAP_V4_MAX_EVENT_BLOCK_SPAN} blocks`,
      });
    }
  });

const uniswapV4EventMetadataSchema = z.object({
  blockNumber: decimalIntegerSchema.describe("Block number containing the event"),
  transactionHash: transactionHashSchema.describe("Transaction hash containing the event"),
  transactionIndex: z.number().int().min(0).describe("Transaction index within the block"),
  logIndex: z.number().int().min(0).describe("Log index within the transaction"),
});

const associatedPoolSchema = z.object({
  kind: z.literal("associated").describe("Event emitted a verified PoolId"),
  poolId: uniswapV4PoolIdSchema.describe("PoolId emitted by this event"),
  source: z
    .enum(["pool-manager", "position-manager-modify-position"])
    .describe("Contract event that emitted the PoolId"),
});

const unassociatedTransferPoolSchema = z.object({
  kind: z.literal("unassociated").describe("Event did not emit a PoolId"),
  reason: z
    .literal("erc721-transfer-does-not-emit-pool-id")
    .describe("Pinned ABI reason PoolId is unavailable"),
});

const poolEventBaseSchema = uniswapV4EventMetadataSchema.extend({
  poolAssociation: associatedPoolSchema.describe("Verified emitted PoolId association"),
});

const positionTransferEventBaseSchema = uniswapV4EventMetadataSchema.extend({
  poolAssociation: unassociatedTransferPoolSchema.describe(
    "Explicit absence of a PoolId association"
  ),
});

export const uniswapV4EventSchema = z.discriminatedUnion("kind", [
  poolEventBaseSchema.extend({
    kind: z.literal("initialize").describe("Pool initialization event discriminator"),
    sqrtPriceX96: decimalIntegerSchema.describe("Initialized Q64.96 square-root price"),
    tick: z.number().int().describe("Initialized pool tick"),
  }),
  poolEventBaseSchema.extend({
    kind: z.literal("swap").describe("Pool swap event discriminator"),
    sender: addressSchema.describe("Swap caller address"),
    amount0: signedDecimalIntegerSchema.describe("Signed currency0 swap delta"),
    amount1: signedDecimalIntegerSchema.describe("Signed currency1 swap delta"),
    sqrtPriceX96: decimalIntegerSchema.describe("Post-swap Q64.96 square-root price"),
    liquidity: decimalIntegerSchema.describe("Post-swap liquidity"),
    tick: z.number().int().describe("Post-swap tick"),
    fee: uint24Schema.describe("Effective fee charged by the swap"),
  }),
  poolEventBaseSchema.extend({
    kind: z.literal("modifyLiquidity").describe("Liquidity modification event discriminator"),
    sender: addressSchema.describe("Liquidity modification caller address"),
    tickLower: z.number().int().describe("Modified lower tick"),
    tickUpper: z.number().int().describe("Modified upper tick"),
    liquidityDelta: signedDecimalIntegerSchema.describe("Signed liquidity delta"),
  }),
  poolEventBaseSchema.extend({
    kind: z.literal("donate").describe("Pool donation event discriminator"),
    sender: addressSchema.describe("Donation caller address"),
    amount0: decimalIntegerSchema.describe("Donated currency0 amount"),
    amount1: decimalIntegerSchema.describe("Donated currency1 amount"),
  }),
  poolEventBaseSchema.extend({
    kind: z
      .literal("positionModify")
      .describe("PositionManager pool-scoped position modification discriminator"),
    sender: addressSchema.describe("Position modification caller address"),
    tickLower: z.number().int().describe("Modified lower tick"),
    tickUpper: z.number().int().describe("Modified upper tick"),
    liquidityDelta: signedDecimalIntegerSchema.describe("Signed position liquidity delta"),
    salt: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .describe("Opaque PositionManager salt; not a token ID"),
  }),
  positionTransferEventBaseSchema.extend({
    kind: z.literal("positionTransfer").describe("Position NFT transfer event discriminator"),
    tokenId: decimalIntegerSchema.describe("Transferred position NFT token ID"),
    from: addressSchema.describe("Previous position NFT owner"),
    to: addressSchema.describe("New position NFT owner"),
  }),
  positionTransferEventBaseSchema.extend({
    kind: z.literal("positionLifecycle").describe("Position lifecycle event discriminator"),
    tokenId: decimalIntegerSchema.describe("Affected position NFT token ID"),
    action: z.enum(["mint", "burn"]).describe("Transfer-derived lifecycle action"),
    owner: addressSchema.describe("Position owner at event time"),
  }),
]);

export const uniswapV4EventPageSchema = z.object({
  events: z.array(uniswapV4EventSchema).describe("Ordered normalized event page"),
  nextCursor: uniswapV4EventCursorSchema
    .optional()
    .describe("Cursor for the next page when more events exist"),
  hasMore: z.boolean().describe("Whether more matching events remain"),
});
