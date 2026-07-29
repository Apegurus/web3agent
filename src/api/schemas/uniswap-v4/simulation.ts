import { z } from "zod";

import { uniswapV4ExpectedDeltasSchema } from "./calculations.js";
import { uniswapV4EventSchema } from "./events.js";
import { uniswapV4LifecycleOperationSchema } from "./lifecycle.js";
import {
  decimalIntegerSchema,
  transactionHashSchema,
  uniswapV4BlockReferenceSchema,
} from "./primitives.js";
import { uniswapV4PoolStateSchema, uniswapV4PositionStateSchema } from "./state.js";

const observedDeltaSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("available").describe("Observed delta availability"),
    value: z
      .string()
      .regex(/^-?(0|[1-9]\d*)$/)
      .describe("Observed signed integer delta"),
  }),
  z.object({
    reason: z.string().min(1).describe("Reason the delta cannot be determined"),
    status: z.literal("unavailable").describe("Observed delta availability"),
  }),
]);

export const uniswapV4ActualDeltasSchema = z.object({
  kind: z
    .enum(["mint", "increase", "decrease", "collect", "burn"])
    .describe("Lifecycle action producing observed deltas"),
  liquidityDelta: observedDeltaSchema.describe("Observed position liquidity delta"),
  nativeValueDelta: observedDeltaSchema.describe(
    "Observed native balance delta excluding unknown gas"
  ),
  token0Delta: observedDeltaSchema.describe("Observed signed currency0 balance delta"),
  token1Delta: observedDeltaSchema.describe("Observed signed currency1 balance delta"),
});

const expectedDeltaComparisonSchema = z.discriminatedUnion("status", [
  z.object({
    matchesExpected: z.literal(true).describe("Observed deltas satisfy all expected ranges"),
    mismatches: z.array(z.string()).describe("Expected range mismatch explanations"),
    status: z.literal("matched").describe("Expected-delta comparison outcome"),
    unavailable: z.array(z.string()).describe("Delta components unavailable for comparison"),
  }),
  z.object({
    matchesExpected: z
      .literal(false)
      .describe("At least one observed delta violates its expected range"),
    mismatches: z.array(z.string()).min(1).describe("Expected range mismatch explanations"),
    status: z.literal("mismatched").describe("Expected-delta comparison outcome"),
    unavailable: z.array(z.string()).describe("Delta components unavailable for comparison"),
  }),
  z.object({
    matchesExpected: z
      .null()
      .describe("Comparison is inconclusive because one or more deltas are unavailable"),
    mismatches: z.array(z.string()).describe("Expected range mismatch explanations"),
    status: z.literal("unavailable").describe("Expected-delta comparison outcome"),
    unavailable: z.array(z.string()).min(1).describe("Delta components unavailable for comparison"),
  }),
]);

const stateObservationSchema = <TSchema extends z.ZodTypeAny>(schema: TSchema, label: string) =>
  z.discriminatedUnion("status", [
    z.object({
      status: z.literal("available").describe(`${label} availability`),
      value: schema.describe(`Observed ${label}`),
    }),
    z.object({
      reason: z.string().min(1).describe(`Reason ${label} is unavailable`),
      status: z.literal("unavailable").describe(`${label} availability`),
    }),
  ]);

const tokenBalanceObservationSchema = z.object({
  currency: z.enum(["currency0", "currency1"]).describe("Pool currency balance observed"),
  value: observedDeltaSchema.describe("Observed account balance delta for the currency"),
});

export const uniswapV4SimulationInputSchema = z
  .object({
    operation: uniswapV4LifecycleOperationSchema.describe("Lifecycle operation to simulate"),
    sourceBlock: uniswapV4BlockReferenceSchema.describe("Block used for simulation prerequisites"),
  })
  .superRefine((value, context) => {
    if (
      value.sourceBlock.chainId !== value.operation.sourceBlock.chainId ||
      value.sourceBlock.blockNumber !== value.operation.sourceBlock.blockNumber ||
      value.sourceBlock.blockHash.toLowerCase() !==
        value.operation.sourceBlock.blockHash.toLowerCase()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "simulation sourceBlock must match the lifecycle operation sourceBlock",
        path: ["sourceBlock"],
      });
    }
  });

