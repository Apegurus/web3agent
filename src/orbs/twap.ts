import {
  buildRePermitOrderData,
  getAccountOrders,
  getConfig as getTwapConfig,
  getSrcTokenChunkAmount,
  getDeadline,
  submitOrder,
  type Config,
  type Order,
  type Partners,
  type RePermitOrder,
  type RePermitTypedData,
  type Signature,
  type SpotConfig,
  type TimeDuration,
  TimeUnit,
} from "@orbs-network/twap-sdk";

export type { Order, RePermitOrder, Signature };

const DEFAULT_PARTNER = "quick" as Partners;

export function getChainConfig(
  chainId: number,
  partner?: string,
): SpotConfig | undefined {
  return getTwapConfig(chainId, (partner ?? DEFAULT_PARTNER) as Partners);
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
    throw new Error(
      `No TWAP config available for chain ${params.chainId}`,
    );
  }

  const srcAmountPerTrade = getSrcTokenChunkAmount(
    params.srcAmount,
    params.chunks,
  );

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
  signature: Signature,
): Promise<Order> {
  return submitOrder(order, signature);
}

export async function listOrders(
  chainId: number,
  account: string,
  options?: { limit?: number; page?: number },
): Promise<Order[]> {
  return getAccountOrders({
    chainId,
    account,
    limit: options?.limit ?? 50,
    page: options?.page ?? 0,
  });
}

export function buildDeadline(durationSeconds: number): number {
  const duration: TimeDuration = {
    unit: TimeUnit.Minutes,
    value: Math.ceil(durationSeconds / 60),
  };
  return getDeadline(Date.now(), duration);
}
