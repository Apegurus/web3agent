import { z } from "zod";
import { uniswapV4PositiveExactRationalSchema } from "./calculations.js";
import {
  uniswapV4BurnOperationSchema,
  uniswapV4CollectOperationSchema,
  uniswapV4DecreaseOperationSchema,
  uniswapV4IncreaseOperationSchema,
  uniswapV4MintOperationSchema,
} from "./lifecycle.js";
import {
  UNISWAP_V4_MAX_TICK,
  decimalIntegerSchema,
  positiveDecimalIntegerSchema,
  uniswapV4PoolKeySchema,
} from "./primitives.js";
import { uniswapV4PoolStateSchema, uniswapV4PositionStateSchema } from "./state.js";

const expectedDeltasBase = {
  kind: z.literal("expectedDeltas").describe("Expected lifecycle delta calculation discriminator"),
  pool: uniswapV4PoolStateSchema.describe("Pool snapshot used for lifecycle calculations"),
};

const expectedDeltasWithPosition = <T extends z.ZodTypeAny>(operation: T) =>
  z.object({
    ...expectedDeltasBase,
    operation: operation.describe("Lifecycle operation being analyzed"),
    position: uniswapV4PositionStateSchema.describe("Current position snapshot"),
  });

export const uniswapV4CalculationInputSchema = z.union([
  z.object({
    kind: z.literal("tickToPrice").describe("Tick-to-price calculation discriminator"),
    poolKey: uniswapV4PoolKeySchema.describe("PoolKey defining price orientation"),
    tick: z
      .number()
      .int()
      .min(-UNISWAP_V4_MAX_TICK)
      .max(UNISWAP_V4_MAX_TICK)
      .describe("Tick to convert"),
  }),
  z.object({
    kind: z.literal("priceToTick").describe("Price-to-tick calculation discriminator"),
    poolKey: uniswapV4PoolKeySchema.describe("PoolKey defining price orientation"),
    price: uniswapV4PositiveExactRationalSchema.describe("Exact positive price to convert"),
  }),
  z.object({
    kind: z.literal("liquidityAmounts").describe("Liquidity-to-amounts calculation discriminator"),
    pool: uniswapV4PoolStateSchema.describe("Pool snapshot used for amount calculation"),
    liquidity: decimalIntegerSchema.describe("Liquidity being converted"),
    tickLower: z.number().int().describe("Lower position tick"),
    tickUpper: z.number().int().describe("Upper position tick"),
  }),
  z.object({
    kind: z.literal("feeEstimate").describe("Uncollected-fee calculation discriminator"),
    position: uniswapV4PositionStateSchema.describe("Position snapshot used for fee estimation"),
  }),
  z.object({
    kind: z.literal("quotePriceImpact").describe("Quote price-impact calculation discriminator"),
    quoteKind: z.enum(["exactInput", "exactOutput"]).describe("Quote amount constraint"),
    quotedInputAmount: positiveDecimalIntegerSchema.describe("Quoted input token amount"),
    quotedOutputAmount: positiveDecimalIntegerSchema.describe("Quoted output token amount"),
    referenceInputAmount: positiveDecimalIntegerSchema.describe("Reference input token amount"),
    referenceOutputAmount: positiveDecimalIntegerSchema.describe("Reference output token amount"),
  }),
  z.object({
    ...expectedDeltasBase,
    operation: uniswapV4MintOperationSchema.describe("Mint operation being analyzed"),
  }),
  expectedDeltasWithPosition(uniswapV4IncreaseOperationSchema),
  expectedDeltasWithPosition(uniswapV4DecreaseOperationSchema),
  expectedDeltasWithPosition(uniswapV4CollectOperationSchema),
  expectedDeltasWithPosition(uniswapV4BurnOperationSchema),
]);
