import { orbsListOrdersSchema } from "./schemas.js";
import { getRuntime, invokeAndRequireData } from "./shared.js";
import type { ListOrdersResult, RuntimeBoundOptions } from "./types.js";
import { parseInput } from "./validation.js";

export async function listOrders(
  params: { chainId?: number },
  options?: RuntimeBoundOptions
): Promise<ListOrdersResult> {
  const runtime = await getRuntime(options);
  const input = parseInput(orbsListOrdersSchema, params);
  return invokeAndRequireData<ListOrdersResult>(runtime, "orbs_list_orders", input);
}
