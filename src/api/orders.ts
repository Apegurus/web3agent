import { getRuntime, invokeAndRequireData } from "./shared.js";
import type { ListOrdersResult, RuntimeBoundOptions } from "./types.js";

export async function listOrders(
  params: { chainId?: number; swapper?: string; hash?: string },
  options?: RuntimeBoundOptions
): Promise<ListOrdersResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ListOrdersResult>(runtime, "orbs_query_orders", params);
}

export async function placeOrder(
  params: Record<string, unknown>,
  options?: RuntimeBoundOptions
): Promise<unknown> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "orbs_place_order", params);
}

export async function cancelOrder(
  params: { chainId?: number; digest: string },
  options?: RuntimeBoundOptions
): Promise<unknown> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "orbs_cancel_order", params);
}
