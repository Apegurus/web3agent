export type CcxtMethodClassification = "public" | "private_read" | "private_write" | "deny";

const PUBLIC_UNIFIED = new Set([
  "loadMarkets",
  "fetchMarkets",
  "fetchCurrencies",
  "fetchTicker",
  "fetchTickers",
  "fetchOrderBook",
  "fetchOHLCV",
  "fetchTrades",
  "fetchFundingRate",
  "fetchFundingRates",
  "fetchFundingRateHistory",
]);

const PRIVATE_READ_UNIFIED = new Set([
  "fetchBalance",
  "fetchOrders",
  "fetchOpenOrders",
  "fetchClosedOrders",
  "fetchOrder",
  "fetchMyTrades",
  "fetchPositions",
  "fetchPosition",
  "fetchLeverage",
  "fetchLedger",
  "fetchDeposits",
  "fetchWithdrawals",
  "fetchTransactions",
]);

const PRIVATE_WRITE_UNIFIED = new Set([
  "createOrder",
  "editOrder",
  "cancelOrder",
  "cancelAllOrders",
  "setLeverage",
  "setMarginMode",
  "transfer",
  "withdraw",
]);

export function classifyCcxtMethod(method: string): CcxtMethodClassification {
  if (PUBLIC_UNIFIED.has(method)) {
    return "public";
  }
  if (PRIVATE_READ_UNIFIED.has(method)) {
    return "private_read";
  }
  if (PRIVATE_WRITE_UNIFIED.has(method)) {
    return "private_write";
  }

  if (method.startsWith("publicGet")) {
    return "public";
  }
  if (method.startsWith("privateGet")) {
    return "private_read";
  }
  if (
    method.startsWith("privatePost") ||
    method.startsWith("privatePut") ||
    method.startsWith("privatePatch") ||
    method.startsWith("privateDelete")
  ) {
    return "private_write";
  }

  return "deny";
}

export function isMethodAllowedForTool(
  toolName: "ccxt_public_call" | "ccxt_private_read" | "ccxt_private_write",
  method: string
): boolean {
  const classification = classifyCcxtMethod(method);
  if (classification === "deny") {
    return false;
  }

  return (
    (toolName === "ccxt_public_call" && classification === "public") ||
    (toolName === "ccxt_private_read" && classification === "private_read") ||
    (toolName === "ccxt_private_write" && classification === "private_write")
  );
}
