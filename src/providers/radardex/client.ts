import type { Address } from "viem";
import { ttlCache } from "../../tools/shared/cache.js";
import { RADARDEX_ARC } from "./manifest.js";
import {
  type RadarPoolCandidate,
  type RadarToken,
  tokenListResponseSchema,
  v4PoolsResponseSchema,
} from "./schemas.js";

export class RadarDexApiError extends Error {
  readonly name = "RadarDexApiError";

  constructor(
    readonly operation: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(`RadarDEX ${operation}: ${message}`, options);
  }
}

export function parseTokenList(payload: unknown): readonly RadarToken[] {
  const parsed = tokenListResponseSchema.parse(payload);
  const unique = new Map<string, RadarToken>();
  for (const token of parsed.tokens) {
    const key = token.address.toLowerCase();
    if (!unique.has(key)) unique.set(key, token);
  }
  return [...unique.values()];
}

type MetadataClientOptions = {
  readonly fetcher?: typeof fetch;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly ttlMs?: number;
  readonly cacheNamespace?: string;
};

export class RadarMetadataClient {
  readonly #fetcher: typeof fetch;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #ttlMs: number;
  readonly #cacheNamespace: string;

  constructor(options: MetadataClientOptions = {}) {
    this.#fetcher = options.fetcher ?? fetch;
    this.#baseUrl = options.baseUrl ?? RADARDEX_ARC.apiBaseUrl;
    this.#timeoutMs = options.timeoutMs ?? 8_000;
    this.#ttlMs = options.ttlMs ?? 30_000;
    this.#cacheNamespace = options.cacheNamespace ?? "default";
  }

  async listTokens(): Promise<readonly RadarToken[]> {
    return ttlCache(`radardex:${this.#cacheNamespace}:tokens`, this.#ttlMs, async () => {
      const payload = await this.#getJson("tokens", "/tokens");
      return parseTokenList(payload);
    });
  }

  async listV4Pools(tokenA: Address, tokenB: Address): Promise<readonly RadarPoolCandidate[]> {
    const query = new URLSearchParams({ tokenA, tokenB });
    return ttlCache(
      `radardex:${this.#cacheNamespace}:v4:${tokenA.toLowerCase()}:${tokenB.toLowerCase()}`,
      this.#ttlMs,
      async () => {
        const payload = await this.#getJson("V4 pools", `/v4/pools?${query}`);
        const parsed = v4PoolsResponseSchema.parse(payload);
        return parsed.pools.map((pool) => {
          if (!pool.nativeQuote) return { ...pool, tokenA, tokenB };
          const token = tokenA.toLowerCase() === RADARDEX_ARC.usdc.toLowerCase() ? tokenB : tokenA;
          return { ...pool, tokenA: RADARDEX_ARC.zeroAddress, tokenB: token };
        });
      }
    );
  }

  async #getJson(operation: string, path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetcher(`${this.#baseUrl}${path}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error: unknown) {
      throw new RadarDexApiError(operation, "request failed", { cause: error });
    }
    if (!response.ok) {
      throw new RadarDexApiError(operation, `HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch (error: unknown) {
      throw new RadarDexApiError(operation, "invalid JSON", { cause: error });
    }
  }
}
