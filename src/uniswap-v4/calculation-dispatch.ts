import type { z } from "zod";
import { Web3AgentError } from "../api/errors.js";
import {
  type uniswapV4CalculationInputSchema,
  uniswapV4CalculationResultSchema,
} from "../api/schemas.js";
import {
  calculateLifecycleDeltas,
  calculateLiquidityAmounts,
  calculatePriceTick,
  calculateQuotePriceImpact,
  calculateTickPrice,
  estimatePositionFees,
} from "./analysis.js";
import { getPoolIdentity } from "./sdk-adapter-api.js";

type CalculationInput = z.infer<typeof uniswapV4CalculationInputSchema>;
type CalculationResult = z.infer<typeof uniswapV4CalculationResultSchema>;

function stateMismatch(message: string): never {
  throw new Web3AgentError({ code: "UNISWAP_V4_ANALYSIS_STATE_MISMATCH", message });
}

function assertLifecycleState(input: Extract<CalculationInput, { kind: "expectedDeltas" }>): void {
  const { operation, pool } = input;
  if (
    operation.sourceBlock.chainId !== pool.sourceBlock.chainId ||
    operation.sourceBlock.blockNumber !== pool.sourceBlock.blockNumber ||
    operation.sourceBlock.blockHash.toLowerCase() !== pool.sourceBlock.blockHash.toLowerCase()
  ) {
    stateMismatch("Lifecycle operation and pool must use the same pinned source block");
  }
  if (getPoolIdentity(operation.poolKey).poolId.toLowerCase() !== pool.pool.poolId.toLowerCase()) {
    stateMismatch("Lifecycle operation and pool must identify the same pool");
  }
  if (operation.kind === "mint") return;
  if (!("position" in input)) {
    stateMismatch("Non-mint lifecycle calculations require a current position");
  }
  const { position } = input;
  if (operation.tokenId !== position.tokenId) {
    stateMismatch("Lifecycle operation and position must identify the same token");
  }
  if (
    operation.kind === "increase" &&
    (operation.tickLower !== position.tickLower || operation.tickUpper !== position.tickUpper)
  ) {
    stateMismatch("Increase operation ticks must match the current position range");
  }
}

function assertNever(value: never): never {
  throw new Web3AgentError({
    code: "UNISWAP_V4_ANALYSIS_INPUT_INVALID",
    details: { value },
    message: "Unsupported Uniswap v4 calculation kind",
  });
}

export function calculateUniswapV4(input: CalculationInput): CalculationResult {
  switch (input.kind) {
    case "tickToPrice":
      return uniswapV4CalculationResultSchema.parse({
        kind: input.kind,
        poolKey: input.poolKey,
        ...calculateTickPrice(input),
      });
    case "priceToTick":
      return uniswapV4CalculationResultSchema.parse({
        kind: input.kind,
        poolKey: input.poolKey,
        price: input.price,
        ...calculatePriceTick(input),
      });
    case "liquidityAmounts":
      return uniswapV4CalculationResultSchema.parse({
        kind: input.kind,
        liquidity: input.liquidity,
        ...calculateLiquidityAmounts(input),
      });
    case "feeEstimate":
      return uniswapV4CalculationResultSchema.parse({
        kind: input.kind,
        ...estimatePositionFees(input),
      });
    case "quotePriceImpact": {
      const impact = calculateQuotePriceImpact({
        kind: input.quoteKind,
        quotedInputAmount: input.quotedInputAmount,
        quotedOutputAmount: input.quotedOutputAmount,
        referenceInputAmount: input.referenceInputAmount,
        referenceOutputAmount: input.referenceOutputAmount,
      });
      return uniswapV4CalculationResultSchema.parse({
        kind: input.kind,
        quoteKind: impact.kind,
        priceImpactBps: impact.priceImpactBps,
      });
    }
    case "expectedDeltas":
      assertLifecycleState(input);
      return uniswapV4CalculationResultSchema.parse({
        kind: input.kind,
        deltas: calculateLifecycleDeltas(input),
      });
    default:
      return assertNever(input);
  }
}
