import { z } from "zod";

import {
  decimalIntegerSchema,
  positiveDecimalIntegerSchema,
  signedDecimalIntegerSchema,
  uniswapV4PoolKeySchema,
} from "./primitives.js";
import { uniswapV4PoolStateSchema, uniswapV4PositionStateSchema } from "./state.js";

export const uniswapV4ExpectedDeltasSchema = z.object({
  kind: z
    .enum(["mint", "increase", "decrease", "collect", "burn"])
    .describe("Lifecycle action producing the deltas"),
  token0Delta: signedDecimalIntegerSchema.describe("Expected signed currency0 delta"),
  token1Delta: signedDecimalIntegerSchema.describe("Expected signed currency1 delta"),
  liquidityDelta: signedDecimalIntegerSchema.describe("Expected signed liquidity delta"),
  nativeValueDelta: signedDecimalIntegerSchema.describe("Expected signed native-value delta"),
  token0Min: signedDecimalIntegerSchema
    .optional()
    .describe("Inclusive lower bound for currency0 delta"),
  token0Max: signedDecimalIntegerSchema
    .optional()
    .describe("Inclusive upper bound for currency0 delta"),
  token1Min: signedDecimalIntegerSchema
    .optional()
    .describe("Inclusive lower bound for currency1 delta"),
  token1Max: signedDecimalIntegerSchema
    .optional()
    .describe("Inclusive upper bound for currency1 delta"),
});

export const uniswapV4CalculationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tickToPrice").describe("Tick-to-price calculation discriminator"),
    poolKey: uniswapV4PoolKeySchema.describe("PoolKey defining price orientation"),
    tick: z.number().int().describe("Tick to convert"),
    price: z.string().min(1).describe("Exact decimal price result"),
  }),
  z.object({
    kind: z.literal("priceToTick").describe("Price-to-tick calculation discriminator"),
    poolKey: uniswapV4PoolKeySchema.describe("PoolKey defining price orientation"),
    price: z.string().min(1).describe("Exact decimal price input"),
    tick: z.number().int().describe("Validated rounded tick result"),
  }),
  z.object({
    kind: z.literal("liquidityAmounts").describe("Liquidity-to-amounts calculation discriminator"),
    liquidity: decimalIntegerSchema.describe("Liquidity being converted"),
    amount0: decimalIntegerSchema.describe("Currency0 amount result"),
    amount1: decimalIntegerSchema.describe("Currency1 amount result"),
  }),
  z.object({
    kind: z.literal("feeEstimate").describe("Uncollected-fee calculation discriminator"),
    amount0: decimalIntegerSchema.describe("Estimated currency0 fee amount"),
    amount1: decimalIntegerSchema.describe("Estimated currency1 fee amount"),
  }),
  z.object({
    kind: z.literal("quotePriceImpact").describe("Quote price-impact calculation discriminator"),
    priceImpactBps: z.string().min(1).describe("Exact price impact in basis points"),
  }),
  z.object({
    kind: z
      .literal("expectedDeltas")
      .describe("Expected lifecycle delta calculation discriminator"),
    deltas: uniswapV4ExpectedDeltasSchema.describe("Expected bounded lifecycle deltas"),
  }),
]);

export const uniswapV4CalculatePositionSchema = z.object({
  pool: uniswapV4PoolStateSchema.describe("Pool snapshot used to calculate position amounts"),
  position: uniswapV4PositionStateSchema.describe("Position snapshot used to calculate amounts"),
});

export const uniswapV4ExactRationalSchema = z.object({
  numerator: signedDecimalIntegerSchema.describe("Exact signed rational numerator"),
  denominator: positiveDecimalIntegerSchema.describe("Exact positive rational denominator"),
  rounding: z.literal("exact").describe("Exact rational rounding marker"),
});

export const uniswapV4PositiveExactRationalSchema = uniswapV4ExactRationalSchema.extend({
  numerator: positiveDecimalIntegerSchema.describe("Exact positive rational numerator"),
});

