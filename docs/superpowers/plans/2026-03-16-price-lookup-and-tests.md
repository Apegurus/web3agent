# Token Price Lookup & Missing Tests Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreliable USD heuristic in `extractEstimatedUsd` with actual token price lookups, and fill test coverage gaps.

**Architecture:** New `src/tokens/pricing.ts` module provides `getTokenPriceUsd(address, chainId)` with CoinGecko contract price as primary source, DexScreener as fallback, stablecoin short-circuit via registry symbol lookup, and a TTL memory cache. The existing `extractEstimatedUsd` is rewritten as async to call this module. All external HTTP uses `resilientFetch`.

**Tech Stack:** CoinGecko `/simple/token_price/{platform}` API, DexScreener `/latest/dex/tokens/{address}` API, `resilientFetch`, vitest.

**Key review findings addressed in this version:**
- CoinGecko helpers use existing `getCoinGeckoApiKey()` internally (not zero-arg wrappers)
- DexScreener endpoint corrected to `/latest/dex/tokens/{address}` with `{ pairs: [...] }` response shape
- Stablecoin detection uses token registry symbol lookup (DRY, no hardcoded address set)
- Native token addresses (0x000...0, 0xeee...eee) handled via wrapped-token fallback
- `tests/tools/transaction-tools.test.ts` mock updated from `mockReturnValue` to `mockResolvedValue`
- `COINGECKO_PLATFORMS` reuses `FALLBACK_PLATFORM_CHAIN_IDS` from coingecko.ts (DRY)
- Tests mock `resilientFetch` directly instead of global `fetch` to avoid retry delay issues

---

## Chunk 1: Quick-Win Tests

### Task 1: Tests for `budget.ts`

**Files:**
- Create: `tests/policy/budget.test.ts`
- Read: `src/policy/budget.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, expect, it } from "vitest";
import { getRemainingBudget } from "../../src/policy/budget.js";
import type { TreasuryPolicy } from "../../src/policy/types.js";
import type { SpendWindow } from "../../src/policy/types.js";

const POLICY: TreasuryPolicy = {
  enabled: true,
  maxSingleTransactionUsd: 100,
  maxHourlyUsd: 500,
  maxDailyUsd: 2000,
  minReserveUsd: 10,
  maxX402PaymentUsd: 5,
};

describe("getRemainingBudget", () => {
  it("returns full budget when no spend", () => {
    const spend: SpendWindow = { hourlyUsd: 0, dailyUsd: 0, hourlyCount: 0, dailyCount: 0 };
    const result = getRemainingBudget(POLICY, spend);
    expect(result.hourlyUsd).toBe(500);
    expect(result.dailyUsd).toBe(2000);
  });

  it("returns reduced budget after spending", () => {
    const spend: SpendWindow = { hourlyUsd: 200, dailyUsd: 800, hourlyCount: 2, dailyCount: 5 };
    const result = getRemainingBudget(POLICY, spend);
    expect(result.hourlyUsd).toBe(300);
    expect(result.dailyUsd).toBe(1200);
  });

  it("clamps to zero when overspent", () => {
    const spend: SpendWindow = { hourlyUsd: 600, dailyUsd: 2500, hourlyCount: 10, dailyCount: 20 };
    const result = getRemainingBudget(POLICY, spend);
    expect(result.hourlyUsd).toBe(0);
    expect(result.dailyUsd).toBe(0);
  });

  it("handles exact limit", () => {
    const spend: SpendWindow = { hourlyUsd: 500, dailyUsd: 2000, hourlyCount: 5, dailyCount: 10 };
    const result = getRemainingBudget(POLICY, spend);
    expect(result.hourlyUsd).toBe(0);
    expect(result.dailyUsd).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test -- --run tests/policy/budget.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/policy/budget.test.ts
git commit -m "test: add tests for policy budget utility"
```

---

### Task 2: Tests for `atomic-write.ts`

