import {
  orbsListOrdersSchema,
  orbsPlaceLimitSchema,
  orbsPlaceTwapSchema,
} from "../tools/orbs/schemas.js";
import { getRuntime, invokeAndRequireData } from "./shared.js";
import type {
  ListOrdersInput,
  ListOrdersResult,
  PlaceLimitOrderInput,
  PlaceTwapOrderInput,
  RuntimeBoundOptions,
  WriteOperationResult,
} from "./types.js";
import { parseInput } from "./validation.js";
import { normalizeWriteResult } from "./write-results.js";

export async function placeLimitOrder(
  params: PlaceLimitOrderInput,
  options?: RuntimeBoundOptions
): Promise<WriteOperationResult> {
  const runtime = await getRuntime(options);
  const input = parseInput(orbsPlaceLimitSchema, params);
  const data = await invokeAndRequireData(runtime, "orbs_place_limit", input);
  return normalizeWriteResult(data);
}

export async function placeTwapOrder(
  params: PlaceTwapOrderInput,
  options?: RuntimeBoundOptions
): Promise<WriteOperationResult> {
  const runtime = await getRuntime(options);
  const input = parseInput(orbsPlaceTwapSchema, params);
  const data = await invokeAndRequireData(runtime, "orbs_place_twap", input);
  return normalizeWriteResult(data);
}

export async function listOrders(
  params: ListOrdersInput,
  options?: RuntimeBoundOptions
): Promise<ListOrdersResult> {
  const runtime = await getRuntime(options);
  const input = parseInput(orbsListOrdersSchema, params);
  return invokeAndRequireData<ListOrdersResult>(runtime, "orbs_list_orders", input);
}
