import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache, ttlCache } from "../../../src/tools/market/cache.js";

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
});
