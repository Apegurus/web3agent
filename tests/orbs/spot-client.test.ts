import { afterEach, describe, expect, it, vi } from "vitest";
import { querySpotOrders, submitSpotOrder } from "../../src/orbs/spot-client.js";
import { getSpotApiUrl } from "../../src/orbs/spot-config.js";

const SPOT_API = getSpotApiUrl();

function makeFetchResponse(opts: {
  ok: boolean;
  status: number;
  json?: unknown;
  text?: string;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    json: () => Promise.resolve(opts.json ?? null),
    text: () => Promise.resolve(opts.text ?? ""),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitSpotOrder", () => {
  it("POSTs order with signature to /orders/new", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(makeFetchResponse({ ok: true, status: 200, json: { id: "abc123" } }));
    vi.stubGlobal("fetch", mockFetch);

    const order = { reactor: "0xReactor", swapper: "0xSwapper" };
    const signature = { r: "0xr", s: "0xs", v: "27" };
    const url = `${SPOT_API}/orders/new`;

    const result = await submitSpotOrder({ url, order, signature });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(url);
    expect(calledInit.method).toBe("POST");
    expect(calledInit.headers).toMatchObject({ "Content-Type": "application/json" });

    const body = JSON.parse(calledInit.body as string) as Record<string, unknown>;
    expect(body.order).toEqual(order);
    expect(body.signature).toEqual(signature);
    expect(body.status).toBe("pending");

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.response).toEqual({ id: "abc123" });
  });

  it("returns error on non-2xx response", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(makeFetchResponse({ ok: false, status: 400, text: "Bad Request" }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await submitSpotOrder({
      url: `${SPOT_API}/orders/new`,
      order: {},
      signature: { r: "0x", s: "0x", v: "27" },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.response).toBe("Bad Request");
  });
});

describe("querySpotOrders", () => {
  it("GETs orders by swapper", async () => {
    const mockOrders = [{ id: "order1" }, { id: "order2" }];
    const mockFetch = vi
      .fn()
      .mockResolvedValue(makeFetchResponse({ ok: true, status: 200, json: mockOrders }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await querySpotOrders({ swapper: "0xSwapper" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [calledUrl] = mockFetch.mock.calls[0] as [string];
    expect(calledUrl).toContain("swapper=0xSwapper");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(result.orders).toEqual(mockOrders);
    }
  });

  it("GETs orders by hash", async () => {
    const mockOrders = [{ id: "order3" }];
    const mockFetch = vi
      .fn()
      .mockResolvedValue(makeFetchResponse({ ok: true, status: 200, json: mockOrders }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await querySpotOrders({ hash: "0xdeadbeef" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [calledUrl] = mockFetch.mock.calls[0] as [string];
    expect(calledUrl).toContain("hash=0xdeadbeef");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.orders).toEqual(mockOrders);
    }
  });

  it("returns error on non-2xx", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(makeFetchResponse({ ok: false, status: 404, text: "Not Found" }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await querySpotOrders({ swapper: "0xSwapper" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toBe("Not Found");
    }
  });
});
