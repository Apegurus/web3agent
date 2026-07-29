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
  UniswapV4CalculatePositionInput,
  UniswapV4Calculation,
  UniswapV4CalculationInput,
  UniswapV4CalculationResult,
  UniswapV4Deployment,
  UniswapV4EventPage,
  UniswapV4EventQuery,
  UniswapV4GetDeploymentInput,
  UniswapV4GetPoolInput,
  UniswapV4GetPositionInput,
  UniswapV4PoolState,
  UniswapV4PositionState,
  UniswapV4SimulationInput,
  UniswapV4SimulationResult,
} from "./types.js";
import { parseInput } from "./validation.js";

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
