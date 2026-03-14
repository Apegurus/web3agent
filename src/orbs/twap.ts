import {
  Configs,
  type Order,
  type Partners,
  type RePermitOrder,
  type RePermitTypedData,
  type Signature,
  type SpotConfig,
  buildRePermitOrderData,
  getAccountOrders,
  getSrcTokenChunkAmount,
  getConfig as getTwapConfig,
  submitOrder,
} from "@orbs-network/twap-sdk";

export type { Order, RePermitOrder, Signature };
export { getSrcTokenChunkAmount };

export function getChainConfig(chainId: number): SpotConfig | undefined {
  const match = Object.values(Configs).find((c) => c.chainId === chainId);
  if (!match) return undefined;
  return getTwapConfig(chainId, match.partner as Partners);
}

export interface TwapOrderParams {
  chainId: number;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  chunks: number;
  fillDelaySeconds: number;
  durationSeconds: number;
  slippage?: number;
  account: string;
  dstMinAmountPerTrade?: string;
  triggerAmountPerTrade?: string;
}

export interface PreparedOrder {
  domain: RePermitTypedData["domain"];
  order: RePermitOrder;
  types: RePermitTypedData["types"];
  primaryType: string;
}

export function prepareTwapOrder(params: TwapOrderParams): PreparedOrder {
  const config = getChainConfig(params.chainId);
  if (!config) {
    throw new Error(`No TWAP config available for chain ${params.chainId}`);
  }

  const srcAmountPerTrade = getSrcTokenChunkAmount(params.srcAmount, params.chunks);

  const fillDelayMillis = params.fillDelaySeconds * 1000;
  const durationMillis = params.durationSeconds * 1000;
  const deadlineMillis = Date.now() + durationMillis;

  const orderData = buildRePermitOrderData({
    chainId: params.chainId,
    srcToken: params.srcToken,
    dstToken: params.dstToken,
    srcAmount: params.srcAmount,
    deadlineMillis,
    fillDelayMillis,
    slippage: params.slippage ?? 0.5,
    account: params.account,
    srcAmountPerTrade,
    dstMinAmountPerTrade: params.dstMinAmountPerTrade,
    triggerAmountPerTrade: params.triggerAmountPerTrade,
    config,
  });

  return {
    domain: orderData.domain as PreparedOrder["domain"],
    order: orderData.order,
    types: orderData.types as PreparedOrder["types"],
    primaryType: orderData.primaryType,
  };
}

export async function submitSignedOrder(
  order: RePermitOrder,
  signature: Signature
): Promise<Order> {
  return submitOrder(order, signature);
}

export async function listOrders(
  chainId: number,
  account: string,
  options?: { limit?: number; page?: number }
): Promise<Order[]> {
  return getAccountOrders({
    chainId,
    account,
    limit: options?.limit ?? 50,
    page: options?.page ?? 0,
  });
}
