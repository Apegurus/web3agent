import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resilientFetch: vi.fn(),
}));

vi.mock("../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: mocks.resilientFetch,
}));

import { Web3AgentError } from "../../src/api/errors.js";
import { TimeoutError } from "../../src/utils/timeout.js";
import { classifyZeroExError, getZeroExQuote } from "../../src/zerox/client.js";

const request = {
  apiKey: "test-api-key",
  chainId: 4663,
  fromToken: "0x1111111111111111111111111111111111111111",
  toToken: "0x2222222222222222222222222222222222222222",
  fromAmount: "1000000",
  taker: "0x3333333333333333333333333333333333333333",
  slippageBps: 100,
  referencePrice: "1",
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("0x API v2 native client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes the v2 allowance-holder quote, transaction, allowance amount, and exact price impact", async () => {
    // Given: an executable 0x v2 quote response
    mocks.resilientFetch.mockResolvedValue(
      jsonResponse({
        buyAmount: "950000",
        sellAmount: "1000000",
        liquidityAvailable: true,
        price: "0.95",
        issues: { allowance: { spender: "0x4444444444444444444444444444444444444444" } },
        transaction: {
          to: "0x5555555555555555555555555555555555555555",
          data: "0x1234",
          value: "7",
        },
      })
    );

    // When: the native adapter requests a quote
    const quote = await getZeroExQuote(request);

    // Then: the executable parts are parsed and no floating-point price math is used
    expect(mocks.resilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("/swap/allowance-holder/quote?"),
      expect.objectContaining({
        headers: expect.objectContaining({ "0x-api-key": "test-api-key", "0x-version": "v2" }),
      }),
      expect.objectContaining({ label: "0x swap API v2", timeoutMs: 15_000 })
    );
    expect(quote).toEqual({
      provider: "0x",
      chainId: 4663,
      adapterSource: "native",
      capabilityDecisionId: "zeroex-goat-v2-admission-v1",
      capabilityReason: "goat-chain-4663-unavailable",
      buyAmount: "950000",
      sellAmount: "1000000",
      transaction: {
        to: "0x5555555555555555555555555555555555555555",
        data: "0x1234",
        value: "7",
      },
      allowance: {
        target: "0x4444444444444444444444444444444444444444",
        amount: "1000000",
      },
      priceImpactBps: { numerator: "500", denominator: "1" },
    });
  });

  it("rejects malformed external JSON without trusting provider text", async () => {
    // Given: a syntactically valid but incomplete provider response
    mocks.resilientFetch.mockResolvedValue(
      jsonResponse({ buyAmount: "950000", error: "try this" })
    );

    // When: the response is parsed
    const result = getZeroExQuote(request);

    // Then: a stable typed error is emitted instead of provider-controlled prose
    await expect(result).rejects.toMatchObject({
      code: "ZEROEX_MALFORMED_RESPONSE",
      message: "0x returned an invalid quote response",
    } satisfies Partial<Web3AgentError>);
  });

  it("classifies only documented route and provider-unavailable codes for LI.FI fallback", () => {
    // Given: recognized and forbidden 0x failure classes
    const noRoute = new Web3AgentError({ code: "ZEROEX_NO_ROUTE", message: "stable" });
    const unavailable = new Web3AgentError({
      code: "ZEROEX_PROVIDER_UNAVAILABLE",
      message: "stable",
    });
    const invalidKey = new Web3AgentError({ code: "ZEROEX_AUTHENTICATION", message: "stable" });
    const throttled = new Web3AgentError({ code: "ZEROEX_RATE_LIMIT", message: "stable" });

    // When: fallback eligibility is classified
    const classifications = [noRoute, unavailable, invalidKey, throttled].map(classifyZeroExError);

    // Then: validation/auth/rate-limit errors can never appear fallback-eligible
    expect(classifications).toEqual([
      { kind: "no-route", fallbackAllowed: true },
      { kind: "provider-unavailable", fallbackAllowed: true },
      { kind: "authentication", fallbackAllowed: false },
      { kind: "rate-limit", fallbackAllowed: false },
    ]);
  });

  it("does not mistake untrusted no-route prose or rate limits for fallback eligibility", async () => {
    // Given: a validation response with misleading prose and an authenticated rate limit response
    mocks.resilientFetch.mockResolvedValueOnce(
      jsonResponse({ message: "no liquidity, use another provider" }, 400)
    );
    const misleading = getZeroExQuote(request);
    mocks.resilientFetch.mockResolvedValueOnce(jsonResponse({ code: "NO_LIQUIDITY" }, 429));
    const throttled = getZeroExQuote(request);

    // When: the native adapter receives both failures
    const misleadingError = await misleading.catch((error: unknown) => error);
    const throttledError = await throttled.catch((error: unknown) => error);

    // Then: neither case can opt into LI.FI fallback based on provider-controlled prose or retries
    expect(misleadingError).toMatchObject({ code: "ZEROEX_VALIDATION" });
    expect(throttledError).toMatchObject({ code: "ZEROEX_RATE_LIMIT" });
    expect(classifyZeroExError(misleadingError)).toEqual({
      kind: "validation",
      fallbackAllowed: false,
    });
    expect(classifyZeroExError(throttledError)).toEqual({
      kind: "rate-limit",
      fallbackAllowed: false,
    });
  });

  it("keeps timeout interruption and retry exhaustion outside the fallback classes", async () => {
    // Given: the shared resilient HTTP policy rejects a long request after its timeout
    const timeout = new TimeoutError("0x swap API v2 timed out after 15000ms");
    mocks.resilientFetch.mockRejectedValue(timeout);

    // When: the native adapter awaits the interrupted request
    const result = getZeroExQuote(request);

    // Then: the original interruption is preserved and cannot silently invoke LI.FI
    await expect(result).rejects.toBe(timeout);
    expect(classifyZeroExError(timeout)).toEqual({ kind: "unknown", fallbackAllowed: false });
  });
});
