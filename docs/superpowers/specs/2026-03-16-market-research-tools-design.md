# Market Data & Research Tools — Design Spec

Two new native tool groups that give AI agents and human users market intelligence and on-chain research capabilities through the existing MCP server.

## Motivation

web3agent currently covers swaps, bridging, wallet management, and on-chain reads, but has no tools for market intelligence, protocol research, or due diligence. Agents and users need this context to make informed decisions (e.g., checking a token's security before swapping, comparing yields before deploying capital, understanding market sentiment).

Ottie (a competing agent framework) covers this space via Markdown-prompt skills that teach the LLM to curl public APIs. Our approach is to build validated, typed MCP tools with Zod schemas, consistent with the rest of the codebase.

## Scope

**Must-have (33 tools):**
- Market tool group (20 tools) — prices, TVL, sentiment, trending, CEX data, token rankings, categories
- Research tool group (13 tools) — contract security, due diligence, yields, governance, whale tracking

**Out of scope for this pass:**
- Write operations (no on-chain transactions)
- Lending/staking protocol interactions (future work)
- Solana chain support

## Data Sources

All primary sources are free, no API key required:

| Source | Used by | Base URL |
|--------|---------|----------|
| DefiLlama API | Market + Research | `https://api.llama.fi`, `https://yields.llama.fi`, `https://stablecoins.llama.fi`, `https://feed-api.llama.fi`, `https://fe-cache.llama.fi` |
| Fear & Greed Index | Market | `https://api.alternative.me/fng/` |
| CoinGecko (free) | Market + Research | `https://api.coingecko.com/api/v3` |
| Binance public API | Market | `https://api.binance.com/api/v3`, `https://fapi.binance.com/fapi/v1` |
| GoPlus Security | Research | `https://api.gopluslabs.io/api/v1` |
| DexScreener | Research | `https://api.dexscreener.com` (direct HTTP for due diligence, separate from GOAT plugin) |
| Blockscout/Etherscan | Research | Already integrated as upstream adapters |

**Stability note:** Two market tools (`market_get_global_stats`, `market_get_exchange_rankings`) use DefiLlama's `fe-cache.llama.fi` frontend cache rather than their documented public API. These endpoints may change without notice. If they break, the tools should be updated to use alternative sources or removed.

**Progressive enhancement (optional API keys):**

| Key | Unlocks |
|-----|---------|
| `COINGECKO_API_KEY` | Higher rate limits across all CoinGecko-backed tools, sparkline data, richer market charts |
| `GOPLUS_API_KEY` | Higher rate limits on security checks (free tier is 30 req/min) |

## Type Changes

### `ToolSource` and `ToolCategory` (in `src/runtime/types.ts`)

Both types must be extended:

```typescript
// Add to ToolSource union:
| "market"
| "research"

// Add to ToolCategory union:
| "market"
| "research"
```

## Architecture

### File Structure

Following the existing flat-file pattern used by all current tool groups (orbs, lifi, evm, tokens):

```
src/tools/market/
├── index.ts              # getMarketToolDefinitions() → ToolDefinition[]
├── schemas.ts            # Re-exports from src/api/schemas/market.ts
├── defillama.ts          # DefiLlama-backed handlers
├── sentiment.ts          # Fear & Greed handler
├── coingecko.ts          # Trending, top tokens, search, categories, token history (primary)
└── binance.ts            # CEX data handlers

src/tools/research/
├── index.ts              # getResearchToolDefinitions() → ToolDefinition[]
├── schemas.ts            # Re-exports from src/api/schemas/research.ts
├── defillama.ts          # DefiLlama feed-backed handlers
├── security.ts           # GoPlus + aggregated due diligence
├── holders.ts            # Blockscout/Etherscan holder data
└── yields.ts             # DefiLlama yields handlers

src/api/schemas/
├── market.ts             # Input schemas for market tools
├── research.ts           # Input schemas for research tools
└── outputs.ts            # (extend) Output schemas for both groups

tests/tools/market/
├── handlers.test.ts
└── schemas.test.ts

tests/tools/research/
├── handlers.test.ts
└── schemas.test.ts
```

### Registration

Both groups follow the existing pattern. `getMarketToolDefinitions()` and `getResearchToolDefinitions()` are imported by `src/runtime/server.ts` and added to the tool dispatch map alongside existing groups. Both `server.ts` and `default.ts` registration points must be updated.

### HTTP Calls

All handlers use the existing `resilientFetch` from `src/utils/resilient-fetch.ts` (retry, circuit breaker, jittered backoff) and call `.json()` on the response. No new HTTP utility needed.

**TTL cache for rate-limited sources:** A simple in-memory `Map<string, { data: unknown; expiry: number }>` in each handler file (or a shared tiny helper if duplication becomes obvious) caches responses by URL. Default TTLs: 120s for CoinGecko, 60s for DefiLlama prices, 300s for DefiLlama protocol metadata, no cache for Binance real-time data. This is a flat Map, not a new abstraction.

### Tool Pattern

Every tool is read-only and uses `createToolHandler`:

```typescript
const handler = createToolHandler(
  inputSchema,
  async (input) => {
    const data = await fetchJson<ResponseType>(buildUrl(input));
    // Transform/filter response
    return { protocols: [...] };
  },
  "MARKET_PROTOCOL_TVL_ERROR"
);
```

Error codes follow the pattern `MARKET_<TOOL>_ERROR` and `RESEARCH_<TOOL>_ERROR`.

### Annotations

All tools in both groups share:
```typescript
annotations: {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
}
```

## Market Tool Group

**Prefix:** `market_`
**Category:** `"market"`

### DefiLlama-backed tools

#### `market_get_protocol_tvl`
- **Input:** `protocol` (slug, e.g., "aave")
- **Source:** `GET https://api.llama.fi/protocol/{slug}`
- **Returns:** `{ name, tvl, tvlChange1d, tvlChange7d, tvlChange30d, chainTvls: { [chain]: tvl }, category, url }`

#### `market_get_top_protocols`
- **Input:** `chain?`, `category?`, `limit?` (default 20)
- **Source:** `GET https://api.llama.fi/protocols`
- **Returns:** Array of `{ name, tvl, tvlChange1d, chain, category, slug }`, filtered and sorted by TVL descending

#### `market_get_chain_tvl`
- **Input:** `chain` (name, e.g., "Ethereum")
- **Source:** `GET https://api.llama.fi/v2/historicalChainTvl/{chain}`
- **Returns:** Array of `{ date, tvl }` data points

#### `market_get_token_price`
- **Input:** `tokens` (array of `chain:address` or CoinGecko IDs), `searchWidth?`
- **Source:** `GET https://coins.llama.fi/prices/current/{tokens}`
- **Returns:** Map of `{ price, symbol, decimals, confidence, timestamp }`

#### `market_get_token_history`
- **Input:** `token` (CoinGecko ID or `chain:address`), `period?` (1d/7d/30d/90d/1y, default 30d)
- **Routing logic:** If the `token` input contains `:` (e.g., `ethereum:0x...`), it is a `chain:address` format — use DefiLlama directly (CoinGecko doesn't accept this format). Otherwise, treat it as a CoinGecko ID and try CoinGecko first.
- **CoinGecko source:** `GET https://api.coingecko.com/api/v3/coins/{id}/market_chart?vs_currency=usd&days={days}` — returns price, market cap, and volume history in one call. More reliable and richer than DefiLlama charts.
- **DefiLlama fallback:** On any non-2xx CoinGecko response (429, 404, etc.), falls back to `GET https://coins.llama.fi/chart/{token}?start={start}&span={span}&period={resolution}`. The handler computes `start` timestamp from the user-facing `period` input and selects an appropriate resolution (hourly for ≤7d, daily for >7d). Note: this fallback requires a `chain:address` format, so if the original input was a CoinGecko ID with no resolvable address, the fallback will fail and the tool returns an error suggesting the user provide a `chain:address`.
- **Progressive:** With `COINGECKO_API_KEY`, uses pro endpoint with higher rate limits.
- **Returns:** Array of `{ timestamp, price, marketCap?, volume? }` (marketCap and volume included when from CoinGecko)

#### `market_get_gainers_losers`
- **Input:** `period?` (1h/24h/7d, default 24h), `limit?` (default 10)
- **Source:** `GET https://coins.llama.fi/percentage/{period}`
- **Returns:** `{ gainers: [...], losers: [...] }` each with `{ symbol, priceChange, price }`

#### `market_get_dex_volume`
- **Input:** `chain?`, `protocol?`
- **Source:** `GET https://api.llama.fi/overview/dexs/{chain?}`
- **Returns:** `{ totalVolume24h, totalVolume7d, protocols: [{ name, volume24h, change1d }] }`

#### `market_get_stablecoin_stats`
- **Input:** `chain?`
- **Source:** `GET https://stablecoins.llama.fi/stablecoins?includePrices=true`
- **Returns:** Array of `{ name, symbol, totalCirculating, pegDeviation, chain?, dominance }`

#### `market_get_global_stats`
- **Input:** _(none)_
- **Source:** `GET https://fe-cache.llama.fi/cg_market_data`
- **Returns:** `{ totalMarketCap, totalVolume24h, btcDominance, ethDominance, defiMarketCap, defiDominance, marketCapChange24h }`

#### `market_get_cex_fund_flows`
- **Input:** `limit?` (default 20)
- **Source:** `GET https://feed-api.llama.fi/flows`
- **Returns:** Array of `{ symbol, depositCount, withdrawCount, depositSumUsd, withdrawSumUsd, netFlow, totalUsers }`
- **Note:** `netFlow` is computed (deposits - withdrawals) — positive = inflow (bearish signal), negative = outflow (bullish signal). Description explains this.

#### `market_get_exchange_rankings`
- **Input:** `limit?` (default 20)
- **Source:** `GET https://fe-cache.llama.fi/exchanges`
- **Returns:** Array of `{ name, trustScore, trustScoreRank, volume24hBtc, country, yearEstablished }`

### Sentiment

#### `market_get_sentiment`
- **Input:** `days?` (default 7, max 30)
- **Source:** `GET https://api.alternative.me/fng/?limit={days}`
- **Returns:** `{ current: { value, classification }, history: [{ date, value, classification }] }`

### CoinGecko

CoinGecko's free API is rate-limited (10-30 req/min). Rate limit strategy:
- **TTL cache:** All CoinGecko responses cached by URL (120s default) via a simple in-memory Map per handler file.
- **Circuit breaker:** All CoinGecko calls share a single `resilientFetch` circuit breaker label (`"coingecko"`), so rate limit pressure across all CoinGecko tools is tracked as one domain. If CoinGecko returns 429, the circuit opens for all CoinGecko tools, not just the one that triggered it.
- **Backoff tuning:** CoinGecko calls use a higher `baseDelayMs` (5000ms) for retries, since the free tier can block for 60+ seconds. If a `Retry-After` header is present, respect it.
- **Binance cache policy:** Binance endpoints are real-time data — use `fetchJson` with no TTL cache (ticker, order book) or very short TTL (5s for klines).
- With `COINGECKO_API_KEY`, rate limits are significantly higher and pro endpoints are used automatically.

#### `market_get_trending`
- **Input:** `limit?` (default 10)
- **Source:** `GET https://api.coingecko.com/api/v3/search/trending`
- **Enrichment:** After fetching trending list, batch-fetches market data via a single `GET /coins/markets?ids={comma-separated-ids}` call to include mcap, volume, and 24h change. If the enrichment call fails, return the base trending data without market enrichment and include a warning in the response.
- **Progressive:** With `COINGECKO_API_KEY`, uses pro endpoint for richer data (sparklines, ATH).
- **Returns:** Array of `{ name, symbol, marketCapRank, price, priceChange24h, marketCap, volume24h }`

#### `market_get_top_tokens`
- **Input:** `category?` (e.g., "decentralized-finance-defi", "layer-2", "meme-token"), `limit?` (default 20, max 250), `order?` ("marketCap"/"volume", default "marketCap") — mapped to CoinGecko's `market_cap_desc`/`volume_desc` at the call boundary
- **Source:** `GET https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order={order}&per_page={limit}&category={category}`
- **Note:** This is the token counterpart to `market_get_top_protocols` (which ranks by TVL). Users asking "what are the top tokens?" want market cap rankings.
- **Returns:** Array of `{ name, symbol, marketCapRank, currentPrice, priceChange24h, priceChange7d, marketCap, totalVolume, circulatingSupply, ath, athDate }`

#### `market_search_token`
- **Input:** `query` (name, symbol, or keyword)
- **Source:** `GET https://api.coingecko.com/api/v3/search?query={query}`
- **Note:** More flexible than `resolve_token` (which does exact symbol matching against a registry). This searches CoinGecko's full database by name/symbol/keyword, useful for discovery ("find AI tokens", "search for dog coins").
- **Returns:** Array of `{ id, name, symbol, marketCapRank, thumb }` — the `id` can be used as input to other CoinGecko-backed tools.

#### `market_get_categories`
- **Input:** `order?` ("marketCap"/"name"/"marketCapChange24h", default "marketCap") — mapped to CoinGecko values at the call boundary. `limit?` (default 20)
- **Source:** `GET https://api.coingecko.com/api/v3/coins/categories`
- **Note:** Sector-level analysis — shows aggregate market cap and volume for categories like DeFi, L2, AI, Meme, Gaming, etc.
- **Returns:** Array of `{ name, marketCap, marketCapChange24h, volume24h, topCoins: [{ name, symbol }], updatedAt }`

### Binance Public API

#### `market_get_ticker`
- **Input:** `symbol` (e.g., "BTCUSDT")
- **Source:** `GET https://api.binance.com/api/v3/ticker/24hr?symbol={symbol}`
- **Returns:** `{ symbol, lastPrice, priceChange, priceChangePercent, highPrice, lowPrice, volume, quoteVolume, bidPrice, askPrice }`

#### `market_get_klines`
- **Input:** `symbol`, `interval` (1m/5m/15m/1h/4h/1d/1w/1M), `limit?` (default 100, max 1000)
- **Source:** `GET https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&limit={limit}`
- **Returns:** Array of `{ openTime, open, high, low, close, volume, quoteVolume, trades }`

#### `market_get_order_book`
- **Input:** `symbol`, `limit?` (5/10/20/50/100, default 20)
- **Source:** `GET https://api.binance.com/api/v3/depth?symbol={symbol}&limit={limit}`
- **Returns:** `{ bids: [{ price, quantity }], asks: [{ price, quantity }], lastUpdateId }`

#### `market_get_funding_rates`
- **Input:** `symbol` (e.g., "BTCUSDT"), `limit?` (default 10)
- **Source:** `GET https://fapi.binance.com/fapi/v1/fundingRate?symbol={symbol}&limit={limit}`
- **Returns:** Array of `{ fundingTime, fundingRate, markPrice }`

### Binance Geo-Restrictions

Binance public API endpoints return 451/403 in some jurisdictions (notably the US for futures endpoints). When `fetchJson` receives a 451 or 403 from a Binance endpoint, the handler returns a clear error: `"Binance API is not available in your region. Consider using a VPN or the DefiLlama-based market tools as alternatives."` The non-Binance market tools (DefiLlama, CoinGecko, Fear & Greed) are unaffected.

## Research Tool Group

**Prefix:** `research_`
**Category:** `"research"`

### Security & Due Diligence

#### `research_contract_security`
- **Input:** `address`, `chainId?`
- **Source:** `GET https://api.gopluslabs.io/api/v1/contract_security/{chainId}?contract_addresses={address}`
- **Returns:** `{ verified, isProxy, ownerAddress, canMint, canPause, canBlacklist, isHoneypot, maliciousFlags: [...] }`

#### `research_token_due_diligence`
- **Input:** `token` (address or symbol), `chainId?`
- **Source:** GoPlus token security + DexScreener API (direct HTTP, not via GOAT plugin) + on-chain reads
- **Flow:**
  1. Resolve symbol to address via `resolveToken()` function (from `src/tokens/resolver.ts`, direct import, not the MCP tool)
  2. GoPlus: honeypot, buy/sell tax, owner analysis
  3. DexScreener: `GET https://api.dexscreener.com/latest/dex/tokens/{address}` — liquidity depth, pair age
  4. On-chain: total supply via `publicClient.readContract()` (ERC-20 `totalSupply`)
- **Partial failure handling:** Each source is called independently. If one source fails, the handler still returns data from the other sources with a `warnings` array noting which source was unavailable. Only if ALL sources fail does the handler return an error.
- **Returns:** `{ isHoneypot, buyTax, sellTax, liquidityUsd, lpLocked, holderCount, topHolderPercent, createdAt, riskLevel, warnings: [...], sources: [...] }`
- **Note:** `sources` lists which data sources were successfully queried (e.g., `["goplus", "dexscreener"]`), so the caller knows the confidence level of the result.

#### `research_token_holders`
- **Input:** `token`, `chainId?`, `limit?` (default 10)
- **Source:** Blockscout adapter (where available), falls back to GoPlus holder data
- **Progressive:** `ETHERSCAN_API_KEY` enables richer holder lists
- **Returns:** Array of `{ address, balance, percentOfSupply, label? }`

### DefiLlama Yields

#### `research_yield_opportunities`
- **Input:** `token?`, `chain?`, `protocol?`, `minTvl?` (default $100k), `limit?` (default 20)
- **Source:** `GET https://yields.llama.fi/pools`
- **Returns:** Array of `{ pool, project, chain, symbol, tvlUsd, apy, apyBase, apyReward, ilRisk, rewardTokens }`

#### `research_compare_yields`
- **Input:** `token` (symbol), `chainId?`, `limit?` (default 10)
- **Source:** `GET https://yields.llama.fi/pools` (filtered by token)
- **Returns:** Array sorted by APY descending: `{ project, chain, apy, tvlUsd, apyBase, apyReward }`

#### `research_protocol_info`
- **Input:** `protocol` (slug)
- **Sources:**
  1. `GET https://api.llama.fi/protocol/{slug}` — TVL, chain breakdown, category, raises
  2. `GET https://api.coingecko.com/api/v3/coins/{id}` — description, links, categories, developer activity, community stats (if the protocol has a CoinGecko-listed token). The handler maps the DefiLlama slug to a CoinGecko ID via the protocol's `gecko_id` field in the DefiLlama response.
- **Partial failure handling:** Same pattern as `research_token_due_diligence` — if CoinGecko fails, DefiLlama data is still returned with a `warnings` note. If the DefiLlama response does not include a `gecko_id` field (common for protocols without listed tokens), skip CoinGecko enrichment silently and return DefiLlama-only data without a warning (this is expected, not an error).
- **Returns:** `{ name, description, category, chains, tvl, audits, url, raises, governanceLinks, twitter, devActivity?, communityScore?, categories?, sentimentUp?, sentimentDown?, sources: [...] }`

### DefiLlama Feed Tools

#### `research_token_unlocks`
- **Input:** `limit?` (default 20)
- **Source:** `GET https://feed-api.llama.fi/unlocks`
- **Returns:** Array of `{ name, symbol, nextEvent, toUnlockUsd, price, priceImpactPercent }`
- **Note:** `nextEvent` is converted from Unix timestamp to ISO string. `priceImpactPercent` is derived from `delta_rel`.

#### `research_hack_history`
- **Input:** `protocol?`, `limit?` (default 20)
- **Source:** `GET https://feed-api.llama.fi/hacks`
- **Returns:** Array of `{ name, date, amountUsd, technique, sourceUrl }`

#### `research_fund_raises`
- **Input:** `limit?` (default 20)
- **Source:** `GET https://feed-api.llama.fi/raises`
- **Returns:** Array of `{ name, date, amountUsd, round, leadInvestor, sourceUrl }`

#### `research_whale_transfers`
- **Input:** `symbol?`, `limit?` (default 20)
- **Source:** `GET https://feed-api.llama.fi/transfers`
- **Returns:** Array of `{ txHash, blockTime, symbol, value, valueUsd, fromEntity, toEntity }`
- **Note:** Entities are labeled where known (e.g., "coinbase", "binance").

#### `research_governance`
- **Input:** `protocol?`, `status?` ("active"/"closed"), `limit?` (default 20)
- **Source:** `GET https://feed-api.llama.fi/governance`
- **Returns:** Array of `{ orgName, title, status, startDate, endDate, link, quorum, choices, votes, voterCount }`

#### `research_news`
- **Input:** `limit?` (default 20)
- **Source:** `GET https://feed-api.llama.fi/news`
- **Returns:** Array of `{ title, summary, link, publishedAt, topic?, sentiment? }`

#### `research_airdrops`
- **Input:** `limit?` (default 20)
- **Source:** `GET https://feed-api.llama.fi/airdrops`
- **Returns:** Array of `{ name, symbol, claimPage, endsAt?, price?, priceChange? }`

## Schema Design

### Shared Schemas

Reuse existing `chainIdOptionalSchema` from `src/api/schemas/common.ts` where applicable. New shared pieces:

```typescript
// src/api/schemas/market.ts
export const limitSchema = z.number()
  .int().positive().optional()
  .describe("Maximum number of results to return");
// Note: no global max — individual tools override with tool-specific maxes
// (e.g., market_get_klines uses .max(1000) matching Binance API limit)

export const protocolSlugSchema = z.string()
  .describe("Protocol slug as used by DefiLlama (e.g., 'aave', 'uniswap')");

export const tradingPairSchema = z.string()
  .describe("Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT')");

// Placed in common.ts since it is shared across market and research tool groups
// src/api/schemas/common.ts
export const coingeckoIdSchema = z.string()
  .describe("CoinGecko coin ID (e.g., 'bitcoin', 'ethereum', 'uniswap'). Use market_search_token to find IDs.");
```

### CoinGecko URL Helper

A shared `coingeckoUrl(path)` helper in `src/tools/market/coingecko.ts` builds the correct base URL depending on whether `COINGECKO_API_KEY` is set:

```typescript
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
```

All CoinGecko handlers use this helper, so progressive enhancement is transparent.

### Naming Convention

Response fields use camelCase, matching existing codebase convention. DefiLlama snake_case fields (e.g., `to_unlock_usd`) are mapped to camelCase (`toUnlockUsd`) in the handler.

### Output Schemas

Output Zod schemas will be defined in `src/api/schemas/outputs.ts` during implementation, following the existing pattern (e.g., `swapQuoteResultSchema`). Each output schema will have `.describe()` on every field, enforced by the existing schema-quality test. Output schemas are designed during implementation because the exact response shapes depend on runtime testing against the live APIs.

### All Schema Fields Have `.describe()`

Enforced by the existing `tests/tools/schema-quality.test.ts` which auto-discovers all schema files. The new `src/api/schemas/market.ts`, `src/api/schemas/research.ts`, and `src/tools/*/schemas.ts` files will all be auto-discovered by the existing glob patterns.

## Error Handling

All tools use `createToolHandler` which wraps validation + try-catch + response formatting. Each tool gets a tool-specific error code passed to `createToolHandler`, following the pattern `MARKET_<TOOL_NAME>_ERROR` / `RESEARCH_<TOOL_NAME>_ERROR` (e.g., `MARKET_PROTOCOL_TVL_ERROR`, `RESEARCH_CONTRACT_SECURITY_ERROR`). This matches the existing codebase pattern and is more debuggable than shared codes.

Rate limit errors from upstream APIs return a clear message suggesting the user wait or provide an API key.

## Testing Strategy

- Mock all HTTP calls (no real API hits in tests)
- Test both success and error paths for every handler
- Test input validation (invalid slugs, missing required fields, out-of-range limits)
- Test response transformation (snake_case → camelCase, timestamp → ISO, computed fields)
- Schema quality auto-enforced by existing test
- Integration test file that verifies both tool groups register correctly in the MCP server

## Progressive Enhancement

Detection pattern (consistent with existing GOAT tiering):

```typescript
const hasCoingeckoKey = () => !!process.env.COINGECKO_API_KEY;
const hasGoplusKey = () => !!process.env.GOPLUS_API_KEY;
```

When a key is present:
- CoinGecko: use `https://pro-api.coingecko.com/api/v3` with `x-cg-pro-api-key` header
- GoPlus: pass key in header for higher rate limits

When absent: use free endpoints (fully functional, just rate-limited).
