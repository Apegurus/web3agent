import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetCircuitBreakers, resilientFetch } from "../../src/utils/resilient-fetch.js";

const FAST = { retry: { baseDelayMs: 1, maxDelayMs: 10 } };

function makeResponse(status: number): Response {
  return new Response(null, { status });
}

beforeEach(() => {
  resetCircuitBreakers();
  vi.stubGlobal("fetch", vi.fn());
});

describe("resilientFetch", () => {
  it("returns response on successful fetch", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(200));

    const res = await resilientFetch("https://example.com", undefined, FAST);

    expect(res.status).toBe(200);
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });

  it("retries on 429 and succeeds on second attempt", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(429))
      .mockResolvedValueOnce(makeResponse(200));

    const res = await resilientFetch("https://example.com", undefined, FAST);

    expect(res.status).toBe(200);
    expect(vi.mocked(fetch).mock.calls.length).toBe(2);
  });

  it("retries on 500", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(500))
      .mockResolvedValueOnce(makeResponse(200));

    const res = await resilientFetch("https://example.com", undefined, FAST);

    expect(res.status).toBe(200);
    expect(vi.mocked(fetch).mock.calls.length).toBe(2);
  });

  it("retries on 502", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(502))
      .mockResolvedValueOnce(makeResponse(200));

    const res = await resilientFetch("https://example.com", undefined, FAST);

    expect(res.status).toBe(200);
    expect(vi.mocked(fetch).mock.calls.length).toBe(2);
  });

  it("retries on 503", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(200));

    const res = await resilientFetch("https://example.com", undefined, FAST);

    expect(res.status).toBe(200);
    expect(vi.mocked(fetch).mock.calls.length).toBe(2);
  });

  it("retries on 504", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(504))
      .mockResolvedValueOnce(makeResponse(200));

    const res = await resilientFetch("https://example.com", undefined, FAST);

    expect(res.status).toBe(200);
    expect(vi.mocked(fetch).mock.calls.length).toBe(2);
  });

  it("does NOT retry on 400", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(400));

    const res = await resilientFetch("https://example.com", undefined, FAST);

    expect(res.status).toBe(400);
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });

  it("does NOT retry on 401", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(401));

    const res = await resilientFetch("https://example.com", undefined, FAST);

    expect(res.status).toBe(401);
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });

  it("does NOT retry on 403", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(403));

    const res = await resilientFetch("https://example.com", undefined, FAST);

    expect(res.status).toBe(403);
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });

  it("does NOT retry on 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(404));

    const res = await resilientFetch("https://example.com", undefined, FAST);

    expect(res.status).toBe(404);
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });

  it("respects maxRetries — stops after limit", async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(500));

    const config = { retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10 } };
    const res = await resilientFetch("https://example.com", undefined, config);

    // maxRetries=2 means 3 total attempts (0, 1, 2), last one returns 500 as-is
    expect(res.status).toBe(500);
    expect(vi.mocked(fetch).mock.calls.length).toBe(3);
  });

  it("retries on network TypeError", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(makeResponse(200));

    const res = await resilientFetch("https://example.com", undefined, FAST);

    expect(res.status).toBe(200);
    expect(vi.mocked(fetch).mock.calls.length).toBe(2);
  });

  it("throws after exhausting retries on network error", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed"));

    const config = { retry: { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 10 } };

    await expect(resilientFetch("https://example.com", undefined, config)).rejects.toThrow(
      TypeError
    );

    expect(vi.mocked(fetch).mock.calls.length).toBe(2);
  });

  it("returns response on successful retry after network error", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(makeResponse(201));

    const config = { retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 } };
    const res = await resilientFetch("https://example.com", undefined, config);

    expect(res.status).toBe(201);
    expect(vi.mocked(fetch).mock.calls.length).toBe(3);
  });

  describe("circuit breaker", () => {
    it("opens after reaching failure threshold", async () => {
      // Non-retryable error increments consecutiveFailures each time
      vi.mocked(fetch).mockRejectedValue(new Error("non-retryable"));

      const config = {
        label: "cb-test",
        retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10 },
        circuitBreaker: { failureThreshold: 3, cooldownMs: 60_000 },
      };

      // 3 calls to hit the threshold
      for (let i = 0; i < 3; i++) {
        await expect(resilientFetch("https://example.com", undefined, config)).rejects.toThrow();
      }

      // 4th call should be rejected immediately by open circuit
      await expect(resilientFetch("https://example.com", undefined, config)).rejects.toThrow(
        /Circuit open/
      );

      // fetch was only called 3 times (not 4)
      expect(vi.mocked(fetch).mock.calls.length).toBe(3);
    });

    it("rejects immediately when circuit is open", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("fail"));

      const config = {
        label: "cb-open-test",
        retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10 },
        circuitBreaker: { failureThreshold: 1, cooldownMs: 60_000 },
      };

      // First call opens the circuit
      await expect(resilientFetch("https://example.com", undefined, config)).rejects.toThrow();

      const callsAfterOpen = vi.mocked(fetch).mock.calls.length;

      // Subsequent call should throw without calling fetch
      await expect(resilientFetch("https://example.com", undefined, config)).rejects.toThrow(
        /Circuit open/
      );

      expect(vi.mocked(fetch).mock.calls.length).toBe(callsAfterOpen);
    });

    it("opens after persistent HTTP 5xx failures exhaust retries", async () => {
      // All responses are 500, retries exhausted each call
      vi.mocked(fetch).mockResolvedValue(makeResponse(500));

      const config = {
        label: "cb-http-5xx",
        retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10 },
        circuitBreaker: { failureThreshold: 3, cooldownMs: 60_000 },
      };

      // Each call returns 500 and increments the failure counter
      for (let i = 0; i < 3; i++) {
        const res = await resilientFetch("https://example.com", undefined, config);
        expect(res.status).toBe(500);
      }

      // 4th call should be rejected by open circuit
      await expect(resilientFetch("https://example.com", undefined, config)).rejects.toThrow(
        /Circuit open/
      );

      // fetch was only called 3 times (circuit blocked the 4th)
      expect(vi.mocked(fetch).mock.calls.length).toBe(3);
    });

    it("resets failure count on successful response", async () => {
      const config = {
        label: "cb-reset",
        retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10 },
        circuitBreaker: { failureThreshold: 3, cooldownMs: 60_000 },
      };

      // 2 failures, then a success, then 2 more failures — should NOT open
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"))
        .mockResolvedValueOnce(makeResponse(200))
        .mockRejectedValueOnce(new Error("fail3"))
        .mockRejectedValueOnce(new Error("fail4"));

      await expect(resilientFetch("https://example.com", undefined, config)).rejects.toThrow();
      await expect(resilientFetch("https://example.com", undefined, config)).rejects.toThrow();
      const res = await resilientFetch("https://example.com", undefined, config);
      expect(res.status).toBe(200);
      await expect(resilientFetch("https://example.com", undefined, config)).rejects.toThrow();
      await expect(resilientFetch("https://example.com", undefined, config)).rejects.toThrow();

      // Should NOT have opened — 2 consecutive failures, reset, 2 more (never hit 3)
      expect(vi.mocked(fetch).mock.calls.length).toBe(5);
    });
  });
});
