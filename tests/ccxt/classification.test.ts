import { describe, expect, it } from "vitest";
import {
  classifyCcxtMethod,
  classifyCcxtWriteRisk,
  isHighRiskCcxtMethod,
  isMethodAllowedForTool,
} from "../../src/ccxt/classification.js";

describe("classifyCcxtMethod", () => {
  it("classifies public unified methods", () => {
    expect(classifyCcxtMethod("fetchTicker")).toBe("public");
    expect(classifyCcxtMethod("fetchOrderBook")).toBe("public");
    expect(classifyCcxtMethod("fetchLiquidations")).toBe("public");
    expect(classifyCcxtMethod("fetchBidsAsks")).toBe("public");
    expect(classifyCcxtMethod("fetchMarkPrice")).toBe("public");
    expect(classifyCcxtMethod("fetchMarkPrices")).toBe("public");
    expect(classifyCcxtMethod("fetchPremiumIndex")).toBe("public");
    expect(classifyCcxtMethod("fetchStatus")).toBe("public");
    expect(classifyCcxtMethod("fetchTime")).toBe("public");
    expect(classifyCcxtMethod("fetchL2OrderBook")).toBe("public");
    expect(classifyCcxtMethod("fetchOpenInterestHistory")).toBe("public");
    expect(classifyCcxtMethod("fetchOpenInterest")).toBe("public");
  });

  it("classifies public implicit methods", () => {
    expect(classifyCcxtMethod("publicGetTicker")).toBe("public");
  });

  it("classifies exchange-prefixed public implicit methods", () => {
    expect(classifyCcxtMethod("dapiPublicGetPremiumIndex")).toBe("public");
    expect(classifyCcxtMethod("v5PublicGetMarketTickers")).toBe("public");
  });

  it("classifies authenticated read methods", () => {
    expect(classifyCcxtMethod("fetchBalance")).toBe("private_read");
    expect(classifyCcxtMethod("privateGetAccount")).toBe("private_read");
    expect(classifyCcxtMethod("fetchTradingFees")).toBe("private_read");
    expect(classifyCcxtMethod("fetchTradingFee")).toBe("private_read");
    expect(classifyCcxtMethod("fetchBorrowRate")).toBe("private_read");
    expect(classifyCcxtMethod("fetchBorrowRates")).toBe("private_read");
    expect(classifyCcxtMethod("fetchBorrowRateHistory")).toBe("private_read");
    expect(classifyCcxtMethod("fetchBorrowInterest")).toBe("private_read");
    expect(classifyCcxtMethod("fetchMyLiquidations")).toBe("private_read");
    expect(classifyCcxtMethod("fetchMarginModes")).toBe("private_read");
    expect(classifyCcxtMethod("fetchMarginMode")).toBe("private_read");
    expect(classifyCcxtMethod("fetchTransfers")).toBe("private_read");
    expect(classifyCcxtMethod("fetchAccounts")).toBe("private_read");
  });

  it("classifies exchange-prefixed private read implicit methods", () => {
    expect(classifyCcxtMethod("fapiPrivateGetBalance")).toBe("private_read");
    expect(classifyCcxtMethod("sapiPrivateGetCapitalConfigGetall")).toBe("private_read");
    expect(classifyCcxtMethod("v5PrivateGetAccountWalletBalance")).toBe("private_read");
  });

  it("classifies authenticated write methods", () => {
    expect(classifyCcxtMethod("createOrder")).toBe("private_write");
    expect(classifyCcxtMethod("privatePostOrder")).toBe("private_write");
  });

  it("classifies exchange-prefixed private write implicit methods", () => {
    expect(classifyCcxtMethod("fapiPrivatePostOrder")).toBe("private_write");
    expect(classifyCcxtMethod("sapiPrivatePostAssetTransfer")).toBe("private_write");
    expect(classifyCcxtMethod("fapiPrivateDeleteOrder")).toBe("private_write");
    expect(classifyCcxtMethod("sapiPrivatePutSomething")).toBe("private_write");
  });

  it("denies unknown methods", () => {
    expect(classifyCcxtMethod("someUnknownMethod")).toBe("deny");
  });

  it("still denies methods without any recognized pattern", () => {
    expect(classifyCcxtMethod("totallyUnknownMethod")).toBe("deny");
    expect(classifyCcxtMethod("fapiSomethingElse")).toBe("deny");
  });
});

