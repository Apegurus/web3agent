import type { CcxtExchangeDescription } from "../api/types.js";
import type { CcxtExchangeLike } from "./types.js";

const MARKET_TYPES = ["spot", "margin", "future", "swap", "option"] as const;

interface ConfiguredExchangeAccount {
  name: string;
  hasCredentials: boolean;
}

export function describeExchangeCapabilities(
  exchange: CcxtExchangeLike,
  configuredAccounts: ConfiguredExchangeAccount[]
): CcxtExchangeDescription {
  const hasEntries = Object.entries(exchange.has ?? {}).filter(
    ([, value]) => typeof value === "boolean" || value === "emulated"
  );
  const accountNames = configuredAccounts.map((account) => account.name);
  const hasAuthenticatedAccount = configuredAccounts.some((account) => account.hasCredentials);

  return {
    exchangeId: exchange.id,
    name: exchange.name ?? exchange.id,
    has: Object.fromEntries(hasEntries),
    timeframes: exchange.timeframes ? Object.keys(exchange.timeframes) : undefined,
    symbols: exchange.symbols,
    marketTypes: MARKET_TYPES.filter((marketType) => Boolean(exchange.has?.[marketType])),
    configuredAccounts: accountNames,
    requiresAuthFor: ["private_read", "private_write"],
    supportedInvocationModes: hasAuthenticatedAccount
      ? ["public", "private_read", "private_write"]
      : ["public"],
  };
}
