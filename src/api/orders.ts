import { getRuntime, invokeAndRequireData } from "./shared.js";
import type {
  CancelOrderInput,
  ListOrdersResult,
  PlaceOrderInput,
  RuntimeBoundOptions,
} from "./types.js";

export async function listOrders(
  params: { chainId?: number; swapper?: string; hash?: string },
  options?: RuntimeBoundOptions
): Promise<ListOrdersResult> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData<ListOrdersResult>(runtime, "orbs_query_orders", params);
}

export async function placeOrder(
  params: PlaceOrderInput,
  options?: RuntimeBoundOptions
): Promise<{ status: string; response: unknown }> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "orbs_place_order", params);
}

export async function cancelOrder(
  params: CancelOrderInput,
  options?: RuntimeBoundOptions
): Promise<{ status: string; txHash: string }> {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "orbs_cancel_order", params);
}