describe("isMethodAllowedForTool", () => {
  it("allows methods only on the matching CCXT invocation tool", () => {
    expect(isMethodAllowedForTool("ccxt_public_call", "fetchTicker")).toBe(true);
    expect(isMethodAllowedForTool("ccxt_public_call", "fetchLiquidations")).toBe(true);
    expect(isMethodAllowedForTool("ccxt_public_call", "fetchBalance")).toBe(false);
    expect(isMethodAllowedForTool("ccxt_private_read", "fetchBalance")).toBe(true);
    expect(isMethodAllowedForTool("ccxt_private_read", "fetchLiquidations")).toBe(false);
    expect(isMethodAllowedForTool("ccxt_private_read", "createOrder")).toBe(false);
    expect(isMethodAllowedForTool("ccxt_private_write", "createOrder")).toBe(true);
  });
});

describe("isHighRiskCcxtMethod", () => {
  it("marks unified withdraw as high-risk", () => {
    expect(isHighRiskCcxtMethod("withdraw")).toBe(true);
  });

  it("marks unified transfer as high-risk", () => {
    expect(isHighRiskCcxtMethod("transfer")).toBe(true);
  });

  it("marks implicit transfer endpoint as high-risk", () => {
    expect(isHighRiskCcxtMethod("sapiPrivatePostAssetTransfer")).toBe(true);
  });

  it("marks implicit withdraw endpoint as high-risk", () => {
    expect(isHighRiskCcxtMethod("privatePostWithdraw")).toBe(true);
  });

  it("does not mark createOrder as high-risk", () => {
    expect(isHighRiskCcxtMethod("createOrder")).toBe(false);
  });

  it("does not mark cancelOrder as high-risk", () => {
    expect(isHighRiskCcxtMethod("cancelOrder")).toBe(false);
  });

  it("does not mark public methods as high-risk", () => {
    expect(isHighRiskCcxtMethod("fetchTicker")).toBe(false);
  });
});

describe("classifyCcxtWriteRisk", () => {
  it("classifies order-creation methods as financial", () => {
    expect(classifyCcxtWriteRisk("createOrder")).toBe("financial");
    expect(classifyCcxtWriteRisk("editOrder")).toBe("financial");
    expect(classifyCcxtWriteRisk("privatePostOrder")).toBe("financial");
    expect(classifyCcxtWriteRisk("fapiPrivatePostOrder")).toBe("financial");
    expect(classifyCcxtWriteRisk("privatePutOrder")).toBe("financial");
    expect(classifyCcxtWriteRisk("privatePatchOrder")).toBe("financial");
  });

  it("classifies order-cancellation and admin methods as destructive", () => {
    expect(classifyCcxtWriteRisk("cancelOrder")).toBe("destructive");
    expect(classifyCcxtWriteRisk("cancelAllOrders")).toBe("destructive");
    expect(classifyCcxtWriteRisk("setLeverage")).toBe("destructive");
    expect(classifyCcxtWriteRisk("setMarginMode")).toBe("destructive");
  });

  it("classifies high-risk movement methods as destructive", () => {
    // transfer/withdraw are USD-opaque at write time; checkHighRiskGuards
    // provides the secure-permissions gate for these separately.
    expect(classifyCcxtWriteRisk("transfer")).toBe("destructive");
    expect(classifyCcxtWriteRisk("withdraw")).toBe("destructive");
  });

  it("classifies unknown private write methods as destructive by default", () => {
    // Implicit PrivatePost/etc. — conservative default: no USD estimation,
    // admin-style. Still gated by confirmation + high-risk guards.
    expect(classifyCcxtWriteRisk("privatePostSomeUnknownEndpoint")).toBe("destructive");
  });
});
