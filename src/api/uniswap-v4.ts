import {
  uniswapV4BurnPositionSchema,
  uniswapV4CollectFeesSchema,
  uniswapV4DecreaseLiquiditySchema,
  uniswapV4IncreaseLiquiditySchema,
  uniswapV4MintPositionSchema,
} from "../tools/uniswap-v4/write-schemas.js";
import {
  uniswapV4CalculatePositionSchema,
  uniswapV4CalculationInputSchema,
  uniswapV4EventQuerySchema,
  uniswapV4GetDeploymentSchema,
  uniswapV4GetPoolSchema,
  uniswapV4GetPositionSchema,
  uniswapV4SimulationInputSchema,
} from "./schemas.js";
import { getRuntime, invokeAndRequireData } from "./shared.js";
import type {
  RuntimeBoundOptions,
  UniswapV4BurnOperation,
  UniswapV4CalculatePositionInput,
  UniswapV4Calculation,
  UniswapV4CalculationInput,
  UniswapV4CalculationResult,
  UniswapV4CollectOperation,
  UniswapV4DecreaseOperation,
  UniswapV4Deployment,
  UniswapV4EventPage,
  UniswapV4EventQuery,
  UniswapV4GetDeploymentInput,
  UniswapV4GetPoolInput,
  UniswapV4GetPositionInput,
  UniswapV4IncreaseOperation,
  UniswapV4MintOperation,
  UniswapV4PoolState,
  UniswapV4PositionState,
  UniswapV4SimulationInput,
  UniswapV4SimulationResult,
  WriteOperationResult,
} from "./types.js";
import { parseInput } from "./validation.js";
import { normalizeWriteResult } from "./write-results.js";

export async function getUniswapV4Deployment(
  params: UniswapV4GetDeploymentInput,
  options?: RuntimeBoundOptions
): Promise<UniswapV4Deployment> {
  const input = parseInput(uniswapV4GetDeploymentSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "uniswap_v4_get_deployment", input);
}

export async function getUniswapV4Pool(
  params: UniswapV4GetPoolInput,
  options?: RuntimeBoundOptions
): Promise<UniswapV4PoolState> {
  const input = parseInput(uniswapV4GetPoolSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "uniswap_v4_get_pool", input);
}

export async function getUniswapV4Position(
  params: UniswapV4GetPositionInput,
  options?: RuntimeBoundOptions
): Promise<UniswapV4PositionState> {
  const input = parseInput(uniswapV4GetPositionSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "uniswap_v4_get_position", input);
}

export async function getUniswapV4Events(
  params: UniswapV4EventQuery,
  options?: RuntimeBoundOptions
): Promise<UniswapV4EventPage> {
  const input = parseInput(uniswapV4EventQuerySchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "uniswap_v4_get_events", input);
}

export async function calculateUniswapV4Position(
  params: UniswapV4CalculatePositionInput,
  options?: RuntimeBoundOptions
): Promise<UniswapV4Calculation> {
  const input = parseInput(uniswapV4CalculatePositionSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "uniswap_v4_calculate_position", input);
}

export async function calculateUniswapV4(
  params: UniswapV4CalculationInput,
  options?: RuntimeBoundOptions
): Promise<UniswapV4CalculationResult> {
  const input = parseInput(uniswapV4CalculationInputSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "uniswap_v4_calculate", input);
}

export async function simulateUniswapV4Operation(
  params: UniswapV4SimulationInput,
  options?: RuntimeBoundOptions
): Promise<UniswapV4SimulationResult> {
  const input = parseInput(uniswapV4SimulationInputSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "uniswap_v4_simulate_operation", input);
}

export async function mintUniswapV4Position(
  params: UniswapV4MintOperation,
  options?: RuntimeBoundOptions
): Promise<WriteOperationResult> {
  const input = parseInput(uniswapV4MintPositionSchema, params);
  const runtime = await getRuntime(options);
  return normalizeWriteResult(
    await invokeAndRequireData(runtime, "uniswap_v4_mint_position", input)
  );
}

export async function increaseUniswapV4Liquidity(
  params: UniswapV4IncreaseOperation,
  options?: RuntimeBoundOptions
): Promise<WriteOperationResult> {
  const input = parseInput(uniswapV4IncreaseLiquiditySchema, params);
  const runtime = await getRuntime(options);
  return normalizeWriteResult(
    await invokeAndRequireData(runtime, "uniswap_v4_increase_liquidity", input)
  );
}

export async function decreaseUniswapV4Liquidity(
  params: UniswapV4DecreaseOperation,
  options?: RuntimeBoundOptions
): Promise<WriteOperationResult> {
  const input = parseInput(uniswapV4DecreaseLiquiditySchema, params);
  const runtime = await getRuntime(options);
  return normalizeWriteResult(
    await invokeAndRequireData(runtime, "uniswap_v4_decrease_liquidity", input)
  );
}

export async function collectUniswapV4Fees(
  params: UniswapV4CollectOperation,
  options?: RuntimeBoundOptions
): Promise<WriteOperationResult> {
  const input = parseInput(uniswapV4CollectFeesSchema, params);
  const runtime = await getRuntime(options);
  return normalizeWriteResult(
    await invokeAndRequireData(runtime, "uniswap_v4_collect_fees", input)
  );
}

export async function burnUniswapV4Position(
  params: UniswapV4BurnOperation,
  options?: RuntimeBoundOptions
): Promise<WriteOperationResult> {
  const input = parseInput(uniswapV4BurnPositionSchema, params);
  const runtime = await getRuntime(options);
  return normalizeWriteResult(
    await invokeAndRequireData(runtime, "uniswap_v4_burn_position", input)
  );
}
