# Market Data & Research Tools Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 33 read-only MCP tools (20 market + 13 research) with corresponding SDK functions for market intelligence and on-chain research.

**Architecture:** Two new tool groups (`market`, `research`) following the existing flat-file pattern. All tools use `createToolHandler` + `resilientFetch`. SDK functions use `getRuntime()` + `invokeAndRequireData()`. Schemas defined in `src/api/schemas/`, re-exported from `src/tools/*/schemas.ts`.

**Tech Stack:** Zod, zod-to-json-schema, resilientFetch, createToolHandler, vitest

**Spec:** `docs/superpowers/specs/2026-03-16-market-research-tools-design.md`

---

## Chunk 1: Foundation (types, cache, schemas, registration scaffolding)

### Task 1: Extend ToolSource and ToolCategory types

**Files:**
- Modify: `src/runtime/types.ts`

- [ ] **Step 1: Add "market" and "research" to ToolSource and ToolCategory unions**

In `src/runtime/types.ts`, add `| "market"` and `| "research"` to both unions:

```typescript
// ToolSource — add after "erc8004":
| "market"
| "research"

// ToolCategory — add after "agenticEconomy":
| "market"
| "research"
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS (no consumers of these types will break from adding new members)

- [ ] **Step 3: Commit**

```bash
git add src/runtime/types.ts
git commit -m "feat: add market and research to ToolSource and ToolCategory"
```

---

### Task 2: Create TTL cache helper

**Files:**
- Create: `src/tools/market/cache.ts`
- Create: `tests/tools/market/cache.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/market/cache.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ttlCache, clearCache } from "../../../src/tools/market/cache.js";