export const uniswapV4SimulationStageSchema = z.discriminatedUnion("status", [
  z.object({
    balanceChangesSource: z
      .enum(["trace", "fallback"])
      .describe("Whether this stage used a balance trace or static decoding fallback"),
    gasEstimate: decimalIntegerSchema.describe("Estimated gas for the successful stage"),
    id: z.string().min(1).describe("Stable simulated stage identifier"),
    status: z.literal("succeeded").describe("Simulation stage success status"),
    traceComparison: expectedDeltaComparisonSchema
      .optional()
      .describe("Expected-range comparison emitted only when a trace exposed balance changes"),
  }),
  z.object({
    id: z.string().min(1).describe("Stable simulated stage identifier"),
    reason: z.string().min(1).describe("Decoded revert reason"),
    status: z.literal("reverted").describe("Simulation stage revert status"),
  }),
  z.object({
    blockedBy: z.string().min(1).describe("Unconfirmed prerequisite action identifier"),
    id: z.string().min(1).describe("Stable simulated stage identifier"),
    status: z
      .literal("blocked_by_prerequisite")
      .describe("Simulation stage prerequisite-blocked status"),
  }),
]);

export const uniswapV4ReconciliationSchema = z.object({
  actualDeltas: uniswapV4ActualDeltasSchema.describe("Observed receipt and balance deltas"),
  decodedEvents: z.array(uniswapV4EventSchema).describe("Decoded lifecycle receipt events"),
  expectedDeltas: uniswapV4ExpectedDeltasSchema.describe("Planner expected delta bounds"),
  matchesExpected: expectedDeltaComparisonSchema.describe(
    "Expected-range reconciliation diagnostics"
  ),
  postState: z
    .object({
      pool: stateObservationSchema(uniswapV4PoolStateSchema, "post-receipt pool state").describe(
        "Pool state reread at the receipt block"
      ),
      position: stateObservationSchema(
        uniswapV4PositionStateSchema,
        "post-receipt position state"
      ).describe("Position state reread at the receipt block"),
      tokenBalances: z
        .array(tokenBalanceObservationSchema)
        .describe("Available account token balance deltas"),
    })
    .describe("Post-receipt pool, position, and token state observations"),
  receipt: z
    .object({
      block: uniswapV4BlockReferenceSchema.describe("Confirmed receipt block"),
      status: z.literal("success").describe("Confirmed receipt execution status"),
      to: z
        .string()
        .regex(/^0x[0-9a-fA-F]{40}$/)
        .describe("Confirmed PositionManager transaction target"),
      transactionHash: transactionHashSchema.describe("Confirmed PositionManager transaction hash"),
    })
    .describe("Verified final PositionManager receipt"),
  receiptBlock: uniswapV4BlockReferenceSchema.describe("Confirmed receipt block"),
  receiptHash: transactionHashSchema.describe("Confirmed PositionManager transaction hash"),
  sourceBlock: uniswapV4BlockReferenceSchema.describe("Planner source block"),
});

export const uniswapV4SimulationResultSchema = z
  .object({
    sourceBlock: uniswapV4BlockReferenceSchema.describe("Block used for simulation prerequisites"),
    stages: z.array(uniswapV4SimulationStageSchema).min(1).describe("Ordered stage diagnostics"),
    success: z.boolean().describe("Whether every required simulation stage succeeded"),
    reconciliation: uniswapV4ReconciliationSchema
      .optional()
      .describe("Optional confirmed-receipt reconciliation"),
  })
  .superRefine((value, context) => {
    if (value.success && value.stages.some((stage) => stage.status !== "succeeded")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["success"],
        message: "success cannot be true when a stage reverted or is blocked by a prerequisite",
      });
    }
  });
