import { zodToJsonSchema } from "zod-to-json-schema";

import {
  uniswapV4CalculatePositionSchema,
  uniswapV4CalculationInputSchema,
  uniswapV4EventQuerySchema,
  uniswapV4GetDeploymentSchema,
  uniswapV4GetPoolSchema,
  uniswapV4GetPositionSchema,
  uniswapV4SimulationInputSchema,
} from "../../api/schemas.js";
import type { UniswapV4OperationSimulationBackend } from "../../uniswap-v4/reconcile-operation.js";
import type { ToolDefinition } from "../register.js";
import {
  createUniswapV4SimulateOperation,
  uniswapV4BurnPosition,
  uniswapV4Calculate,
  uniswapV4CalculatePosition,
  uniswapV4CollectFees,
  uniswapV4DecreaseLiquidity,
  uniswapV4GetDeployment,
  uniswapV4GetEvents,
  uniswapV4GetPool,
  uniswapV4GetPosition,
  uniswapV4IncreaseLiquidity,
  uniswapV4MintPosition,
} from "./handlers.js";
import {
  uniswapV4BurnPositionSchema,
  uniswapV4CollectFeesSchema,
  uniswapV4DecreaseLiquiditySchema,
  uniswapV4IncreaseLiquiditySchema,
  uniswapV4MintPositionSchema,
} from "./write-schemas.js";

const UNISWAP_V4_READ_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
  readOnlyHint: true,
} as const;

const UNISWAP_V4_WRITE_ANNOTATIONS = {
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
  readOnlyHint: false,
} as const;

export type UniswapV4ToolOptions = {
  readonly simulationBackend?: UniswapV4OperationSimulationBackend;
};

export function getUniswapV4ToolDefinitions(options: UniswapV4ToolOptions = {}): ToolDefinition[] {
  return [
    {
      name: "uniswap_v4_get_deployment",
      category: "onchain",
      description: "Get the verified Uniswap v4 deployment addresses for a chain.",
      inputSchema: zodToJsonSchema(uniswapV4GetDeploymentSchema) as Record<string, unknown>,
      handler: uniswapV4GetDeployment,
      annotations: UNISWAP_V4_READ_ANNOTATIONS,
    },
    {
      name: "uniswap_v4_get_pool",
      category: "onchain",
      description: "Read a Uniswap v4 pool snapshot at one explicit verified block.",
      inputSchema: zodToJsonSchema(uniswapV4GetPoolSchema) as Record<string, unknown>,
      handler: uniswapV4GetPool,
      annotations: UNISWAP_V4_READ_ANNOTATIONS,
    },
    {
      name: "uniswap_v4_get_position",
      category: "onchain",
      description: "Read a Uniswap v4 PositionManager NFT snapshot at one explicit block.",
      inputSchema: zodToJsonSchema(uniswapV4GetPositionSchema) as Record<string, unknown>,
      handler: uniswapV4GetPosition,
      annotations: UNISWAP_V4_READ_ANNOTATIONS,
    },
    {
      name: "uniswap_v4_get_events",
      category: "onchain",
      description: "Read a bounded, cursor-paginated Uniswap v4 pool or position event history.",
      inputSchema: zodToJsonSchema(uniswapV4EventQuerySchema) as Record<string, unknown>,
      handler: uniswapV4GetEvents,
      annotations: UNISWAP_V4_READ_ANNOTATIONS,
    },
    {
      name: "uniswap_v4_calculate_position",
      category: "onchain",
      description:
        "Calculate current exact token amounts from matching Uniswap v4 pool and position snapshots.",
      inputSchema: zodToJsonSchema(uniswapV4CalculatePositionSchema) as Record<string, unknown>,
      handler: uniswapV4CalculatePosition,
      annotations: UNISWAP_V4_READ_ANNOTATIONS,
    },
    {
      name: "uniswap_v4_calculate",
      category: "onchain",
      description:
        "Run exact Uniswap v4 price, liquidity, fee, quote-impact, or lifecycle-delta calculations.",
      inputSchema: zodToJsonSchema(uniswapV4CalculationInputSchema) as Record<string, unknown>,
      handler: uniswapV4Calculate,
      annotations: UNISWAP_V4_READ_ANNOTATIONS,
    },
    {
      name: "uniswap_v4_simulate_operation",
      category: "onchain",
      description:
        "Simulate ordered Uniswap v4 lifecycle transaction stages without reporting success for blocked prerequisites.",
      inputSchema: zodToJsonSchema(uniswapV4SimulationInputSchema) as Record<string, unknown>,
      handler: createUniswapV4SimulateOperation(options.simulationBackend),
      annotations: UNISWAP_V4_READ_ANNOTATIONS,
    },
    {
      name: "uniswap_v4_mint_position",
      category: "onchain",
      description: "Plan and confirmation-gate a server-wallet Uniswap v4 position mint.",
      inputSchema: zodToJsonSchema(uniswapV4MintPositionSchema) as Record<string, unknown>,
      handler: uniswapV4MintPosition,
      riskLevel: "financial",
      annotations: UNISWAP_V4_WRITE_ANNOTATIONS,
    },
    {
      name: "uniswap_v4_increase_liquidity",
      category: "onchain",
      description: "Plan and confirmation-gate a server-wallet Uniswap v4 liquidity increase.",
      inputSchema: zodToJsonSchema(uniswapV4IncreaseLiquiditySchema) as Record<string, unknown>,
      handler: uniswapV4IncreaseLiquidity,
      riskLevel: "financial",
      annotations: UNISWAP_V4_WRITE_ANNOTATIONS,
    },
    {
      name: "uniswap_v4_decrease_liquidity",
      category: "onchain",
      description: "Plan and confirmation-gate a server-wallet Uniswap v4 liquidity decrease.",
      inputSchema: zodToJsonSchema(uniswapV4DecreaseLiquiditySchema) as Record<string, unknown>,
      handler: uniswapV4DecreaseLiquidity,
      riskLevel: "financial",
      annotations: UNISWAP_V4_WRITE_ANNOTATIONS,
    },
    {
      name: "uniswap_v4_collect_fees",
      category: "onchain",
      description:
        "Plan and confirmation-gate a server-wallet collect-all Uniswap v4 fee withdrawal.",
      inputSchema: zodToJsonSchema(uniswapV4CollectFeesSchema) as Record<string, unknown>,
      handler: uniswapV4CollectFees,
      riskLevel: "financial",
      annotations: UNISWAP_V4_WRITE_ANNOTATIONS,
    },
    {
      name: "uniswap_v4_burn_position",
      category: "onchain",
      description:
        "Plan and confirmation-gate a server-wallet 100% Uniswap v4 position exit and burn.",
      inputSchema: zodToJsonSchema(uniswapV4BurnPositionSchema) as Record<string, unknown>,
      handler: uniswapV4BurnPosition,
      riskLevel: "financial",
      annotations: UNISWAP_V4_WRITE_ANNOTATIONS,
    },
  ];
}
