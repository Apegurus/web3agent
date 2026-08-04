import { z } from "zod";

import { addressSchema } from "../common.js";

export const UNISWAP_V4_MAX_EVENT_BLOCK_SPAN = 10_000;
export const UNISWAP_V4_MAX_EVENT_PAGE_SIZE = 1_000;
export const UNISWAP_V4_DYNAMIC_FEE_FLAG = 0x800000;
export const UNISWAP_V4_MAX_TICK = 887272;
export const UNISWAP_V4_UINT256_MODULUS = 1n << 256n;

export const decimalIntegerSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "must be a canonical unsigned decimal integer")
  .describe("Canonical unsigned decimal integer string");

export const positiveDecimalIntegerSchema = decimalIntegerSchema
  .refine((value) => value !== "0", "must be greater than zero")
  .describe("Positive canonical unsigned decimal integer string");

export const uint256DecimalSchema = decimalIntegerSchema
  .refine(
    (value) => /^(0|[1-9]\d*)$/.test(value) && BigInt(value) < UNISWAP_V4_UINT256_MODULUS,
    "must fit an unsigned 256-bit integer"
  )
  .describe("Canonical unsigned 256-bit integer string");

export const signedDecimalIntegerSchema = z
  .string()
  .regex(/^-?(0|[1-9]\d*)$/, "must be a canonical signed decimal integer")
  .refine((value) => value !== "-0", "must not be negative zero")
  .describe("Canonical signed decimal integer string");

export const chainIdSchema = z
  .number()
  .int()
  .safe()
  .positive()
  .describe("Positive safe-integer EVM chain ID");

export const uint24Schema = z
  .number()
  .int()
  .min(0)
  .max(0xffffff)
  .describe("Unsigned 24-bit integer");

export const uniswapV4PoolIdSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 32-byte PoolId hex value")
  .describe("32-byte Uniswap v4 PoolId hex value");

export const transactionHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 32-byte transaction hash")
  .describe("32-byte transaction hash");

export const uniswapV4BlockReferenceSchema = z.object({
  chainId: chainIdSchema.describe("Chain ID for the pinned source block"),
  blockNumber: decimalIntegerSchema.describe("Explicit source block number"),
  blockHash: uniswapV4PoolIdSchema.describe("Explicit source block hash"),
});

export function addSourceBlockChainIssue(
  chainId: number,
  sourceBlock: { readonly chainId: number },
  context: z.RefinementCtx,
  message: string
): void {
  if (sourceBlock.chainId !== chainId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceBlock", "chainId"],
      message,
    });
  }
}

export const uniswapV4DeploymentSchema = z
  .object({
    chainId: chainIdSchema.describe("Chain ID hosting the deployment"),
    poolManager: addressSchema.describe("Verified Uniswap v4 PoolManager address"),
    positionManager: addressSchema.describe("Verified Uniswap v4 PositionManager address"),
    stateView: addressSchema.describe("Verified Uniswap v4 StateView address"),
    permit2: addressSchema.describe("Verified canonical Permit2 address"),
    verifiedAt: uniswapV4BlockReferenceSchema.describe("Block used to verify the deployment"),
    poolManagerCodeHash: uniswapV4PoolIdSchema.describe("Verified PoolManager runtime code hash"),
    positionManagerCodeHash: uniswapV4PoolIdSchema.describe(
      "Verified PositionManager runtime code hash"
    ),
    stateViewCodeHash: uniswapV4PoolIdSchema.describe("Verified StateView runtime code hash"),
    permit2CodeHash: uniswapV4PoolIdSchema.describe("Verified Permit2 runtime code hash"),
    sourceReferences: z
      .array(z.string().url())
      .min(1)
      .describe("Independent deployment proof URLs"),
  })
  .superRefine((value, context) => {
    if (value.verifiedAt.chainId !== value.chainId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verifiedAt", "chainId"],
        message: "verification block chainId must match the deployment chainId",
      });
    }
  });

export const uniswapV4GetDeploymentSchema = z.object({
  chainId: chainIdSchema.describe("Chain ID for the verified Uniswap v4 deployment"),
});

export const uniswapV4NativeCurrencySchema = z.object({
  kind: z.literal("native").describe("Native currency discriminator"),
  chainId: chainIdSchema.describe("Chain ID for the native currency"),
  symbol: z.string().min(1).max(32).describe("Native currency symbol"),
  name: z.string().min(1).max(128).describe("Native currency display name"),
  decimals: z.number().int().min(0).max(255).describe("Native currency decimals"),
});

export const uniswapV4Erc20CurrencySchema = z.object({
  kind: z.literal("erc20").describe("ERC-20 currency discriminator"),
  chainId: chainIdSchema.describe("Chain ID for the ERC-20 currency"),
  address: addressSchema.describe("Checksummed ERC-20 contract address"),
  symbol: z.string().min(1).max(32).describe("ERC-20 token symbol"),
  name: z.string().min(1).max(128).describe("ERC-20 token display name"),
  decimals: z.number().int().min(0).max(255).describe("ERC-20 token decimals"),
});

export const uniswapV4CurrencySchema = z.discriminatedUnion("kind", [
  uniswapV4NativeCurrencySchema,
  uniswapV4Erc20CurrencySchema,
]);

function currencySortKey(currency: z.infer<typeof uniswapV4CurrencySchema>): string {
  return currency.kind === "native"
    ? "0x0000000000000000000000000000000000000000"
    : currency.address.toLowerCase();
}

export const uniswapV4PoolKeySchema = z
  .object({
    currency0: uniswapV4CurrencySchema.describe("Canonical lower-sorted pool currency"),
    currency1: uniswapV4CurrencySchema.describe("Canonical higher-sorted pool currency"),
    fee: uint24Schema.describe("Uniswap v4 fee, including the dynamic-fee flag when set"),
    tickSpacing: z.number().int().min(1).max(32767).describe("Positive pool tick spacing"),
    hooks: addressSchema.describe("Pool hook contract address or the zero address"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.currency0.chainId !== value.currency1.chainId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currency1", "chainId"],
        message: "pool currencies must share a chain ID",
      });
    }
    if (currencySortKey(value.currency0) >= currencySortKey(value.currency1)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currency0"],
        message: "currency0 must sort strictly before currency1",
      });
    }
  });

export function addPoolChainConsistencyIssues(
  value: {
    readonly chainId: number;
    readonly poolKey: {
      readonly currency0: { readonly chainId: number };
      readonly currency1: { readonly chainId: number };
    };
    readonly sourceBlock: { readonly chainId: number };
  },
  context: z.RefinementCtx
): void {
  if (value.poolKey.currency0.chainId !== value.chainId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["poolKey", "currency0", "chainId"],
      message: "pool currency0 chainId must match the lifecycle chainId",
    });
  }
  if (value.poolKey.currency1.chainId !== value.chainId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["poolKey", "currency1", "chainId"],
      message: "pool currency1 chainId must match the lifecycle chainId",
    });
  }
  addSourceBlockChainIssue(
    value.chainId,
    value.sourceBlock,
    context,
    "source block chainId must match the lifecycle chainId"
  );
}

export const uniswapV4PoolIdentitySchema = z.object({
  poolId: uniswapV4PoolIdSchema.describe("Computed PoolId for the canonical PoolKey"),
  poolKey: uniswapV4PoolKeySchema.describe("Canonical PoolKey used to derive the PoolId"),
});
