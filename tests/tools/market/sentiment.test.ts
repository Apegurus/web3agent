import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockResilientFetch = vi.hoisted(() => vi.fn());
vi.mock("../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: mockResilientFetch,
}));

vi.mock("../../../src/tools/shared/cache.js", () => ({
  ttlCache: vi.fn((_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher()),
}));

import { getSentiment } from "../../../src/tools/market/sentiment.js";

beforeEach(() => {
  mockResilientFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mockApiResponse = {
  data: [
    { value: "73", value_classification: "Greed", timestamp: "1710547200" },
    { value: "65", value_classification: "Greed", timestamp: "1710460800" },
    { value: "45", value_classification: "Fear", timestamp: "1710374400" },
  ],
};

describe("getSentiment", () => {
  it("fetches and transforms Fear & Greed API response", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    );

    const result = await getSentiment({});

    expect(result.current).toEqual({
      date: new Date(1710547200 * 1000).toISOString(),
      value: 73,
      classification: "Greed",
    });
    expect(result.history).toHaveLength(3);
  });

  it("returns history entries with correct transformation", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    );

    const result = await getSentiment({});

    expect(result.history[0]).toEqual({
      date: new Date(1710547200 * 1000).toISOString(),
      value: 73,
      classification: "Greed",
    });
    expect(result.history[1]).toEqual({
      date: new Date(1710460800 * 1000).toISOString(),
      value: 65,
      classification: "Greed",
    });
    expect(result.history[2]).toEqual({
      date: new Date(1710374400 * 1000).toISOString(),
      value: 45,
      classification: "Fear",
    });
  });

  it("uses default days=7 when not specified", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    );

    await getSentiment({});

    expect(mockResilientFetch).toHaveBeenCalledWith(
      "https://api.alternative.me/fng/?limit=7",
      undefined,
      { label: "fear-greed" }
    );
  });

  it("uses provided days parameter", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    );

    await getSentiment({ days: 30 });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      "https://api.alternative.me/fng/?limit=30",
      undefined,
      { label: "fear-greed" }
    );
  });

  it("current is the first (most recent) entry", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockApiResponse), { status: 200 })
    );

    const result = await getSentiment({});

    expect(result.current).toEqual(result.history[0]);
  });

  it("converts value string to number", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ value: "55", value_classification: "Neutral", timestamp: "1710547200" }],
        }),
        { status: 200 }
      )
    );

    const result = await getSentiment({});

    expect(typeof result.current.value).toBe("number");
    expect(result.current.value).toBe(55);
  });

  it("converts timestamp unix string to ISO date", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ value: "55", value_classification: "Neutral", timestamp: "1710547200" }],
        }),
        { status: 200 }
      )
    );

    const result = await getSentiment({});

    expect(result.current.date).toBe(new Date(1710547200 * 1000).toISOString());
  });

  it("throws when API returns empty data array", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );

    await expect(getSentiment({})).rejects.toThrow("Fear & Greed Index returned no data");
  });
});