describe("ttlCache", () => {
  beforeEach(() => {
    clearCache();
  });

  it("calls fetcher on cache miss", async () => {
    const fetcher = vi.fn().mockResolvedValue({ price: 100 });
    const result = await ttlCache("key1", 60_000, fetcher);
    expect(result).toEqual({ price: 100 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns cached value on cache hit", async () => {
    const fetcher = vi.fn().mockResolvedValue({ price: 100 });
    await ttlCache("key1", 60_000, fetcher);
    const result = await ttlCache("key1", 60_000, fetcher);
    expect(result).toEqual({ price: 100 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches after TTL expires", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ price: 100 })
      .mockResolvedValueOnce({ price: 200 });
    await ttlCache("key1", 1000, fetcher);
    vi.advanceTimersByTime(1001);
    const result = await ttlCache("key1", 1000, fetcher);
    expect(result).toEqual({ price: 200 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not cache rejected fetcher", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ price: 100 });
    await expect(ttlCache("key1", 60_000, fetcher)).rejects.toThrow("fail");
    const result = await ttlCache("key1", 60_000, fetcher);
    expect(result).toEqual({ price: 100 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/tools/market/cache.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/tools/market/cache.ts
interface CacheEntry {
  data: unknown;
  expiry: number;
}

const cache = new Map<string, CacheEntry>();

export async function ttlCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.data as T;
  }
  const data = await fetcher();
  cache.set(key, { data, expiry: Date.now() + ttlMs });
  return data;
}

export function clearCache(): void {
  cache.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/tools/market/cache.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/market/cache.ts tests/tools/market/cache.test.ts
git commit -m "feat: add TTL cache helper for market and research tools"
```

---

### Task 3: Create coingeckoIdSchema in common.ts

**Files:**
- Modify: `src/api/schemas/common.ts`

- [ ] **Step 1: Read the current common.ts to find the right insertion point**

Read `src/api/schemas/common.ts` to see existing schemas.

- [ ] **Step 2: Add coingeckoIdSchema**

Add at the end of the file:

```typescript
export const coingeckoIdSchema = z
  .string()
  .describe(
    "CoinGecko coin ID (e.g., 'bitcoin', 'ethereum', 'uniswap'). Use market_search_token to find IDs."
  );
```

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm run typecheck && pnpm test -- --run tests/tools/schema-quality.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/api/schemas/common.ts
git commit -m "feat: add coingeckoIdSchema to shared schemas"
```

---

### Task 4: Create market input schemas

**Files:**
- Create: `src/api/schemas/market.ts`
- Create: `src/tools/market/schemas.ts`
- Modify: `src/api/schemas.ts` (add barrel re-export)

- [ ] **Step 1: Create the canonical schema file**

```typescript
// src/api/schemas/market.ts
import { z } from "zod";
import { chainIdOptionalSchema } from "./common.js";

// ── Shared building blocks ──────────────────────────────────────

export const limitSchema = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Maximum number of results to return");

export const protocolSlugSchema = z
  .string()
  .describe("Protocol slug as used by DefiLlama (e.g., 'aave', 'uniswap')");

export const tradingPairSchema = z
  .string()
  .describe("Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT')");

// ── DefiLlama tools ─────────────────────────────────────────────

export const marketGetProtocolTvlSchema = z.object({
  protocol: protocolSlugSchema,
});

export const marketGetTopProtocolsSchema = z.object({
  chain: z.string().optional().describe("Filter by chain name (e.g., 'Ethereum', 'Arbitrum')"),
  category: z.string().optional().describe("Filter by protocol category (e.g., 'Dexes', 'Lending')"),
  limit: limitSchema,
});

export const marketGetChainTvlSchema = z.object({
  chain: z.string().describe("Chain name (e.g., 'Ethereum', 'Arbitrum')"),
});

export const marketGetTokenPriceSchema = z.object({
  tokens: z
    .array(z.string().describe("Token identifier in 'chain:address' or CoinGecko ID format"))
    .min(1)
    .describe("Array of token identifiers to price"),
  searchWidth: z.string().optional().describe("Time range to search for prices (e.g., '4h')"),
});

export const marketGetTokenHistorySchema = z.object({
  token: z.string().describe("Token identifier — CoinGecko ID (e.g., 'bitcoin') or chain:address (e.g., 'ethereum:0x...')"),
  period: z
    .enum(["1d", "7d", "30d", "90d", "1y"])
    .optional()
    .describe("Time period for price history (default: 30d)"),
});

export const marketGetGainersLosersSchema = z.object({
  period: z
    .enum(["1h", "24h", "7d"])
    .optional()
    .describe("Time period for price change calculation (default: 24h)"),
  limit: limitSchema,
});

export const marketGetDexVolumeSchema = z.object({
  chain: z.string().optional().describe("Filter by chain name"),
  protocol: z.string().optional().describe("Filter by protocol name"),
});

export const marketGetStablecoinStatsSchema = z.object({
  chain: z.string().optional().describe("Filter by chain name"),
});

export const marketGetGlobalStatsSchema = z.object({});

export const marketGetCexFundFlowsSchema = z.object({
  limit: limitSchema,
});

export const marketGetExchangeRankingsSchema = z.object({
  limit: limitSchema,
});

// ── Sentiment ───────────────────────────────────────────────────

export const marketGetSentimentSchema = z.object({
  days: z
    .number()
    .int()
    .positive()
    .max(30)
    .optional()
    .describe("Number of days of history to include (default: 7, max: 30)"),
});

// ── CoinGecko ───────────────────────────────────────────────────

export const marketGetTrendingSchema = z.object({
  limit: limitSchema,
});

export const marketGetTopTokensSchema = z.object({
  category: z.string().optional().describe("CoinGecko category slug (e.g., 'decentralized-finance-defi', 'layer-2')"),
  limit: z.number().int().positive().max(250).optional().describe("Number of tokens to return (default: 20, max: 250)"),
  order: z
    .enum(["marketCap", "volume"])
    .optional()
    .describe("Sort order (default: marketCap)"),
});

export const marketSearchTokenSchema = z.object({
  query: z.string().describe("Search query — token name, symbol, or keyword"),
});

export const marketGetCategoriesSchema = z.object({
  order: z
    .enum(["marketCap", "name", "marketCapChange24h"])
    .optional()
    .describe("Sort order for categories (default: marketCap)"),
  limit: limitSchema,
});

// ── Binance ─────────────────────────────────────────────────────

export const marketGetTickerSchema = z.object({
  symbol: tradingPairSchema,
});

export const marketGetKlinesSchema = z.object({
  symbol: tradingPairSchema,
  interval: z
    .enum(["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"])
    .describe("Candlestick interval"),
  limit: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe("Number of candles to return (default: 100, max: 1000)"),
});

export const marketGetOrderBookSchema = z.object({
  symbol: tradingPairSchema,
  limit: z
    .enum(["5", "10", "20", "50", "100"])
    .optional()
    .describe("Order book depth (default: '20')"),
});

export const marketGetFundingRatesSchema = z.object({
  symbol: tradingPairSchema,
  limit: z.number().int().positive().max(1000).optional().describe("Number of funding rate entries (default: 10)"),
});
```

- [ ] **Step 2: Create the re-export file**

```typescript
// src/tools/market/schemas.ts
export {
  limitSchema,
  marketGetCategoriesSchema,
  marketGetCexFundFlowsSchema,
  marketGetChainTvlSchema,
  marketGetDexVolumeSchema,
  marketGetExchangeRankingsSchema,
  marketGetFundingRatesSchema,
  marketGetGainersLosersSchema,
  marketGetGlobalStatsSchema,
  marketGetKlinesSchema,
  marketGetOrderBookSchema,
  marketGetProtocolTvlSchema,
  marketGetSentimentSchema,
  marketGetTickerSchema,
  marketGetTokenHistorySchema,
  marketGetTokenPriceSchema,
  marketGetTopProtocolsSchema,
  marketGetTopTokensSchema,
  marketGetTrendingSchema,
  marketSearchTokenSchema,
  protocolSlugSchema,
  tradingPairSchema,
} from "../../api/schemas.js";
```

- [ ] **Step 3: Add barrel re-export in `src/api/schemas.ts`**

Add to `src/api/schemas.ts`:

```typescript
export * from "./schemas/market.js";
```

- [ ] **Step 4: Run typecheck and schema quality test**

Run: `pnpm run typecheck && pnpm test -- --run tests/tools/schema-quality.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/schemas/market.ts src/tools/market/schemas.ts src/api/schemas.ts
git commit -m "feat: add market tool input schemas"
```

---

### Task 5: Create research input schemas

**Files:**
- Create: `src/api/schemas/research.ts`
- Create: `src/tools/research/schemas.ts`
- Modify: `src/api/schemas.ts` (add barrel re-export)

- [ ] **Step 1: Create the canonical schema file**

```typescript
// src/api/schemas/research.ts
import { z } from "zod";
import { chainIdOptionalSchema } from "./common.js";
import { limitSchema, protocolSlugSchema } from "./market.js";

// ── Security & Due Diligence ────────────────────────────────────

export const researchContractSecuritySchema = z.object({
  address: z.string().describe("Contract address to check"),
  chainId: chainIdOptionalSchema,
});

export const researchTokenDueDiligenceSchema = z.object({
  token: z.string().describe("Token address or symbol to investigate"),
  chainId: chainIdOptionalSchema,
});

export const researchTokenHoldersSchema = z.object({
  token: z.string().describe("Token contract address"),
  chainId: chainIdOptionalSchema,
  limit: limitSchema,
});

// ── Yields ──────────────────────────────────────────────────────

export const researchYieldOpportunitiesSchema = z.object({
  token: z.string().optional().describe("Filter by token symbol"),
  chain: z.string().optional().describe("Filter by chain name"),
  protocol: z.string().optional().describe("Filter by protocol name"),
  minTvl: z.number().optional().describe("Minimum TVL in USD (default: 100000)"),
  limit: limitSchema,
});

export const researchCompareYieldsSchema = z.object({
  token: z.string().describe("Token symbol to compare yields for"),
  chainId: chainIdOptionalSchema,
  limit: limitSchema,
});

export const researchProtocolInfoSchema = z.object({
  protocol: protocolSlugSchema,
});

// ── DefiLlama Feed Tools ────────────────────────────────────────

export const researchTokenUnlocksSchema = z.object({
  limit: limitSchema,
});

export const researchHackHistorySchema = z.object({
  protocol: z.string().optional().describe("Filter by protocol name"),
  limit: limitSchema,
});

export const researchFundRaisesSchema = z.object({
  limit: limitSchema,
});

export const researchWhaleTransfersSchema = z.object({
  symbol: z.string().optional().describe("Filter by token symbol"),
  limit: limitSchema,
});

export const researchGovernanceSchema = z.object({
  protocol: z.string().optional().describe("Filter by protocol/org name"),
  status: z.enum(["active", "closed"]).optional().describe("Filter by proposal status"),
  limit: limitSchema,
});

export const researchNewsSchema = z.object({
  limit: limitSchema,
});

export const researchAirdropsSchema = z.object({
  limit: limitSchema,
});
```

- [ ] **Step 2: Create re-export file and update barrel**

```typescript
// src/tools/research/schemas.ts
export {
  researchAirdropsSchema,
  researchCompareYieldsSchema,
  researchContractSecuritySchema,
  researchFundRaisesSchema,
  researchGovernanceSchema,
  researchHackHistorySchema,
  researchNewsSchema,
  researchProtocolInfoSchema,
  researchTokenDueDiligenceSchema,
  researchTokenHoldersSchema,
  researchTokenUnlocksSchema,
  researchWhaleTransfersSchema,
  researchYieldOpportunitiesSchema,
} from "../../api/schemas.js";
```

Add to `src/api/schemas.ts`:

```typescript
export * from "./schemas/research.js";
```

- [ ] **Step 3: Run typecheck and schema quality test**

Run: `pnpm run typecheck && pnpm test -- --run tests/tools/schema-quality.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/api/schemas/research.ts src/tools/research/schemas.ts src/api/schemas.ts
git commit -m "feat: add research tool input schemas"
```

---

**Output schema convention for all handler tasks (6-9, 11-13):** Each handler's return shape must have a corresponding Zod output schema defined in `src/api/schemas/outputs.ts` with `.describe()` on every field. SDK output types in `src/api/types.ts` must be derived via `z.infer<typeof schema>` from these output schemas — never maintain separate interfaces. Define the output schema alongside the handler implementation, not as a separate task.

---

## Chunk 2: Market Tool Handlers — DefiLlama

### Task 6: Implement DefiLlama market handlers

**Files:**
- Create: `src/tools/market/defillama.ts`
- Create: `tests/tools/market/defillama.test.ts`

- [ ] **Step 1: Write tests for all 10 DefiLlama market handlers**

Create `tests/tools/market/defillama.test.ts`. For each handler, test:
1. Success path with mocked `resilientFetch` returning mock API data
2. Error path when fetch fails
3. Response transformation (snake_case → camelCase, computed fields like `netFlow`)

Mock `resilientFetch` at module level:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: vi.fn(),
}));
import { resilientFetch } from "../../../src/utils/resilient-fetch.js";
```

Test each handler function by importing from `../../../src/tools/market/defillama.js`. Each handler is a function that takes validated input and returns data (not `CallToolResult` — `createToolHandler` wraps that).

Example test for `getProtocolTvl`:

```typescript
describe("getProtocolTvl", () => {
  it("returns transformed protocol data", async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue({
        name: "Aave",
        tvl: 10_000_000,
        change_1d: 1.5,
        change_7d: -2.1,
        change_1m: 5.3,
        chainTvls: { Ethereum: 7_000_000, Polygon: 3_000_000 },
        category: "Lending",
        url: "https://aave.com",
      }),
    };
    vi.mocked(resilientFetch).mockResolvedValue(mockResponse as unknown as Response);

    const result = await getProtocolTvl({ protocol: "aave" });
    expect(result).toEqual({
      name: "Aave",
      tvl: 10_000_000,
      tvlChange1d: 1.5,
      tvlChange7d: -2.1,
      tvlChange30d: 5.3,
      chainTvls: { Ethereum: 7_000_000, Polygon: 3_000_000 },
      category: "Lending",
      url: "https://aave.com",
    });
    expect(resilientFetch).toHaveBeenCalledWith(
      "https://api.llama.fi/protocol/aave",
      expect.any(Object),
      expect.objectContaining({ label: "defillama" })
    );
  });
});
```

Write similar tests for: `getTopProtocols`, `getChainTvl`, `getTokenPrice`, `getGainersLosers`, `getDexVolume`, `getStablecoinStats`, `getGlobalStats`, `getCexFundFlows`, `getExchangeRankings`. Each with success + error paths.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/tools/market/defillama.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement all DefiLlama market handler functions**

Create `src/tools/market/defillama.ts`. Each function is a plain async function (not a tool handler — `index.ts` wraps them with `createToolHandler`). Pattern:

```typescript
import { resilientFetch } from "../../utils/resilient-fetch.js";
import { ttlCache } from "./cache.js";

const DEFILLAMA_TTL = 60_000; // 60s for price data
const DEFILLAMA_META_TTL = 300_000; // 5min for metadata

export async function getProtocolTvl(input: { protocol: string }) {
  const url = `https://api.llama.fi/protocol/${encodeURIComponent(input.protocol)}`;
  const data = await ttlCache(url, DEFILLAMA_META_TTL, async () => {
    const res = await resilientFetch(url, undefined, { label: "defillama" });
    return (await res.json()) as Record<string, unknown>;
  });
  return {
    name: data.name,
    tvl: data.tvl,
    tvlChange1d: data.change_1d ?? null,
    tvlChange7d: data.change_7d ?? null,
    tvlChange30d: data.change_1m ?? null,
    chainTvls: data.chainTvls ?? {},
    category: data.category ?? null,
    url: data.url ?? null,
  };
}
```

Implement all 11 functions following the same pattern. Key implementation notes:
- `getTopProtocols`: fetch `/protocols`, filter by chain/category, sort by tvl desc, slice to limit
- `getTokenPrice`: join tokens with commas in URL path
- `getGainersLosers`: fetch `/percentage/{period}`, sort by value, take top/bottom N
- `getCexFundFlows`: compute `netFlow = depositSumUsd - withdrawSumUsd`
- `getGlobalStats`: transform `data.total_market_cap.usd` etc. from nested CoinGecko format

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/tools/market/defillama.test.ts`
Expected: PASS

- [ ] **Step 5: Run lint and typecheck**

Run: `pnpm run lint:fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/market/defillama.ts tests/tools/market/defillama.test.ts
git commit -m "feat: add DefiLlama market data handlers"
```

---

### Task 7: Implement sentiment handler

**Files:**
- Create: `src/tools/market/sentiment.ts`
- Create: `tests/tools/market/sentiment.test.ts`

- [ ] **Step 1: Write test**

Mock `resilientFetch`. Test that the handler calls Fear & Greed API and transforms the response correctly.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/tools/market/sentiment.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/tools/market/sentiment.ts
import { resilientFetch } from "../../utils/resilient-fetch.js";
import { ttlCache } from "./cache.js";

const SENTIMENT_TTL = 300_000; // 5min

export async function getSentiment(input: { days?: number }) {
  const days = input.days ?? 7;
  const url = `https://api.alternative.me/fng/?limit=${days}`;
  const data = await ttlCache(url, SENTIMENT_TTL, async () => {
    const res = await resilientFetch(url, undefined, { label: "fear-greed" });
    return (await res.json()) as { data: Array<{ value: string; value_classification: string; timestamp: string }> };
  });
  const entries = data.data.map((d) => ({
    date: new Date(Number(d.timestamp) * 1000).toISOString(),
    value: Number(d.value),
    classification: d.value_classification,
  }));
  return {
    current: entries[0],
    history: entries,
  };
}
```

- [ ] **Step 4: Run test, lint, typecheck**

Run: `pnpm test -- --run tests/tools/market/sentiment.test.ts && pnpm run lint:fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/market/sentiment.ts tests/tools/market/sentiment.test.ts
git commit -m "feat: add Fear & Greed sentiment handler"
```

---

### Task 8: Implement CoinGecko market handlers

**Files:**
- Create: `src/tools/market/coingecko.ts`
- Create: `tests/tools/market/coingecko.test.ts`

- [ ] **Step 1: Write tests for all 5 CoinGecko handlers**

Test `getTrending`, `getTopTokens`, `searchToken`, `getCategories`, and `getTokenHistory`. Mock `resilientFetch`. Test:
- Success paths with mock data
- `coingeckoUrl()` builds correct URL based on `COINGECKO_API_KEY` env var
- `coingeckoHeaders()` returns API key header when set
- Trending enrichment: test that a second `/coins/markets` call is made
- Trending enrichment failure: test that base data is returned with warning
- Token history routing: test `:` detection routes to DefiLlama, otherwise CoinGecko
- Token history CoinGecko fallback: test non-2xx triggers DefiLlama fallback
- Order mapping: `"marketCap"` → `"market_cap_desc"` for `getTopTokens` and `getCategories`

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/tools/market/coingecko.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `src/tools/market/coingecko.ts` with:

```typescript
import { resilientFetch } from "../../utils/resilient-fetch.js";
import { ttlCache } from "./cache.js";

const CG_TTL = 120_000; // 120s

function coingeckoUrl(path: string): string {
  const base = process.env.COINGECKO_API_KEY
    ? "https://pro-api.coingecko.com/api/v3"
    : "https://api.coingecko.com/api/v3";
  return `${base}${path}`;
}

function coingeckoHeaders(): Record<string, string> {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { "x-cg-pro-api-key": key } : {};
}

const CG_FETCH_CONFIG = {
  label: "coingecko",
  retry: { baseDelayMs: 5000 },
};
```

Implement all 5 functions. Key details:
- `getTrending`: fetch `/search/trending`, extract coin items, then batch-enrich via `/coins/markets?ids={ids}`. If enrichment fails, return base data with `warnings: ["Market data enrichment unavailable"]`.
- `getTopTokens`: map `order` ("marketCap" → "market_cap_desc", "volume" → "volume_desc")
- `searchToken`: straight pass-through, return `coins` array from response
- `getCategories`: map `order` ("marketCap" → "market_cap_desc", "name" → "name_asc", "marketCapChange24h" → "market_cap_change_24h_desc")
- `getTokenHistory`: check `token.includes(":")` for routing. CoinGecko: map period to days (1d→1, 7d→7, etc.). DefiLlama fallback: compute start timestamp, set span/resolution.

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `pnpm test -- --run tests/tools/market/coingecko.test.ts && pnpm run lint:fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/market/coingecko.ts tests/tools/market/coingecko.test.ts
git commit -m "feat: add CoinGecko market data handlers"
```

---

### Task 9: Implement Binance market handlers

**Files:**
- Create: `src/tools/market/binance.ts`
- Create: `tests/tools/market/binance.test.ts`

- [ ] **Step 1: Write tests for all 4 Binance handlers**

Test `getTicker`, `getKlines`, `getOrderBook`, `getFundingRates`. Mock `resilientFetch`. Test:
- Success paths with mock data matching real Binance response shapes
- Klines array-to-object transformation
- Order book bid/ask array-to-object transformation
- Geo-restriction: test 451/403 response returns clear error message

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/tools/market/binance.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `src/tools/market/binance.ts`. No TTL cache (real-time data). Pattern:

```typescript
import { resilientFetch } from "../../utils/resilient-fetch.js";

const BINANCE_SPOT = "https://api.binance.com/api/v3";
const BINANCE_FUTURES = "https://fapi.binance.com/fapi/v1";

function checkGeoRestriction(res: Response): void {
  if (res.status === 451 || res.status === 403) {
    throw new Error(
      "Binance API is not available in your region. Consider using a VPN or the DefiLlama-based market tools as alternatives."
    );
  }
}
```

For `getKlines`, transform the array response: each sub-array `[openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, _]` → `{ openTime, open, high, low, close, volume, quoteVolume, trades }`.

For `getOrderBook`, transform `bids`/`asks` from `[price, quantity][]` to `{ price, quantity }[]`.

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `pnpm test -- --run tests/tools/market/binance.test.ts && pnpm run lint:fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/market/binance.ts tests/tools/market/binance.test.ts
git commit -m "feat: add Binance public API market handlers"
```

---

### Task 10: Create market tool index and register in runtime

**Files:**
- Create: `src/tools/market/index.ts`
- Modify: `src/runtime/server.ts`
- Modify: `src/runtime/managed-runtime.ts`

- [ ] **Step 1: Create market tool index**

Create `src/tools/market/index.ts` that exports `getMarketToolDefinitions()`. This file:
- Imports all handler functions from `defillama.ts`, `sentiment.ts`, `coingecko.ts`, `binance.ts`
- Imports all schemas from `./schemas.js`
- Wraps each handler with `createToolHandler`
- Returns `ToolDefinition[]` with name, category, description, inputSchema (via `zodToJsonSchema`), handler, and annotations

Follow the exact pattern from `src/tools/tokens/index.ts` but use `createToolHandler` instead of manual validation.

Example for one tool:

```typescript
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolDefinition } from "../register.js";
import { createToolHandler } from "../shared/handler-factory.js";
import { getProtocolTvl } from "./defillama.js";
import { marketGetProtocolTvlSchema } from "./schemas.js";

export function getMarketToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "market_get_protocol_tvl",
      category: "market",
      description: "Get the Total Value Locked (TVL) for a DeFi protocol, including TVL changes over 1d/7d/30d and breakdown by chain.",
      inputSchema: zodToJsonSchema(marketGetProtocolTvlSchema) as Record<string, unknown>,
      handler: createToolHandler(marketGetProtocolTvlSchema, getProtocolTvl, "MARKET_PROTOCOL_TVL_ERROR"),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    // ... 19 more tool definitions
  ];
}
```

Each tool needs a clear, multi-sentence description explaining what it does and what data it returns.

- [ ] **Step 2: Register in server.ts**

Add import at the top of `src/runtime/server.ts`:

```typescript
import { getMarketToolDefinitions } from "../tools/market/index.js";
```

In `createRuntimeBridge()`, add after the existing tool instantiation:

```typescript
const marketTools = getMarketToolDefinitions();
```

In `rebuildDispatchMap()`, add a loop:

```typescript
for (const tool of marketTools) {
  toolDispatch.set(tool.name, (args) => tool.handler(args));
}
```

In `getMcpTools()`, add:

```typescript
...marketTools.map(toMcpTool),
```

- [ ] **Step 3: Register in managed-runtime.ts**

Add import:

```typescript
import { getMarketToolDefinitions } from "../tools/market/index.js";
```

Add class property (find the section where `tokenTools`, `lifiTools`, etc. are declared):

```typescript
private readonly marketTools = getMarketToolDefinitions();
```

Add to `toolGroups` array in `rebuildToolRegistry()`:

```typescript
["market", this.marketTools],
```

- [ ] **Step 4: Run full test suite and typecheck**

Run: `pnpm run typecheck && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/market/index.ts src/runtime/server.ts src/runtime/managed-runtime.ts
git commit -m "feat: register 20 market tools in MCP server and runtime"
```

---

## Chunk 3: Research Tool Handlers

### Task 11: Implement DefiLlama feed research handlers

**Files:**
- Create: `src/tools/research/defillama.ts`
- Create: `tests/tools/research/defillama.test.ts`

- [ ] **Step 1: Write tests for all 7 DefiLlama feed handlers**

Test `getTokenUnlocks`, `getHackHistory`, `getFundRaises`, `getWhaleTransfers`, `getGovernance`, `getNews`, `getAirdrops`. Mock `resilientFetch`. Each test:
- Success path with mock data matching real API shapes (from spec endpoint exploration)
- Response transformation (Unix timestamps → ISO strings, snake_case → camelCase)
- Filtering by optional params (e.g., `symbol` for whale transfers, `protocol` for hacks, `status` for governance)
- Limit slicing

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement all 7 handlers**

Create `src/tools/research/defillama.ts`. All use `resilientFetch` with `label: "defillama-feed"` and `ttlCache` with 60s TTL. Transform response fields:

Key transformations:
- `getTokenUnlocks`: `next_event` (Unix) → `nextEvent` (ISO), `to_unlock_usd` → `toUnlockUsd`, `delta_rel` → `priceImpactPercent`
- `getHackHistory`: `timestamp` → `date` (ISO), `amount` → `amountUsd`, `source_url` → `sourceUrl`
- `getFundRaises`: `timestamp` → `date`, `lead_investor` → `leadInvestor`, `source_url` → `sourceUrl`
- `getWhaleTransfers`: `transaction_hash` → `txHash`, `block_time` → `blockTime`, `value_usd` → `valueUsd`, `from_entity` → `fromEntity`, `to_entity` → `toEntity`
- `getGovernance`: `org_name` → `orgName`, `start` → `startDate` (ISO), `end` → `endDate` (ISO), `voters` → `voterCount`
- `getNews`: `pub_date` → `publishedAt`, `content` → `summary`
- `getAirdrops`: `claim_page` → `claimPage`, `ends` → `endsAt` (ISO if present), `delta_rel` → `priceChange`

- [ ] **Step 4: Run tests, lint, typecheck**

- [ ] **Step 5: Commit**

```bash
git add src/tools/research/defillama.ts tests/tools/research/defillama.test.ts
git commit -m "feat: add DefiLlama feed research handlers"
```

---

### Task 12: Implement yields research handlers

**Files:**
- Create: `src/tools/research/yields.ts`
- Create: `tests/tools/research/yields.test.ts`

- [ ] **Step 1: Write tests for `getYieldOpportunities`, `getCompareYields`, and `getProtocolInfo`**

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement**

`getYieldOpportunities`: fetch `https://yields.llama.fi/pools`, filter by token/chain/protocol/minTvl, sort by tvlUsd desc, slice to limit.

`getCompareYields`: same endpoint, filter by token symbol in pool `symbol` field, sort by apy desc.

`getProtocolInfo`: fetch `https://api.llama.fi/protocol/{slug}`, extract metadata. If response has `gecko_id`, also fetch `https://api.coingecko.com/api/v3/coins/{gecko_id}` for enrichment. Use partial failure pattern (CoinGecko failure → return DefiLlama-only with warning). If no `gecko_id`, skip CoinGecko silently.

- [ ] **Step 4: Run tests, lint, typecheck**

- [ ] **Step 5: Commit**

```bash
git add src/tools/research/yields.ts tests/tools/research/yields.test.ts
git commit -m "feat: add yield comparison and protocol info research handlers"
```

---

### Task 13: Implement security research handlers

**Files:**
- Create: `src/tools/research/security.ts`
- Create: `tests/tools/research/security.test.ts`

- [ ] **Step 1: Write tests for `getContractSecurity`, `getTokenDueDiligence`, `getTokenHolders`**

For `getTokenDueDiligence`, test:
- All three sources succeed → full result with `sources: ["goplus", "dexscreener", "onchain"]`
- One source fails → partial result with warning
- All sources fail → error
- Symbol input triggers `resolveToken()` call

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement**

`getContractSecurity`: fetch GoPlus API `https://api.gopluslabs.io/api/v1/contract_security/{chainId}?contract_addresses={address}`. Map GoPlus chain IDs (1 = Ethereum, 56 = BSC, etc.). Transform response.

`getTokenDueDiligence`: orchestrate 3 parallel calls:
```typescript
const [goplusResult, dexResult, onchainResult] = await Promise.allSettled([
  fetchGoPlus(address, chainId),
  fetchDexScreener(address),
  fetchOnChainSupply(address, chainId),
]);
```
Merge results, compute `riskLevel` ("low"/"medium"/"high") based on honeypot/tax/liquidity signals. Build `warnings` and `sources` arrays from settled results.

`getTokenHolders`: try GoPlus holder API first. If `ETHERSCAN_API_KEY` is set, use Etherscan for richer data.

- [ ] **Step 4: Run tests, lint, typecheck**

- [ ] **Step 5: Commit**

```bash
git add src/tools/research/security.ts tests/tools/research/security.test.ts
git commit -m "feat: add security and due diligence research handlers"
```

---

### Task 14: Create research tool index and register in runtime

**Files:**
- Create: `src/tools/research/index.ts`
- Modify: `src/runtime/server.ts`
- Modify: `src/runtime/managed-runtime.ts`

- [ ] **Step 1: Create research tool index**

Same pattern as Task 10 but for research tools. 13 tool definitions, all using `createToolHandler`.

- [ ] **Step 2: Register in server.ts**

Same pattern as Task 10:
- Import `getResearchToolDefinitions`
- Add `researchTools` variable
- Add dispatch loop
- Add to `getMcpTools()`

- [ ] **Step 3: Register in managed-runtime.ts**

Same pattern as Task 10:
- Import `getResearchToolDefinitions`
- Add class property `private readonly researchTools`
- Add to `toolGroups`: `["research", this.researchTools]`

- [ ] **Step 4: Run full test suite**

Run: `pnpm run typecheck && pnpm test`
Expected: PASS (all existing + new tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/research/index.ts src/runtime/server.ts src/runtime/managed-runtime.ts
git commit -m "feat: register 13 research tools in MCP server and runtime"
```

---

## Chunk 4: SDK Layer & Exports

### Task 15: Create market SDK functions

**Files:**
- Create: `src/api/market.ts`
- Create: `tests/api/market.test.ts`
- Modify: `src/api/types.ts` (add input/output types)

- [ ] **Step 1: Add types to `src/api/types.ts`**

For each of the 20 market tools, add an input type derived from the Zod schema:

```typescript
import type { z } from "zod";
import type {
  marketGetProtocolTvlSchema,
  marketGetTopProtocolsSchema,
  // ... all 20 schemas
} from "./schemas.js";

export type GetProtocolTvlInput = z.infer<typeof marketGetProtocolTvlSchema>;
export type GetTopProtocolsInput = z.infer<typeof marketGetTopProtocolsSchema>;
// ... etc
```

Output types must be derived from Zod output schemas via `z.infer<typeof schema>` (the output schemas should already exist in `src/api/schemas/outputs.ts` from the handler tasks).

- [ ] **Step 2: Write SDK tests**

```typescript
// tests/api/market.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/api/shared.js", () => ({
  getRuntime: vi.fn(),
  invokeAndRequireData: vi.fn(),
}));

import { getRuntime, invokeAndRequireData } from "../../src/api/shared.js";
import { getProtocolTvl } from "../../src/api/market.js";

describe("market SDK functions", () => {
  it("getProtocolTvl invokes the correct tool", async () => {
    const mockRuntime = {};
    vi.mocked(getRuntime).mockResolvedValue(mockRuntime as any);
    vi.mocked(invokeAndRequireData).mockResolvedValue({ tvl: 1000 });

    const result = await getProtocolTvl({ protocol: "aave" });
    expect(invokeAndRequireData).toHaveBeenCalledWith(mockRuntime, "market_get_protocol_tvl", { protocol: "aave" });
    expect(result).toEqual({ tvl: 1000 });
  });
});
```

Write one test per SDK function verifying it passes the correct tool name and params.

- [ ] **Step 3: Implement SDK functions**

```typescript
// src/api/market.ts
import type { RuntimeBoundOptions } from "./types.js";
import { getRuntime, invokeAndRequireData } from "./shared.js";

export async function getProtocolTvl(
  params: { protocol: string },
  options?: RuntimeBoundOptions
) {
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "market_get_protocol_tvl", params);
}