**Files:**
- Create: `tests/utils/atomic-write.test.ts`
- Read: `src/utils/atomic-write.ts`

- [ ] **Step 1: Write tests**

```typescript
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atomicWriteJson } from "../../src/utils/atomic-write.js";

const TEST_DIR = join(tmpdir(), `web3agent-atomic-write-test-${process.pid}`);

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("atomicWriteJson", () => {
  it("writes JSON to a new file", async () => {
    const filePath = join(TEST_DIR, "test.json");
    await atomicWriteJson(filePath, { key: "value" });
    const content = JSON.parse(await readFile(filePath, "utf-8"));
    expect(content).toEqual({ key: "value" });
  });

  it("creates parent directories if missing", async () => {
    const filePath = join(TEST_DIR, "nested", "deep", "file.json");
    await atomicWriteJson(filePath, { nested: true });
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(await readFile(filePath, "utf-8"));
    expect(content).toEqual({ nested: true });
  });

  it("overwrites existing file atomically", async () => {
    const filePath = join(TEST_DIR, "overwrite.json");
    await atomicWriteJson(filePath, { version: 1 });
    await atomicWriteJson(filePath, { version: 2 });
    const content = JSON.parse(await readFile(filePath, "utf-8"));
    expect(content).toEqual({ version: 2 });
  });

  it("does not leave tmp file on success", async () => {
    const filePath = join(TEST_DIR, "clean.json");
    await atomicWriteJson(filePath, { clean: true });
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test -- --run tests/utils/atomic-write.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/utils/atomic-write.test.ts
git commit -m "test: add tests for atomic-write utility"
```

---

## Chunk 2: Token Price Lookup Module

### Task 3: Build `src/tokens/pricing.ts`

**Files:**
- Create: `src/tokens/pricing.ts`
- Modify: `src/tokens/coingecko.ts` (export `FALLBACK_PLATFORM_CHAIN_IDS`, `getCoinGeckoApiKey`, and add two thin wrappers)
- Create: `tests/tokens/pricing.test.ts`

The module provides two functions:
1. `getTokenPriceUsd(address, chainId)` — returns USD price or null
2. `estimateTokenUsd(address, chainId, amountRaw, decimals)` — converts a raw token amount to USD

Design:
- **Stablecoin short-circuit**: use `lookupTokenByAddress` to get symbol, check if symbol is in `STABLECOIN_SYMBOLS` set → $1.00 (DRY — uses registry, no hardcoded addresses)
- **Native token handling**: detect zero/sentinel addresses, map to wrapped token address, look up wrapped price
- **Memory cache**: `Map<"chainId:address", { priceUsd, fetchedAt }>` with 5-min TTL
- **CoinGecko primary**: `/simple/token_price/{platform}?contract_addresses={addr}&vs_currencies=usd`
- **DexScreener fallback**: `/latest/dex/tokens/{address}` → filter pairs by chainId → extract `priceUsd`
- **Graceful degradation**: returns null on failure, caller decides what to do
- **Platform ID map**: reuse `FALLBACK_PLATFORM_CHAIN_IDS` from `coingecko.ts` (inverted: chainId → platform) to avoid duplication

- [ ] **Step 1: Export helpers from `coingecko.ts`**

In `src/tokens/coingecko.ts`, export `FALLBACK_PLATFORM_CHAIN_IDS` (already `Readonly`) and `getCoinGeckoApiKey`. Then add two thin wrapper functions that call `getCoinGeckoApiKey()` internally:

```typescript
// Add these exports:
export { getCoinGeckoApiKey, FALLBACK_PLATFORM_CHAIN_IDS };

export function getTokenPriceUrl(): string {
  return getCoinGeckoBaseUrl(getCoinGeckoApiKey());
}

export function getTokenPriceHeaders(): Record<string, string> {
  return getCoinGeckoHeaders(getCoinGeckoApiKey());
}
```

- [ ] **Step 2: Write the failing test file**

