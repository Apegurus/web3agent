import { getWalletState } from "../wallet/persistence.js";
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
  const resolvedParams = { ...params };
  if (!resolvedParams.swapper && !resolvedParams.hash) {
    const wallet = getWalletState();
    if (wallet.address) {
      resolvedParams.swapper = wallet.address;
    }
  }
  return invokeAndRequireData<ListOrdersResult>(runtime, "orbs_query_orders", resolvedParams);
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