// ... 19 more functions, all following the same 3-line pattern
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- --run tests/api/market.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/market.ts src/api/types.ts tests/api/market.test.ts
git commit -m "feat: add market SDK functions"
```

---

### Task 16: Create research SDK functions

**Files:**
- Create: `src/api/research.ts`
- Create: `tests/api/research.test.ts`
- Modify: `src/api/types.ts` (add input types)

Same pattern as Task 15 but for 13 research tools.

- [ ] **Step 1: Add types**
- [ ] **Step 2: Write tests**
- [ ] **Step 3: Implement SDK functions**
- [ ] **Step 4: Run tests**
- [ ] **Step 5: Commit**

```bash
git add src/api/research.ts src/api/types.ts tests/api/research.test.ts
git commit -m "feat: add research SDK functions"
```

---

### Task 17: Export from src/index.ts and verify build

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add barrel re-exports for market and research SDK functions**

Add to `src/index.ts`:

```typescript
// Market data
export {
  getProtocolTvl,
  getTopProtocols,
  getChainTvl,
  getTokenPrice,
  getTokenHistory,
  getGainersLosers,
  getDexVolume,
  getStablecoinStats,
  getGlobalStats,
  getCexFundFlows,
  getExchangeRankings,
  getSentiment,
  getTrending,
  getTopTokens,
  searchToken,
  getCategories,
  getTicker,
  getKlines,
  getOrderBook,
  getFundingRates,
} from "./api/market.js";