Create `tests/tokens/pricing.test.ts`. Mock `resilientFetch` directly (not global `fetch`) to avoid retry delay issues:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockResilientFetch = vi.hoisted(() => vi.fn());
vi.mock("../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: mockResilientFetch,
}));

// Mock coingecko exports
vi.mock("../../src/tokens/coingecko.js", () => ({
  getTokenPriceUrl: vi.fn().mockReturnValue("https://api.coingecko.com/api/v3"),
  getTokenPriceHeaders: vi.fn().mockReturnValue({}),
  FALLBACK_PLATFORM_CHAIN_IDS: {
    ethereum: 1,
    "binance-smart-chain": 56,
    "polygon-pos": 137,
    "arbitrum-one": 42161,
    base: 8453,
  },
}));

import { estimateTokenUsd, getTokenPriceUsd, resetPriceCache } from "../../src/tokens/pricing.js";

beforeEach(() => {
  resetPriceCache();
  mockResilientFetch.mockReset();
});

describe("getTokenPriceUsd", () => {
  it("returns ~1.0 for known stablecoins without network call", async () => {
    // USDC on Ethereum (resolved via registry lookup)
    const price = await getTokenPriceUsd("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 1);
    expect(price).toBe(1.0);
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });

  it("fetches price from CoinGecko for non-stablecoin", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { usd: 7.42 } }),
        { status: 200 }
      )
    );
    const price = await getTokenPriceUsd("0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", 1);
    expect(price).toBe(7.42);
  });

  it("returns cached price on second call within TTL", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { usd: 7.42 } }),
        { status: 200 }
      )
    );
    await getTokenPriceUsd("0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", 1);
    const price = await getTokenPriceUsd("0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", 1);
    expect(price).toBe(7.42);
    expect(mockResilientFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to DexScreener when CoinGecko fails", async () => {
    mockResilientFetch
      .mockResolvedValueOnce(new Response("error", { status: 500 })) // CoinGecko
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ pairs: [{ priceUsd: "3.50", chainId: "ethereum" }] }),
          { status: 200 }
        )
      ); // DexScreener
    const price = await getTokenPriceUsd("0xunknowntoken", 1);
    expect(price).toBe(3.5);
  });

  it("returns null when both sources fail", async () => {
    mockResilientFetch.mockResolvedValue(new Response("error", { status: 500 }));
    const price = await getTokenPriceUsd("0xunknowntoken", 1);
    expect(price).toBeNull();
  });

  it("returns null for unsupported chainId", async () => {
    const price = await getTokenPriceUsd("0xsomething", 999999);
    expect(price).toBeNull();
  });
});

