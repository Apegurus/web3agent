import type { CcxtExchangeDescription } from "../api/types.js";
import type { CcxtExchangeLike } from "./types.js";

const MARKET_TYPES = ["spot", "margin", "future", "swap", "option"] as const;

export function describeExchangeCapabilities(
  exchange: CcxtExchangeLike,
  configuredAccounts: string[]
): CcxtExchangeDescription {
  const hasEntries = Object.entries(exchange.has ?? {}).filter(
    ([, value]) => typeof value === "boolean" || value === "emulated"
  );

  return {
    exchangeId: exchange.id,
    name: exchange.name ?? exchange.id,
    has: Object.fromEntries(hasEntries),
    timeframes: exchange.timeframes ? Object.keys(exchange.timeframes) : undefined,
    symbols: exchange.symbols,
    marketTypes: MARKET_TYPES.filter((marketType) => Boolean(exchange.has?.[marketType])),
    configuredAccounts,
    requiresAuthFor: ["private_read", "private_write"],
    supportedInvocationModes:
      configuredAccounts.length > 0 ? ["public", "private_read", "private_write"] : ["public"],
  };
}