export const uniswapV4LifecycleDeltasSchema = z.object({
  kind: z.enum(["mint", "increase", "decrease", "collect", "burn"]).describe("Lifecycle action"),
  liquidityDelta: signedDecimalIntegerSchema.describe("Signed liquidity change"),
  nativeValueDelta: signedDecimalIntegerSchema.describe("Signed native currency value change"),
  positionAmount0After: decimalIntegerSchema.describe("Position currency0 amount after execution"),
  positionAmount0Before: decimalIntegerSchema.describe(
    "Position currency0 amount before execution"
  ),
  positionAmount1After: decimalIntegerSchema.describe("Position currency1 amount after execution"),
  positionAmount1Before: decimalIntegerSchema.describe(
    "Position currency1 amount before execution"
  ),
  positionLiquidityAfter: decimalIntegerSchema.describe("Position liquidity after execution"),
  positionLiquidityBefore: decimalIntegerSchema.describe("Position liquidity before execution"),
  rounding: z.literal("floor").describe("Integer amount rounding mode"),
  token0Delta: signedDecimalIntegerSchema.describe("Expected currency0 delta"),
  token0Max: signedDecimalIntegerSchema.describe("Maximum expected currency0 delta"),
  token0Min: signedDecimalIntegerSchema.describe("Minimum expected currency0 delta"),
  token1Delta: signedDecimalIntegerSchema.describe("Expected currency1 delta"),
  token1Max: signedDecimalIntegerSchema.describe("Maximum expected currency1 delta"),
  token1Min: signedDecimalIntegerSchema.describe("Minimum expected currency1 delta"),
});

export const uniswapV4CalculationResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tickToPrice").describe("Tick-to-price result discriminator"),
    poolKey: uniswapV4PoolKeySchema.describe("PoolKey defining price orientation"),
    tick: z.number().int().describe("Converted tick"),
    orientation: z.object({
      base: z.literal("currency0").describe("Price base currency"),
      baseDecimals: z.number().int().min(0).max(255).describe("Base currency decimals"),
      quote: z.literal("currency1").describe("Price quote currency"),
      quoteDecimals: z.number().int().min(0).max(255).describe("Quote currency decimals"),
    }),
    price: uniswapV4PositiveExactRationalSchema.describe("Exact currency0-to-currency1 price"),
  }),
  z.object({
    kind: z.literal("priceToTick").describe("Price-to-tick result discriminator"),
    poolKey: uniswapV4PoolKeySchema.describe("PoolKey defining price orientation"),
    price: uniswapV4PositiveExactRationalSchema.describe("Exact input price"),
    tick: z.number().int().describe("Rounded tick"),
    rounding: z.literal("floor").describe("Tick rounding mode"),
  }),
  z.object({
    kind: z.literal("liquidityAmounts").describe("Liquidity-to-amounts result discriminator"),
    liquidity: decimalIntegerSchema.describe("Input liquidity"),
    amount0: decimalIntegerSchema.describe("Currency0 amount"),
    amount1: decimalIntegerSchema.describe("Currency1 amount"),
    rounding: z.literal("floor").describe("Amount rounding mode"),
  }),
  z.object({
    kind: z.literal("feeEstimate").describe("Fee estimate result discriminator"),
    amount0: decimalIntegerSchema.describe("Estimated currency0 fees"),
    amount1: decimalIntegerSchema.describe("Estimated currency1 fees"),
    rounding: z.literal("floor").describe("Fee rounding mode"),
  }),
  z.object({
    kind: z.literal("quotePriceImpact").describe("Quote impact result discriminator"),
    quoteKind: z.enum(["exactInput", "exactOutput"]).describe("Quote amount constraint"),
    priceImpactBps: uniswapV4ExactRationalSchema.describe(
      "Exact signed price impact in basis points"
    ),
  }),
  z.object({
    kind: z.literal("expectedDeltas").describe("Lifecycle delta result discriminator"),
    deltas: uniswapV4LifecycleDeltasSchema.describe("Exact bounded lifecycle deltas"),
  }),
]);