describe("estimateTokenUsd", () => {
  it("converts raw amount to USD using price and decimals", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { usd: 10.0 } }),
        { status: 200 }
      )
    );
    // 1.5 tokens with 18 decimals
    const usd = await estimateTokenUsd(
      "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
      1,
      "1500000000000000000",
      18
    );
    expect(usd).toBe(15.0);
  });

  it("handles 6-decimal stablecoin (USDC)", async () => {
    const usd = await estimateTokenUsd(
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      1,
      "1000000", // 1 USDC
      6
    );
    expect(usd).toBe(1.0);
  });

  it("returns null when price unavailable", async () => {
    mockResilientFetch.mockResolvedValue(new Response("error", { status: 500 }));
    const usd = await estimateTokenUsd("0xunknown", 999999, "1000000000000000000", 18);
    expect(usd).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- --run tests/tokens/pricing.test.ts`
Expected: FAIL — module `../../src/tokens/pricing.js` not found

- [ ] **Step 4: Implement `src/tokens/pricing.ts`**

Key implementation details:
- Import `FALLBACK_PLATFORM_CHAIN_IDS` from coingecko.ts and invert to `chainId → platform`
- Use `lookupTokenByAddress` to detect stablecoins by symbol (USDC, USDT, DAI, USDbC, BUSD)
- Handle native token addresses (0x000...0, 0xeee...eee) by mapping to wrapped token
- Use `WRAPPED_NATIVE_BY_CHAIN` from `src/orbs/liquidity-hub.ts` for native → wrapped mapping
- DexScreener response shape: `{ pairs: [{ priceUsd, chainId }] }` — filter pairs by matching chain

```typescript
import { resilientFetch } from "../utils/resilient-fetch.js";
import { FALLBACK_PLATFORM_CHAIN_IDS, getTokenPriceHeaders, getTokenPriceUrl } from "./coingecko.js";
import { lookupTokenByAddress } from "./registry.js";

const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Internal-only cache type — not a tool schema, no Zod needed
interface CachedPrice {
  priceUsd: number;
  fetchedAt: number;
}

const priceCache = new Map<string, CachedPrice>();

function cacheKey(address: string, chainId: number): string {
  return `${chainId}:${address.toLowerCase()}`;
}

// Stablecoin symbols → treat as $1.00
const STABLECOIN_SYMBOLS = new Set(["USDC", "USDT", "DAI", "USDbC", "BUSD", "USDB"]);

// Invert FALLBACK_PLATFORM_CHAIN_IDS: chainId → platform string
const CHAIN_TO_PLATFORM: Record<number, string> = {};
for (const [platform, chainId] of Object.entries(FALLBACK_PLATFORM_CHAIN_IDS)) {
  CHAIN_TO_PLATFORM[chainId] = platform;
}

// DexScreener chain slugs by chainId
const DEXSCREENER_CHAINS: Record<number, string> = {
  1: "ethereum", 56: "bsc", 137: "polygon", 42161: "arbitrum",
  10: "optimism", 8453: "base", 59144: "linea", 43114: "avalanche",
  81457: "blast", 324: "zksync", 534352: "scroll", 100: "gnosischain",
  42220: "celo", 5000: "mantle", 34443: "mode",
};

// Native token sentinel addresses
const NATIVE_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "0x0000000000000000000000000000000000001010",
]);

// Wrapped native tokens per chain (same as orbs/liquidity-hub.ts)
const WRAPPED_NATIVE: Record<number, string> = {
  1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  137: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
  56: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
  8453: "0x4200000000000000000000000000000000000006",
  42161: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  10: "0x4200000000000000000000000000000000000006",
  43114: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
};

function isStablecoin(address: string, chainId: number): boolean {
  const entry = lookupTokenByAddress(address, chainId);
  return entry !== undefined && STABLECOIN_SYMBOLS.has(entry.symbol);
}

function resolveNativeToWrapped(address: string, chainId: number): string | null {
  if (!NATIVE_ADDRESSES.has(address.toLowerCase())) return null;
  return WRAPPED_NATIVE[chainId] ?? null;
}

export async function getTokenPriceUsd(
  address: string,
  chainId: number
): Promise<number | null> {
  const normalizedAddress = address.toLowerCase();

  // Handle native token → wrapped
  const wrappedAddress = resolveNativeToWrapped(normalizedAddress, chainId);
  const lookupAddress = wrappedAddress ?? normalizedAddress;

  // Stablecoin short-circuit
  if (isStablecoin(lookupAddress, chainId)) return 1.0;

  // Check cache
  const key = cacheKey(lookupAddress, chainId);
  const cached = priceCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return cached.priceUsd;
  }

  // Try CoinGecko
  const price = await fetchCoinGeckoTokenPrice(lookupAddress, chainId);
  if (price !== null) {
    priceCache.set(key, { priceUsd: price, fetchedAt: Date.now() });
    return price;
  }

  // Fall back to DexScreener
  const dexPrice = await fetchDexScreenerPrice(lookupAddress, chainId);
  if (dexPrice !== null) {
    priceCache.set(key, { priceUsd: dexPrice, fetchedAt: Date.now() });
    return dexPrice;
  }

  return null;
}

