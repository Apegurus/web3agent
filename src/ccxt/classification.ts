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
  "fetchLiquidations",
  "fetchFundingRate",
  "fetchFundingRates",
  "fetchFundingRateHistory",
  "fetchBidsAsks",
  "fetchMarkPrice",
  "fetchMarkPrices",
  "fetchPremiumIndex",
  "fetchStatus",
  "fetchTime",
  "fetchL2OrderBook",
  "fetchOpenInterestHistory",
  "fetchOpenInterest",
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
  "fetchTradingFees",
  "fetchTradingFee",
  "fetchBorrowRate",
  "fetchBorrowRates",
  "fetchBorrowRateHistory",
  "fetchBorrowInterest",
  "fetchMyLiquidations",
  "fetchMarginModes",
  "fetchMarginMode",
  "fetchTransfers",
  "fetchAccounts",
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

const IMPLICIT_PUBLIC = /PublicGet/i;
const IMPLICIT_PRIVATE_READ = /PrivateGet/i;
const IMPLICIT_PRIVATE_WRITE = /Private(?:Post|Put|Patch|Delete)/i;
const HIGH_RISK_PATTERN = /withdraw|transfer/i;

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

  if (IMPLICIT_PUBLIC.test(method)) {
    return "public";
  }
  if (IMPLICIT_PRIVATE_READ.test(method)) {
    return "private_read";
  }
  if (IMPLICIT_PRIVATE_WRITE.test(method)) {
    return "private_write";
  }

  return "deny";
}

export function isHighRiskCcxtMethod(method: string): boolean {
  const classification = classifyCcxtMethod(method);
  if (classification !== "private_write") return false;
  return HIGH_RISK_PATTERN.test(method);
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
