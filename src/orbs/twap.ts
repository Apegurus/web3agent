import {
  Configs,
  type Order,
  type SpotConfig,
  getAccountOrders,
  getConfig as getTwapConfig,
} from "@orbs-network/twap-sdk";

export type { Order };

export function getChainConfig(chainId: number): SpotConfig | undefined {
  const match = Object.values(Configs).find((c) => c.chainId === chainId);
  if (!match) return undefined;
  return getTwapConfig(chainId, match.partner as Parameters<typeof getTwapConfig>[1]);
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