export async function estimateTokenUsd(
  address: string,
  chainId: number,
  amountRaw: string,
  decimals: number
): Promise<number | null> {
  const price = await getTokenPriceUsd(address, chainId);
  if (price === null) return null;

  const amount = Number(amountRaw) / 10 ** decimals;
  return amount * price;
}

async function fetchCoinGeckoTokenPrice(
  address: string,
  chainId: number
): Promise<number | null> {
  const platform = CHAIN_TO_PLATFORM[chainId];
  if (!platform) return null;

  try {
    const baseUrl = getTokenPriceUrl();
    const url = `${baseUrl}/simple/token_price/${platform}?contract_addresses=${address}&vs_currencies=usd`;
    const response = await resilientFetch(url, { headers: getTokenPriceHeaders() }, {
      label: "coingecko-token-price",
      retry: { maxRetries: 1 },
      timeoutMs: 10_000,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, { usd?: number }>;
    return data[address]?.usd ?? null;
  } catch (e: unknown) {
    process.stderr.write(`[tokens] CoinGecko token price failed for ${address}: ${e}\n`);
    return null;
  }
}

async function fetchDexScreenerPrice(
  address: string,
  chainId: number
): Promise<number | null> {
  const expectedChain = DEXSCREENER_CHAINS[chainId];
  if (!expectedChain) return null;

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
    const response = await resilientFetch(url, undefined, {
      label: "dexscreener-price",
      retry: { maxRetries: 1 },
      timeoutMs: 10_000,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { pairs?: Array<{ priceUsd?: string; chainId?: string }> };
    // Find first pair matching our chain
    const pair = data.pairs?.find(p => p.chainId === expectedChain);
    if (!pair?.priceUsd) return null;

    const price = Number(pair.priceUsd);
    return Number.isNaN(price) ? null : price;
  } catch (e: unknown) {
    process.stderr.write(`[tokens] DexScreener price failed for ${address}: ${e}\n`);
    return null;
  }
}

export function resetPriceCache(): void {
  priceCache.clear();
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test -- --run tests/tokens/pricing.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Run full validation**

Run: `pnpm run lint && pnpm run typecheck`
Expected: Both pass

- [ ] **Step 7: Commit**

```bash
git add src/tokens/pricing.ts src/tokens/coingecko.ts tests/tokens/pricing.test.ts
git commit -m "feat: add token price lookup with CoinGecko + DexScreener + cache"
```

---

### Task 4: Rewrite `extractEstimatedUsd` to use pricing module

**Files:**
- Modify: `src/policy/extract-usd.ts`
- Modify: `src/runtime/managed-runtime.ts` (call site — function is now async)
- Modify: `src/tools/wallet/index.ts` (call site — `transactionConfirm` handler)
- Modify: `tests/tools/transaction-tools.test.ts` (update mock from `mockReturnValue` to `mockResolvedValue`)
- Create: `tests/policy/extract-usd.test.ts`

The function becomes async and uses real price lookups:
1. Check explicit USD fields first (keep existing behavior)
2. If not found, look for `fromToken` + `fromAmount` + `chainId` in params
3. Resolve decimals from registry or params, fetch price, compute USD
4. Return 0 if price unavailable (with warning already logged at call site)

**Note:** The old `AMOUNT_FIELD_NAMES` fallback (`["amount", "budget", "fromAmount", "value"]`) that treated raw token amounts as USD is intentionally dropped — it was unreliable and could either wildly overcount (1M USDC units → $1M) or undercount. The new behavior: explicit USD fields OR real price lookup OR 0 with a warning.

- [ ] **Step 1: Write the failing test file**

Create `tests/policy/extract-usd.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPricing = vi.hoisted(() => ({
  estimateTokenUsd: vi.fn(),
}));

vi.mock("../../src/tokens/pricing.js", () => mockPricing);

const mockRegistry = vi.hoisted(() => ({
  lookupTokenByAddress: vi.fn(),
}));

vi.mock("../../src/tokens/registry.js", () => mockRegistry);

import { extractEstimatedUsd } from "../../src/policy/extract-usd.js";

describe("extractEstimatedUsd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns explicit amountUsd field", async () => {
    const result = await extractEstimatedUsd({ amountUsd: 42.5 });
    expect(result).toBe(42.5);
    expect(mockPricing.estimateTokenUsd).not.toHaveBeenCalled();
  });

  it("returns explicit estimatedUsd string field", async () => {
    const result = await extractEstimatedUsd({ estimatedUsd: "15.75" });
    expect(result).toBe(15.75);
  });

  it("uses pricing module when fromToken + fromAmount + chainId present", async () => {
    mockRegistry.lookupTokenByAddress.mockReturnValue({ decimals: 18 });
    mockPricing.estimateTokenUsd.mockResolvedValue(150.0);
    const result = await extractEstimatedUsd({
      fromToken: "0xtoken",
      fromAmount: "1000000000000000000",
      chainId: 1,
    });
    expect(result).toBe(150.0);
    expect(mockPricing.estimateTokenUsd).toHaveBeenCalledWith("0xtoken", 1, "1000000000000000000", 18);
  });

  it("uses decimals from params if registry lookup fails", async () => {
    mockRegistry.lookupTokenByAddress.mockReturnValue(undefined);
    mockPricing.estimateTokenUsd.mockResolvedValue(50.0);
    const result = await extractEstimatedUsd({
      fromToken: "0xtoken",
      fromAmount: "1000000",
      chainId: 1,
      fromDecimals: 6,
    });
    expect(result).toBe(50.0);
    expect(mockPricing.estimateTokenUsd).toHaveBeenCalledWith("0xtoken", 1, "1000000", 6);
  });

  it("returns 0 when price lookup fails", async () => {
    mockRegistry.lookupTokenByAddress.mockReturnValue({ decimals: 18 });
    mockPricing.estimateTokenUsd.mockResolvedValue(null);
    const result = await extractEstimatedUsd({
      fromToken: "0xtoken",
      fromAmount: "1000000000000000000",
      chainId: 1,
    });
    expect(result).toBe(0);
  });

  it("returns 0 when no recognizable fields", async () => {
    const result = await extractEstimatedUsd({ foo: "bar" });
    expect(result).toBe(0);
  });

  it("returns 0 when fromToken present but no chainId", async () => {
    const result = await extractEstimatedUsd({
      fromToken: "0xtoken",
      fromAmount: "1000000000000000000",
    });
    expect(result).toBe(0);
  });

  it("ignores negative and NaN explicit values", async () => {
    expect(await extractEstimatedUsd({ amountUsd: -5 })).toBe(0);
    expect(await extractEstimatedUsd({ amountUsd: "abc" })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/policy/extract-usd.test.ts`
Expected: FAIL — extractEstimatedUsd is not async yet

- [ ] **Step 3: Rewrite `src/policy/extract-usd.ts`**

```typescript
import { estimateTokenUsd } from "../tokens/pricing.js";
import { lookupTokenByAddress } from "../tokens/registry.js";

const USD_FIELD_NAMES = ["amountUsd", "amount_usd", "estimatedUsd"];

export async function extractEstimatedUsd(args: Record<string, unknown>): Promise<number> {
  // 1. Check explicit USD fields
  for (const key of USD_FIELD_NAMES) {
    const val = args[key];
    if (typeof val === "number" && val > 0) return val;
    if (typeof val === "string") {
      const parsed = Number(val);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  // 2. Try fromToken + fromAmount + chainId price lookup
  const fromToken = args.fromToken;
  const fromAmount = args.fromAmount;
  const chainId = args.chainId;
  if (
    typeof fromToken === "string" &&
    typeof fromAmount === "string" &&
    typeof chainId === "number"
  ) {
    const entry = lookupTokenByAddress(fromToken, chainId);
    const decimals = entry?.decimals ?? (typeof args.fromDecimals === "number" ? args.fromDecimals : null);
    if (decimals !== null) {
      const usd = await estimateTokenUsd(fromToken, chainId, fromAmount, decimals);
      return usd ?? 0;
    }
  }

  return 0;
}
```

- [ ] **Step 4: Update all call sites**

**`src/runtime/managed-runtime.ts`** (~line 308):
```typescript
// Before:
const estimatedUsd = isFinancial ? extractEstimatedUsd(args) : 0;
// After:
const estimatedUsd = isFinancial ? await extractEstimatedUsd(args) : 0;
```

**`src/tools/wallet/index.ts`** (in `transactionConfirm` handler, where `extractEstimatedUsd` is called):
Same change — add `await`.

**`tests/tools/transaction-tools.test.ts`** (line ~58):
```typescript
// Before:
vi.mock("../../src/policy/extract-usd.js", () => ({
  extractEstimatedUsd: vi.fn().mockReturnValue(0),
}));
// After:
vi.mock("../../src/policy/extract-usd.js", () => ({
  extractEstimatedUsd: vi.fn().mockResolvedValue(0),
}));
```

- [ ] **Step 5: Run extract-usd tests**

Run: `pnpm test -- --run tests/policy/extract-usd.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Run full validation**

Run: `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/policy/extract-usd.ts src/runtime/managed-runtime.ts src/tools/wallet/index.ts tests/policy/extract-usd.test.ts tests/tools/transaction-tools.test.ts
git commit -m "feat: replace USD heuristic with real token price lookup"
```

---

## Chunk 3: Balance Cache Tests & Cleanup

### Task 5: Tests for `balance-cache.ts`

**Files:**
- Create: `tests/policy/balance-cache.test.ts`
- Read: `src/policy/balance-cache.ts`

Note: `balance-cache.ts` uses `resilientFetch` internally. Mock it directly to avoid retry complications.

- [ ] **Step 1: Write tests**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResilientFetch = vi.hoisted(() => vi.fn());
vi.mock("../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: mockResilientFetch,
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn().mockReturnValue({
      getBalance: vi.fn().mockResolvedValue(BigInt("2000000000000000000")), // 2 ETH
    }),
  };
});

vi.mock("../../src/config/wallet-factory.js", () => ({
  getTransportForChain: vi.fn().mockReturnValue("mock-transport"),
}));

import {
  getCachedBalanceUsd,
  refreshBalanceUsd,
  resetBalanceCache,
} from "../../src/policy/balance-cache.js";

beforeEach(() => {
  resetBalanceCache();
  mockResilientFetch.mockReset();
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
    expect(getCachedBalanceUsd()).toBeCloseTo(7000, 0);
  });

  it("returns null when price fetch fails", async () => {
    mockResilientFetch.mockResolvedValueOnce(new Response("error", { status: 500 }));
    const result = await refreshBalanceUsd("0xaddr", 1);
    expect(result).toBeNull();
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
    expect(getCachedBalanceUsd()).not.toBeNull();
    resetBalanceCache();
    expect(getCachedBalanceUsd()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test -- --run tests/policy/balance-cache.test.ts`
Expected: PASS (5 tests). Mocking may need adjustment based on actual balance-cache internals.

- [ ] **Step 3: Commit**

```bash
git add tests/policy/balance-cache.test.ts
git commit -m "test: add tests for policy balance cache"
```

---

### Task 6: Final validation and cleanup

- [ ] **Step 1: Run full validation suite**

Run: `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`
Expected: All pass, no regressions

- [ ] **Step 2: Check for any remaining bare catch blocks or convention violations**

Run: `grep -rn "catch {" src/ --include="*.ts"` — should return zero results (all catches should have `(e: unknown)`)

- [ ] **Step 3: Verify schema quality test still passes**

Run: `pnpm test -- --run tests/tools/schema-quality.test.ts`
Expected: PASS — the new `policyGetSchema` should be auto-discovered

- [ ] **Step 4: Final commit if any cleanup needed**
