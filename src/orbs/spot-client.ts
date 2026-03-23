import { resilientFetch } from "../utils/resilient-fetch.js";
import { getSpotApiUrl } from "./spot-config.js";

export interface SpotSubmitParams {
  url: string;
  order: Record<string, unknown>;
  signature: { r: string; s: string; v: string };
}

export type SpotSubmitResult =
  | { ok: true; status: number; response: unknown }
  | { ok: false; status: number; response: unknown };

export interface SpotQueryParams {
  swapper?: string;
  hash?: string;
}

export type SpotQueryResult =
  | { ok: true; status: number; orders: unknown[] }
  | { ok: false; status: number; error: string };

/**
 * POST a signed Spot order to the given URL.
 * On 2xx: returns { ok: true, status, response: json }
 * On non-2xx: returns { ok: false, status, response: text }
 */
export async function submitSpotOrder(params: SpotSubmitParams): Promise<SpotSubmitResult> {
  const body = JSON.stringify({
    order: params.order,
    signature: params.signature,
    status: "pending",
  });

  const res = await resilientFetch(
    params.url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
    { label: "spot-submit", retry: { maxRetries: 1 } }
  );

  if (res.ok) {
    const response = (await res.json()) as unknown;
    return { ok: true, status: res.status, response };
  }

  const response = await res.text();
  return { ok: false, status: res.status, response };
}

/**
 * GET orders from the Spot API, filtered by swapper address or order hash.
 * On 2xx: returns { ok: true, status, orders: array }
 * On non-2xx: returns { ok: false, status, error: text }
 *
 * Callers are responsible for address validation. The MCP tool layer validates
 * via `addressSchema` before calling this function. SDK consumers are trusted callers.
 */
export async function querySpotOrders(params: SpotQueryParams): Promise<SpotQueryResult> {
  const searchParams = new URLSearchParams();
  if (params.swapper !== undefined) {
    searchParams.set("swapper", params.swapper);
  }
  if (params.hash !== undefined) {
    searchParams.set("hash", params.hash);
  }

  const url = `${getSpotApiUrl()}/orders?${searchParams.toString()}`;

  const res = await resilientFetch(url, undefined, {
    label: "spot-query",
    retry: { maxRetries: 2 },
  });

  if (res.ok) {
    const json = (await res.json()) as unknown;
    const orders = Array.isArray(json) ? json : [];
    return { ok: true, status: res.status, orders };
  }

  const error = await res.text();
  return { ok: false, status: res.status, error };
}