// Research
export {
  getContractSecurity,
  getTokenDueDiligence,
  getTokenHolders,
  getYieldOpportunities,
  getCompareYields,
  getProtocolInfo,
  getTokenUnlocks,
  getHackHistory,
  getFundRaises,
  getWhaleTransfers,
  getGovernance,
  getNews,
  getAirdrops,
} from "./api/research.js";
```

Also export any new types needed by consumers.

- [ ] **Step 2: Run build and verify exports**

Run: `pnpm run build`
Expected: PASS. Check `dist/index.d.ts` contains all 33 new function exports.

- [ ] **Step 3: Run full validation**

Run: `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: export market and research SDK functions from package"
```

---

## Chunk 5: Integration Verification

### Task 18: Full integration test

**Files:**
- Create: `tests/tools/market/integration.test.ts`
- Create: `tests/tools/research/integration.test.ts`

- [ ] **Step 1: Write integration tests verifying tool registration**

```typescript
// tests/tools/market/integration.test.ts
import { describe, expect, it } from "vitest";
import { getMarketToolDefinitions } from "../../../src/tools/market/index.js";

describe("market tool registration", () => {
  const tools = getMarketToolDefinitions();

  it("registers exactly 20 tools", () => {
    expect(tools).toHaveLength(20);
  });

  it("all tools have the market_ prefix", () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^market_/);
    }
  });

  it("all tools have category 'market'", () => {
    for (const tool of tools) {
      expect(tool.category).toBe("market");
    }
  });

  it("all tools have readOnlyHint annotation", () => {
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  it("all tools have non-empty descriptions", () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it("all tools have valid inputSchema", () => {
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});
```

Write similar for research (13 tools, `research_` prefix, `"research"` category).

- [ ] **Step 2: Run integration tests**

Run: `pnpm test -- --run tests/tools/market/integration.test.ts tests/tools/research/integration.test.ts`
Expected: PASS

- [ ] **Step 3: Run the full validation suite**

Run: `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add tests/tools/market/integration.test.ts tests/tools/research/integration.test.ts
git commit -m "test: add integration tests for market and research tool registration"
```

---

### Task 19: Final build verification and cleanup

- [ ] **Step 1: Run all four checks**

Run: `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`
Expected: ALL PASS

- [ ] **Step 2: Verify export surface**

Run: `grep -c "export" dist/index.d.ts` to confirm the new functions appear in the public API.

- [ ] **Step 3: Verify no regressions**

Check that all existing tests still pass. The new tools should not affect any existing functionality.

- [ ] **Step 4: Final commit if any cleanup was needed**

```bash
git commit -m "chore: final cleanup for market and research tools"
```
