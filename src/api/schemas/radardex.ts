import { z } from "zod";
import { RADARDEX_ARC } from "../../providers/radardex/manifest.js";
import {
  quoteRequestSchema,
  radarAddressSchema,
  radarHexSchema,
  radarTokenSchema,
} from "../../providers/radardex/schemas.js";

export const radardexChainSchema = z.object({
  chainId: z
    .literal(RADARDEX_ARC.chainId)
    .default(RADARDEX_ARC.chainId)
    .describe("Arc mainnet chain ID"),
});

export const radardexQuoteSchema = quoteRequestSchema.describe(
  "RadarDEX quote request on Arc mainnet"
);
export const radardexSwapSchema = quoteRequestSchema.describe(
  "RadarDEX swap request on Arc mainnet"
);

const radardexV4KeyOutputSchema = z.object({
  currency0: radarAddressSchema.describe("Sorted first pool currency"),
  currency1: radarAddressSchema.describe("Sorted second pool currency"),
  fee: z.number().int().describe("V4 pool fee"),
  tickSpacing: z.number().int().describe("V4 tick spacing"),
  hooks: radarAddressSchema.describe("V4 hooks contract"),
});

export const radardexRouteExecutionOutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("v3_direct").describe("V3 direct execution kind"),
    poolFee: z.number().int().describe("V3 pool fee"),
  }),
  z.object({
    kind: z.literal("v3_multihop").describe("V3 multihop execution kind"),
    encodedPath: radarHexSchema.describe("Encoded V3 token and fee path"),
  }),
  z.object({
    kind: z.literal("v2").describe("V2 execution kind"),
    router: radarAddressSchema.describe("Underlying V2 router"),
  }),
  z.object({
    kind: z.literal("v4_direct").describe("V4 direct execution kind"),
    poolFee: z.number().int().describe("V4 pool fee"),
    tickSpacing: z.number().int().describe("V4 pool tick spacing"),
    hooks: radarAddressSchema.describe("V4 hooks contract"),
  }),
  z.object({
    kind: z.literal("v4_native").describe("V4 native-USDC execution kind"),
    direction: z.enum(["native_to_token", "token_to_native"]).describe("Native swap direction"),
    token: radarAddressSchema.describe("ERC-20 side of the native pool"),
    poolFee: z.number().int().describe("V4 pool fee"),
    tickSpacing: z.number().int().describe("V4 pool tick spacing"),
    hooks: radarAddressSchema.describe("V4 hooks contract"),
    nativeValue: z.string().regex(/^\d+$/).describe("Native USDC value in 18-decimal base units"),
  }),
  z.object({
    kind: z.literal("v4_multihop").describe("V4 multihop execution kind"),
    hub: radarAddressSchema.describe("Intermediate hub token"),
    key1: radardexV4KeyOutputSchema.describe("First V4 pool key"),
    zeroForOne1: z.boolean().describe("First pool swap direction"),
    key2: radardexV4KeyOutputSchema.describe("Second V4 pool key"),
    zeroForOne2: z.boolean().describe("Second pool swap direction"),
  }),
  z.object({
    kind: z.literal("synthra").describe("Synthra execution kind"),
    poolFee: z.number().int().describe("Synthra pool fee"),
    encodedPath: radarHexSchema.describe("Encoded Synthra path"),
  }),
]);

export const radardexRouteOutputSchema = z.object({
  id: z.string().describe("Deterministic route identifier"),
  family: z
    .enum(["v3_direct", "v3_multihop", "v2", "v4_direct", "v4_native", "v4_multihop", "synthra"])
    .describe("Route family"),
  label: z.string().describe("Human-readable route label"),
  fromToken: radarAddressSchema.describe("Input token address"),
  toToken: radarAddressSchema.describe("Output token address"),
  grossInput: z.string().regex(/^\d+$/).describe("Input amount before RadarDEX fee"),
  netInput: z.string().regex(/^\d+$/).describe("Input amount after RadarDEX fee"),
  expectedOutput: z.string().regex(/^\d+$/).describe("Expected output amount"),
  spender: radarAddressSchema.describe("Contract approved to spend the input token"),
  feeBps: z.number().int().describe("Live wrapper fee in basis points"),
  executable: z.literal(true).describe("Whether the route has a supported execution contract"),
  path: z.array(radarAddressSchema).describe("Ordered token path"),
  gasEstimate: z.string().regex(/^\d+$/).optional().describe("Estimated gas units"),
  execution: radardexRouteExecutionOutputSchema.describe("Execution-specific route data"),
});

export const radardexHealthEntryOutputSchema = z.object({
  venue: z.string().describe("RadarDEX route venue"),
  available: z.boolean().describe("Whether required contracts are healthy"),
  feeBps: z.number().int().optional().describe("Live wrapper fee in basis points"),
  reason: z.string().optional().describe("Unavailability reason"),
});

export const radardexTokenListOutputSchema = z.object({
  chainId: z.literal(RADARDEX_ARC.chainId).describe("Arc mainnet chain ID"),
  tokens: z.array(radarTokenSchema).describe("RadarDEX token records"),
});

export const radardexQuoteOutputSchema = z.object({
  request: radardexQuoteSchema.describe("Validated quote request"),
  routes: z.array(radardexRouteOutputSchema).describe("Executable routes ranked by output"),
  best: radardexRouteOutputSchema.optional().describe("Highest-output executable route"),
  health: z.array(radardexHealthEntryOutputSchema).describe("Per-probe route availability"),
});

export const radardexRouteHealthOutputSchema = z.object({
  chainId: z.literal(RADARDEX_ARC.chainId).describe("Arc mainnet chain ID"),
  venues: z.array(radardexHealthEntryOutputSchema).describe("RadarDEX venue health"),
});

export const radardexSwapOutputSchema = z.object({
  txHash: radarHexSchema.describe("Confirmed Arc transaction hash"),
  minimumOutput: z.string().regex(/^\d+$/).describe("Minimum output enforced on-chain"),
  route: radardexRouteOutputSchema.describe("Refreshed route used for execution"),
});

export type RadarDexChainInput = z.input<typeof radardexChainSchema>;
export type RadarDexQuoteInput = z.input<typeof radardexQuoteSchema>;
export type RadarDexSwapInput = z.input<typeof radardexSwapSchema>;
export type RadarDexTokenListResult = z.infer<typeof radardexTokenListOutputSchema>;
export type RadarDexQuoteResult = z.infer<typeof radardexQuoteOutputSchema>;
export type RadarDexRouteHealthResult = z.infer<typeof radardexRouteHealthOutputSchema>;
export type RadarDexSwapResult = z.infer<typeof radardexSwapOutputSchema>;
