import { describe, expect, it } from "vitest";
import { classifyCcxtMethod, isMethodAllowedForTool } from "../../src/ccxt/classification.js";

describe("classifyCcxtMethod", () => {
  it("classifies public unified methods", () => {
    expect(classifyCcxtMethod("fetchTicker")).toBe("public");
    expect(classifyCcxtMethod("fetchOrderBook")).toBe("public");
  });

  it("classifies public implicit methods", () => {
    expect(classifyCcxtMethod("publicGetTicker")).toBe("public");
  });

  it("classifies authenticated read methods", () => {
    expect(classifyCcxtMethod("fetchBalance")).toBe("private_read");
    expect(classifyCcxtMethod("privateGetAccount")).toBe("private_read");
  });

  it("classifies authenticated write methods", () => {
    expect(classifyCcxtMethod("createOrder")).toBe("private_write");
    expect(classifyCcxtMethod("privatePostOrder")).toBe("private_write");
  });

  it("denies unknown methods", () => {
    expect(classifyCcxtMethod("someUnknownMethod")).toBe("deny");
  });
});

describe("isMethodAllowedForTool", () => {
  it("allows methods only on the matching CCXT invocation tool", () => {
    expect(isMethodAllowedForTool("ccxt_public_call", "fetchTicker")).toBe(true);
    expect(isMethodAllowedForTool("ccxt_public_call", "fetchBalance")).toBe(false);
    expect(isMethodAllowedForTool("ccxt_private_read", "fetchBalance")).toBe(true);
    expect(isMethodAllowedForTool("ccxt_private_read", "createOrder")).toBe(false);
    expect(isMethodAllowedForTool("ccxt_private_write", "createOrder")).toBe(true);
  });
});
