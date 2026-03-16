# Market Data & Research Tools — Design Spec

Two new native tool groups that give AI agents and human users market intelligence and on-chain research capabilities through the existing MCP server.

## Motivation

web3agent currently covers swaps, bridging, wallet management, and on-chain reads, but has no tools for market intelligence, protocol research, or due diligence. Agents and users need this context to make informed decisions (e.g., checking a token's security before swapping, comparing yields before deploying capital, understanding market sentiment).

Ottie (a competing agent framework) covers this space via Markdown-prompt skills that teach the LLM to curl public APIs. Our approach is to build validated, typed MCP tools with Zod schemas, consistent with the rest of the codebase.

## Scope

**Must-have (30 tools):**
- Market tool group (17 tools) — prices, TVL, sentiment, trending, CEX data
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
| CoinGecko (free) | Market | `https://api.coingecko.com/api/v3` |
| Binance public API | Market | `https://api.binance.com/api/v3`, `https://fapi.binance.com/fapi/v1` |
| GoPlus Security | Research | `https://api.gopluslabs.io/api/v1` |
| DexScreener | Research | `https://api.dexscreener.com` (direct HTTP for due diligence, separate from GOAT plugin) |
| Blockscout/Etherscan | Research | Already integrated as upstream adapters |

**Stability note:** Two market tools (`market_get_global_stats`, `market_get_exchange_rankings`) use DefiLlama's `fe-cache.llama.fi` frontend cache rather than their documented public API. These endpoints may change without notice. If they break, the tools should be updated to use alternative sources or removed.

**Progressive enhancement (optional API keys):**

| Key | Unlocks |
|-----|---------|
| `COINGECKO_API_KEY` | Higher rate limits on trending/gainers, sparkline data |
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
├── coingecko.ts          # Trending handler
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

src/utils/
└── http.ts               # NEW — shared fetchJson utility

tests/tools/market/
├── handlers.test.ts
└── schemas.test.ts

tests/tools/research/
├── handlers.test.ts
└── schemas.test.ts
```

### Registration

Both groups follow the existing pattern. `getMarketToolDefinitions()` and `getResearchToolDefinitions()` are imported by `src/runtime/server.ts` and added to the tool dispatch map alongside existing groups. Both `server.ts` and `default.ts` registration points must be updated.

### Shared HTTP Client (NEW: `src/utils/http.ts`)

A new `fetchJson<T>(url, options?)` utility handles:
- JSON parsing with error handling
- Timeout (configurable, default 10s)
- User-Agent header
- Logging failures to stderr with `[http]` prefix
- Simple in-memory TTL cache (configurable per call, default off) to reduce rate limit pressure on slowly-changing data (e.g., 60s for prices, 300s for TVL/protocol metadata)

All handlers call `fetchJson` rather than raw `fetch`. This avoids duplicating error handling across 30 handlers. After implementation, add to the "Single Source of Truth" table in CLAUDE.md.

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
- **Input:** `token` (`chain:address`), `period?` (1d/7d/30d/90d/1y, default 30d)
- **Source:** `GET https://coins.llama.fi/chart/{token}?start={start}&span={span}&period={resolution}`
- **Note:** DefiLlama's chart endpoint uses `start`/`span`/`period` (resolution) params, not a single period shorthand. The handler computes `start` timestamp from the user-facing `period` input (e.g., "30d" → now minus 30 days), and selects an appropriate resolution (hourly for ≤7d, daily for >7d).
- **Returns:** Array of `{ timestamp, price }` data points

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

#### `market_get_trending`
- **Input:** `limit?` (default 10)
- **Source:** `GET https://api.coingecko.com/api/v3/search/trending`
- **Progressive:** If `COINGECKO_API_KEY` set, uses pro endpoint for richer data
- **Returns:** Array of `{ name, symbol, marketCapRank, price, priceChange24h, marketCap }`

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
- **Source:** `GET https://api.llama.fi/protocol/{slug}` + DefiLlama metadata
- **Returns:** `{ name, description, category, chains, tvl, audits, url, raises, governanceLinks, twitter }`

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
```

### Naming Convention

Response fields use camelCase, matching existing codebase convention. DefiLlama snake_case fields (e.g., `to_unlock_usd`) are mapped to camelCase (`toUnlockUsd`) in the handler.

### Output Schemas

Output Zod schemas will be defined in `src/api/schemas/outputs.ts` during implementation, following the existing pattern (e.g., `swapQuoteResultSchema`). Each output schema will have `.describe()` on every field, enforced by the existing schema-quality test. Output schemas are designed during implementation because the exact response shapes depend on runtime testing against the live APIs.

### All Schema Fields Have `.describe()`

Enforced by the existing `tests/tools/schema-quality.test.ts` which auto-discovers all schema files. The new `src/api/schemas/market.ts`, `src/api/schemas/research.ts`, and `src/tools/*/schemas.ts` files will all be auto-discovered by the existing glob patterns.

## Error Handling

All tools use `createToolHandler` which wraps validation + try-catch + response formatting. Specific error codes:

- `MARKET_FETCH_ERROR` — HTTP failure reaching data source
- `MARKET_PARSE_ERROR` — unexpected response shape
- `MARKET_NOT_FOUND` — protocol/token slug not found
- `RESEARCH_FETCH_ERROR` — HTTP failure
- `RESEARCH_NOT_FOUND` — contract/token not found
- `RESEARCH_CHAIN_UNSUPPORTED` — GoPlus doesn't support the requested chain

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
