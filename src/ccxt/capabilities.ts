import type { CcxtExchangeDescription } from "../api/types.js";
import type { CcxtExchangeLike } from "./types.js";

const MARKET_TYPES = ["spot", "margin", "future", "swap", "option"] as const;

export const PRIVATE_READ_METHODS = [
  "fetchBalance",
  "fetchPositions",
  "fetchOpenOrders",
  "fetchMyTrades",
];

export const PRIVATE_WRITE_METHODS = [
  "createOrder",
  "cancelOrder",
  "transfer",
  "withdraw",
  "setLeverage",
];

/**
 * True if the exchange's `has` map advertises any of the given methods.
 * Treats both `true` and `"emulated"` as supported. Suitable for capability
 * gating where the goal is "is the method reachable at all".
 */
export function hasAnyPrivateMethod(
  has: Record<string, boolean | "emulated" | undefined> | undefined,
  methods: string[]
): boolean {
  if (!has) return false;
  return methods.some((method) => Boolean(has[method]));
}

interface ConfiguredExchangeAccount {
  name: string;
  hasCredentials: boolean;
}

function hasAnyMethod(exchange: CcxtExchangeLike, methods: string[]): boolean {
  return hasAnyPrivateMethod(exchange.has, methods);
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

  const supportsPrivateRead =
    hasAuthenticatedAccount && hasAnyMethod(exchange, PRIVATE_READ_METHODS);
  const supportsPrivateWrite =
    hasAuthenticatedAccount && hasAnyMethod(exchange, PRIVATE_WRITE_METHODS);

  const supportedInvocationModes: ("public" | "private_read" | "private_write")[] = ["public"];
  if (supportsPrivateRead) {
    supportedInvocationModes.push("private_read");
  }
  if (supportsPrivateWrite) {
    supportedInvocationModes.push("private_write");
  }

  const requiresAuthFor: string[] = [];
  if (supportsPrivateRead) {
    requiresAuthFor.push("private_read");
  }
  if (supportsPrivateWrite) {
    requiresAuthFor.push("private_write");
  }

  return {
    exchangeId: exchange.id,
    name: exchange.name ?? exchange.id,
    has: Object.fromEntries(hasEntries),
    timeframes: exchange.timeframes ? Object.keys(exchange.timeframes) : undefined,
    symbols: exchange.symbols,
    marketTypes: MARKET_TYPES.filter((marketType) => Boolean(exchange.has?.[marketType])),
    configuredAccounts: accountNames,
    requiresAuthFor,
    supportedInvocationModes,
  };
}
