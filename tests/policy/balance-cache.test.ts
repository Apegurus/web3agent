import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockResilientFetch = vi.hoisted(() => vi.fn());
vi.mock("../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: mockResilientFetch,
}));

const mockGetBalance = vi.hoisted(() => vi.fn());
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn().mockReturnValue({
      getBalance: mockGetBalance,
    }),
  };
});

vi.mock("../../src/config/wallet-factory.js", () => ({
  getTransportForChain: vi.fn().mockReturnValue("mock-transport"),
}));

import {
  BALANCE_CACHE_TTL_MS,
  getCachedBalanceUsd,
  refreshBalanceUsd,
  resetBalanceCache,
} from "../../src/policy/balance-cache.js";

beforeEach(() => {
  resetBalanceCache();
  mockResilientFetch.mockReset();
  mockGetBalance.mockReset();
  mockGetBalance.mockResolvedValue(BigInt("2000000000000000000")); // 2 ETH
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("balance-cache", () => {
  it("returns null before any refresh", () => {
    expect(getCachedBalanceUsd()).toBeNull();
  });

  it("refreshes and caches USD balance", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ethereum: { usd: 3500 } }), { status: 200 })
    );
    const result = await refreshBalanceUsd("0xaddr", 1);
    expect(result).toBeCloseTo(7000, 0); // 2 ETH * $3500
    expect(getCachedBalanceUsd("0xaddr", 1)).toBeCloseTo(7000, 0);
  });

  it("returns null when price fetch fails", async () => {
    mockResilientFetch.mockResolvedValueOnce(new Response("error", { status: 500 }));
    const result = await refreshBalanceUsd("0xaddr", 1);
    expect(result).toBeNull();
  });

  it("returns 0 for zero balance without fetching price", async () => {
    mockGetBalance.mockResolvedValue(BigInt(0));
    const result = await refreshBalanceUsd("0xaddr", 1);
    expect(result).toBe(0);
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });

  it("returns null for unsupported chain", async () => {
    const result = await refreshBalanceUsd("0xaddr", 999999);
    expect(result).toBeNull();
  });

  it("resets cache", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ethereum: { usd: 3500 } }), { status: 200 })
    );
    await refreshBalanceUsd("0xaddr", 1);
    expect(getCachedBalanceUsd("0xaddr", 1)).not.toBeNull();
    resetBalanceCache();
    expect(getCachedBalanceUsd("0xaddr", 1)).toBeNull();
  });

  it("does not reuse a cached balance for a different chain", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ethereum: { usd: 3500 } }), { status: 200 })
    );

    await refreshBalanceUsd("0xaddr", 1);

    expect(getCachedBalanceUsd("0xaddr", 8453)).toBeNull();
  });

  it("does not reuse a cached balance for a different wallet", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ethereum: { usd: 3500 } }), { status: 200 })
    );

    await refreshBalanceUsd("0xaddr", 1);

    expect(getCachedBalanceUsd("0xother", 1)).toBeNull();
  });

  it("expires stale cache entries", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ethereum: { usd: 3500 } }), { status: 200 })
    );

    await refreshBalanceUsd("0xaddr", 1);
    vi.advanceTimersByTime(BALANCE_CACHE_TTL_MS + 1);

    expect(getCachedBalanceUsd("0xaddr", 1)).toBeNull();
  });
});
