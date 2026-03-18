import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache, ttlCache } from "../../../src/tools/shared/cache.js";

describe("ttlCache", () => {
  beforeEach(() => {
    clearCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearCache();
  });

  it("calls fetcher on cache miss", async () => {
    const fetcher = vi.fn().mockResolvedValue("result");
    const result = await ttlCache("key1", 5000, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toBe("result");
  });

  it("returns cached value on cache hit (fetcher called only once)", async () => {
    const fetcher = vi.fn().mockResolvedValue("cached-result");
    const first = await ttlCache("key2", 5000, fetcher);
    const second = await ttlCache("key2", 5000, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(first).toBe("cached-result");
    expect(second).toBe("cached-result");
  });

  it("refetches after TTL expires", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");

    const first = await ttlCache("key3", 5000, fetcher);
    expect(first).toBe("first");

    // Advance time beyond TTL
    vi.advanceTimersByTime(6000);

    const second = await ttlCache("key3", 5000, fetcher);
    expect(second).toBe("second");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache rejected fetcher — error propagates and next call retries", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce("retry-result");

    await expect(ttlCache("key4", 5000, fetcher)).rejects.toThrow("fetch failed");
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Next call should retry since nothing was cached
    const result = await ttlCache("key4", 5000, fetcher);
    expect(result).toBe("retry-result");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent requests for the same key", async () => {
    vi.useRealTimers();
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          callCount++;
          setTimeout(() => resolve(`result-${callCount}`), 50);
        })
    );

    const [a, b, c] = await Promise.all([
      ttlCache("dedup-key", 5000, fetcher),
      ttlCache("dedup-key", 5000, fetcher),
      ttlCache("dedup-key", 5000, fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toBe("result-1");
    expect(b).toBe("result-1");
    expect(c).toBe("result-1");
    vi.useFakeTimers();
  });

  it("evicts expired entries when cache exceeds max size", async () => {
    for (let i = 0; i < 510; i++) {
      await ttlCache(`evict-key-${i}`, 1000, async () => `value-${i}`);
    }
    vi.advanceTimersByTime(2000);
    await ttlCache("evict-trigger", 5000, async () => "trigger-value");
    const result = await ttlCache("evict-trigger", 5000, async () => "should-not-call");
    expect(result).toBe("trigger-value");
  });

  it("evicts oldest entries when none are expired", async () => {
    for (let i = 0; i < 510; i++) {
      await ttlCache(`long-key-${i}`, 999_999, async () => `value-${i}`);
    }
    const fetcher = vi.fn().mockResolvedValue("refetched");
    await ttlCache("long-key-0", 999_999, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
