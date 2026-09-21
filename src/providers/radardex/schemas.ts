import { type Hex, getAddress, isAddress, isHex } from "viem";
import { z } from "zod";
import { RADARDEX_ARC } from "./manifest.js";

export const radarAddressSchema = z
  .string()
  .refine(isAddress, "Invalid EVM address")
  .transform((value) => getAddress(value))
  .describe("Checksummed EVM address");

export const radarHexSchema = z
  .custom<Hex>((value) => typeof value === "string" && isHex(value), "Invalid hex data")
  .describe("Hex-encoded data");

export const radarTokenSchema = z.object({
  address: radarAddressSchema.describe("Token contract address"),
  symbol: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.toUpperCase())
    .describe("Token symbol"),
  name: z.string().trim().min(1).describe("Token name"),
  decimals: z.number().int().min(0).max(255).describe("Token decimals"),
});

export const tokenListResponseSchema = z.object({
  tokens: z.array(radarTokenSchema).describe("RadarDEX token records"),
});

export const v4PoolSchema = z.object({
  poolId: z.string().optional().describe("V4 pool identifier"),
  feeTier: z.number().int().min(0).max(1_000_000).describe("Pool fee in millionths"),
  tickSpacing: z.number().int().min(-8_388_608).max(8_388_607).describe("Pool tick spacing"),
  hooks: radarAddressSchema.describe("V4 hooks contract"),
  nativeQuote: z.boolean().describe("Whether one currency is native USDC"),
});

export const v4PoolsResponseSchema = z.object({
  pools: z.array(v4PoolSchema).describe("Validated V4 pool metadata"),
});

export const quoteRequestSchema = z
  .object({
    chainId: z.literal(RADARDEX_ARC.chainId).describe("Arc mainnet chain ID"),
    fromToken: radarAddressSchema.describe("Input token address"),
    toToken: radarAddressSchema.describe("Output token address"),
    fromAmount: z
      .string()
      .regex(/^[1-9]\d*$/)
      .describe("Positive input amount in base units"),
    slippageBps: z.number().int().min(0).max(500).describe("Maximum slippage in basis points"),
  })
  .superRefine((value, context) => {
    if (value.fromToken.toLowerCase() === value.toToken.toLowerCase()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Token pair must differ",
        path: ["toToken"],
      });
    }
  });

export const swapRequestSchema = quoteRequestSchema.and(
  z.object({ account: radarAddressSchema.describe("Server wallet address") })
);

export const v4KeySchema = z.object({
  currency0: radarAddressSchema.describe("Sorted first pool currency"),
  currency1: radarAddressSchema.describe("Sorted second pool currency"),
  fee: z.number().int().describe("V4 pool fee"),
  tickSpacing: z.number().int().describe("V4 tick spacing"),
  hooks: radarAddressSchema.describe("V4 hooks contract"),
});

export const routeExecutionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("v3_direct"), poolFee: z.number().int() }),
  z.object({ kind: z.literal("v3_multihop"), encodedPath: radarHexSchema }),
  z.object({ kind: z.literal("v2"), router: radarAddressSchema }),
  z.object({
    kind: z.literal("v4_direct"),
    poolFee: z.number().int(),
    tickSpacing: z.number().int(),
    hooks: radarAddressSchema,
  }),
  z.object({
    kind: z.literal("v4_native"),
    direction: z.enum(["native_to_token", "token_to_native"]),
    token: radarAddressSchema,
    poolFee: z.number().int(),
    tickSpacing: z.number().int(),
    hooks: radarAddressSchema,
    nativeValue: z.bigint(),
  }),
  z.object({
    kind: z.literal("v4_multihop"),
    hub: radarAddressSchema,
    key1: v4KeySchema,
    zeroForOne1: z.boolean(),
    key2: v4KeySchema,
    zeroForOne2: z.boolean(),
  }),
  z.object({ kind: z.literal("synthra"), poolFee: z.number().int(), encodedPath: radarHexSchema }),
]);

export const routeFamilySchema = z.enum([
  "v3_direct",
  "v3_multihop",
  "v2",
  "v4_direct",
  "v4_native",
  "v4_multihop",
  "synthra",
]);

export const radarRouteSchema = z.object({
  id: z.string().describe("Deterministic route identifier"),
  family: routeFamilySchema.describe("Route family"),
  label: z.string().describe("Human-readable route label"),
  fromToken: radarAddressSchema.describe("Input token address"),
  toToken: radarAddressSchema.describe("Output token address"),
  grossInput: z.bigint().describe("Input amount before RadarDEX fee"),
  netInput: z.bigint().describe("Input amount after RadarDEX fee"),
  expectedOutput: z.bigint().describe("Expected output amount"),
  spender: radarAddressSchema.describe("Execution contract approved to spend input tokens"),
  feeBps: z.number().int().describe("Live wrapper fee in basis points"),
  executable: z.literal(true).describe("Whether the route has a supported execution contract"),
  path: z.array(radarAddressSchema).describe("Ordered route token path"),
  gasEstimate: z.bigint().optional().describe("Estimated gas units"),
  execution: routeExecutionSchema.describe("Execution-specific route data"),
});

export type RadarToken = z.infer<typeof radarTokenSchema>;
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type SwapRequest = z.infer<typeof swapRequestSchema>;
export type V4Pool = z.infer<typeof v4PoolSchema>;
export type V4Key = z.infer<typeof v4KeySchema>;
export type RadarRoute = z.infer<typeof radarRouteSchema>;
export type RouteFamily = z.infer<typeof routeFamilySchema>;

export type RadarPoolCandidate = V4Pool & {
  readonly tokenA: RadarRoute["fromToken"];
  readonly tokenB: RadarRoute["toToken"];
};

export type RouteHealth = {
  readonly venue: string;
  readonly available: boolean;
  readonly reason?: string;
};
