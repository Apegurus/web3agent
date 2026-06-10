# Native CCXT Tools — Design Spec

**Date:** 2026-04-10
**Status:** Approved

## Goal

Add first-party `ccxt` support to `web3agent` as a native tool group that gives agents broad exchange compatibility through a stable MCP surface, while deprecating the current Binance-specific market tools.

The intent is not to mount a separate MCP server. The new capability should live inside the existing `web3agent` runtime, follow its tool registration and policy model, and expose enough of CCXT to feel like "CCXT as tools" rather than "four Binance helpers plus a wrapper."

## Why This Exists

`web3agent` currently exposes four exchange-facing market tools in [src/tools/market/index.ts](/Users/ignacioblitzer/Develop/defizoo/web3agent/web3agent-cli/src/tools/market/index.ts), and all four are Binance-specific. That creates three product problems:

- Exchange compatibility is narrow.
- The current market API shape hard-codes Binance into the public contract.
- There is no native path for private exchange capabilities like balances, orders, positions, transfers, or withdrawals.

Third-party CCXT MCP servers exist, but they are standalone products rather than drop-in in-process modules. The gap in `web3agent` is a native exchange tool layer that can be shipped, tested, documented, and versioned as part of this repo.

## Primary Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Integration model | Native `web3agent` tool group | Avoids running a second MCP server and fits the current runtime architecture. |
| Parity strategy | Generic CCXT invocation tools plus discovery tools | Best path to broad CCXT coverage without exploding the tool catalog. |
| Tool count | Small, stable tool family | Better MCP ergonomics than generating hundreds of per-method tools. |
| Backward compatibility | Keep Binance tools as deprecated shims for one release window | Preserves existing callers while steering new usage to `ccxt_*`. |
| Auth configuration | Named account config file via `CCXT_CONFIG_PATH` | Scales better than environment-variable-per-account credentials. |
| Write safety | All authenticated write calls go through one financial-risk tool | Aligns with current policy and confirmation architecture. |

## Scope

**Must-have in this pass:**

- Native `ccxt` dependency in this package
- Public exchange access across CCXT-supported exchanges
- Authenticated exchange accounts through config
- Public method invocation
- Authenticated read invocation
- Authenticated write invocation
- Exchange/account discovery tools
- Binance tool deprecation with runtime shims backed by CCXT
- SDK exports for the new CCXT tool family
- Tests for registration, config parsing, invocation routing, safety classification, and Binance compatibility shims

**Out of scope for this pass:**

- Per-exchange generated MCP tools
- Human-friendly strategy or analytics helpers on top of CCXT
- A second standalone MCP server
- Non-CCXT exchange SDKs
- Solana- or non-exchange-specific trading abstractions

## Tool Surface

Add a new tool group with prefix `ccxt_` and category `"market"` or `"orders"` depending on tool purpose.

### `ccxt_list_exchanges`

Read-only discovery tool.

**Input:** optional filters such as `configuredOnly?`, `hasAuth?`, `marketType?`

**Returns:** a compact list of exchanges with normalized metadata:

- `exchangeId`
- `name`
- `countries?`
- `urls?`
- `configuredAccounts`
- `supportsPublic`
- `supportsPrivate`
- `timeframes?`

This is the first tool an agent can call to discover the available universe.

### `ccxt_describe_exchange`

Read-only capability tool.

**Input:**

- `exchange` or `account`
- `loadMarkets?` default `true`
- `reloadMarkets?` default `false`

**Returns:**

- `exchangeId`
- `name`
- `has`
- `timeframes`
- `symbols?`
- `marketTypes`
- `configuredAccounts`
- `requiresAuthFor`
- `supportedInvocationModes`

This tool is the main "capability contract" for agents. It should expose enough metadata to decide whether a given exchange can satisfy a request before calling it.

### `ccxt_list_accounts`

Read-only config inspection tool.

**Input:** none

**Returns:** named configured accounts with redacted metadata only:

- `name`
- `exchangeId`
- `defaultType?`
- `sandbox`
- `hasPassword`
- `hasUid`
- `hasWalletAddress`

Secrets are never returned.

### `ccxt_public_call`

Read-only generic public invocation tool for unified public methods and public implicit methods.

**Input:**

- `exchange`
- `method`
- `args?` as a JSON array
- `params?` as a JSON object
- `marketType?`
- `sandbox?`
- `loadMarkets?` default `true`
- `reloadMarkets?` default `false`

**Returns:**

- `exchangeId`
- `method`
- `classification: "public"`
- `result`

This is the main compatibility tool for public CCXT parity.

### `ccxt_private_read`

Authenticated read-only invocation tool for private account methods.

**Input:**

- `account`
- `method`
- `args?`
- `params?`
- `loadMarkets?` default `true`
- `reloadMarkets?` default `false`

**Returns:**

- `account`
- `exchangeId`
- `method`
- `classification: "private_read"`
- `result`

Examples include `fetchBalance`, `fetchOrders`, `fetchMyTrades`, `fetchOpenOrders`, `fetchPositions`, and private implicit GET-style endpoints.

### `ccxt_private_write`

Authenticated write invocation tool for financial or mutating CCXT operations.

**Input:**

- `account`
- `method`
- `args?`
- `params?`
- `loadMarkets?` default `true`
- `reloadMarkets?` default `false`

**Returns:** the exchange response plus the repo's existing policy and confirmation envelope behavior.

This tool is the write gateway for methods like:

- `createOrder`
- `cancelOrder`
- `cancelAllOrders`
- `setLeverage`
- `setMarginMode`
- `transfer`
- `withdraw`
- private implicit POST/PUT/PATCH/DELETE-style endpoints

`ccxt_private_write` is always registered with `riskLevel: "financial"` so it stays inside the existing treasury-policy and confirmation flow.

## Why A Small Generic Tool Family Wins

This repo has an explicit tool registry in [src/runtime/managed-runtime.ts](/Users/ignacioblitzer/Develop/defizoo/web3agent/web3agent-cli/src/runtime/managed-runtime.ts), and MCP hosts handle short tool lists much better than giant generated catalogs. A generic invocation surface gives the best tradeoff:

- broad CCXT compatibility
- stable MCP interface
- minimal maintenance burden
- room to add curated helper tools later if usage patterns justify them

## Architecture

### File Structure

```
src/api/
├── ccxt.ts                  # SDK functions for the new ccxt_* tools
└── types.ts                 # extend with CCXT input/output types

src/api/schemas/
├── ccxt.ts                  # canonical input schemas
└── outputs.ts               # extend with CCXT output schemas as needed

src/ccxt/
├── config.ts                # config-file parsing and validation
├── accounts.ts              # named account registry helpers
├── factory.ts               # exchange instance creation and caching
├── capabilities.ts          # normalize has/timeframes/market support
├── classification.ts        # method safety classification
├── invoke.ts                # dispatch and result normalization
└── types.ts                 # internal CCXT types

src/tools/ccxt/
├── index.ts                 # getCcxtToolDefinitions()
└── schemas.ts               # re-export canonical schemas
```

### Runtime Integration

Extend [src/runtime/managed-runtime.ts](/Users/ignacioblitzer/Develop/defizoo/web3agent/web3agent-cli/src/runtime/managed-runtime.ts) with a new `ccxtTools` collection and register it alongside the existing tool groups.

Required type changes:

- add `"ccxt"` to `ToolSource` in [src/runtime/types.ts](/Users/ignacioblitzer/Develop/defizoo/web3agent/web3agent-cli/src/runtime/types.ts)
- keep categories aligned with actual use:
  - discovery and public read tools under `"market"`
  - authenticated write tool under `"orders"`
- extend runtime health with a `ccxt` backend status in:
  - [src/runtime/types.ts](/Users/ignacioblitzer/Develop/defizoo/web3agent/web3agent-cli/src/runtime/types.ts)
  - [src/types/health.ts](/Users/ignacioblitzer/Develop/defizoo/web3agent/web3agent-cli/src/types/health.ts)

The `ccxt` backend health should report:

- whether the dependency is available
- whether config parsing succeeded
- number of configured accounts
- number of registered CCXT tools

### SDK Layer

Add SDK functions in `src/api/ccxt.ts` following the same runtime-invocation model as the existing market and research APIs:

- `listCcxtExchanges()`
- `describeCcxtExchange()`
- `listCcxtAccounts()`
- `ccxtPublicCall()`
- `ccxtPrivateRead()`
- `ccxtPrivateWrite()`

Export them through the package barrel so consumers can call the CCXT tools programmatically.

## Config Model

Add `CCXT_CONFIG_PATH` to [src/config/env.ts](/Users/ignacioblitzer/Develop/defizoo/web3agent/web3agent-cli/src/config/env.ts) and [src/types/config.ts](/Users/ignacioblitzer/Develop/defizoo/web3agent/web3agent-cli/src/types/config.ts).

The file should be JSON with a root `accounts` array:

```json
{
  "accounts": [
    {
      "name": "bybit_main",
      "exchangeId": "bybit",
      "apiKey": "YOUR_API_KEY",
      "secret": "YOUR_SECRET",
      "password": "OPTIONAL",
      "uid": "OPTIONAL",
      "privateKey": "OPTIONAL",
      "walletAddress": "OPTIONAL",
      "defaultType": "spot",
      "sandbox": false,
      "enableRateLimit": true,
      "timeout": 15000,
      "headers": {},
      "options": {}
    }
  ]
}
```

Validation rules:

- `name` must be unique
- `exchangeId` must exist in `ccxt.exchanges`
- auth fields are validated structurally, not by live connectivity at startup
- invalid accounts are skipped with explicit stderr warnings
- one invalid account must not prevent the rest from loading

Secrets remain file-backed and are never echoed by tools.

## Exchange Instance Model

The implementation should mirror the existing cached-runtime style seen in [src/goat/provider.ts](/Users/ignacioblitzer/Develop/defizoo/web3agent/web3agent-cli/src/goat/provider.ts), but for CCXT exchange instances.

### Public instances

Cache key:

`exchangeId + marketType + sandbox`

Behavior:

- instantiate lazily
- optionally set sandbox mode
- call `loadMarkets()` lazily on first invocation unless disabled
- cache instances across calls

### Private instances

Cache key:

`account name`

Behavior:

- instantiate lazily from validated account config
- preserve per-account options and auth material
- optionally reuse public market metadata when possible
- support `reloadMarkets` when requested

### Market sharing

CCXT supports sharing loaded market metadata between instances. Where practical, private instances for the same exchange should reuse already-loaded market data from the public cache to avoid redundant network calls.

## Invocation Classification

This is the core safety boundary.

Because the repo's policy model is tool-level, not method-level, each generic invocation tool must validate that the requested method belongs to its allowed class before executing it.

### Public classification

Allowed in `ccxt_public_call`:

- unified public read methods like `fetchTicker`, `fetchTickers`, `fetchOrderBook`, `fetchOHLCV`, `fetchTrades`, `fetchMarkets`, `fetchCurrencies`, `loadMarkets`
- public implicit methods such as `publicGet...`

Denied in `ccxt_public_call`:

- any private method
- any mutating unified method
- any method not present on the exchange instance

### Private read classification

Allowed in `ccxt_private_read`:

- unified authenticated read methods such as `fetchBalance`, `fetchOrders`, `fetchOpenOrders`, `fetchClosedOrders`, `fetchMyTrades`, `fetchOrder`, `fetchPositions`, `fetchLeverage`, `fetchFundingRateHistory`, `fetchLedger`, `fetchDeposits`, `fetchWithdrawals`
- private implicit GET-like methods such as `privateGet...`

Denied in `ccxt_private_read`:

- mutating unified methods
- private implicit methods that are not clearly read-only

### Private write classification

Allowed in `ccxt_private_write`:

- unified mutating methods such as `createOrder`, `cancelOrder`, `cancelAllOrders`, `editOrder`, `setLeverage`, `setMarginMode`, `transfer`, `withdraw`
- private implicit non-GET methods such as `privatePost...`, `privatePut...`, `privatePatch...`, `privateDelete...`

Default-to-safe rule:

- if a method cannot be confidently classified, deny it with a structured error rather than guessing

This classification logic belongs in a dedicated module so it can be unit-tested heavily and evolved without touching the tool layer.

## Input Schema Strategy

The generic call tools cannot model every CCXT method with bespoke schemas, so the input contract should stay small and predictable:

- scalar routing fields are strongly typed with Zod
- `args` is a JSON array
- `params` is a JSON object

This keeps the MCP contract stable while still allowing broad CCXT method coverage.

The schema descriptions must clearly explain:

- that `args` maps positionally to the target CCXT method
- that `params` maps to the final `params` argument when applicable
- that callers should prefer `ccxt_describe_exchange` before invoking niche methods

## Result Normalization

The generic tools should return a thin structured envelope:

```json
{
  "exchangeId": "bybit",
  "account": "bybit_main",
  "method": "fetchBalance",
  "classification": "private_read",
  "result": {}
}
```

Do not over-normalize CCXT results globally. The point of these tools is compatibility, so the default behavior should preserve CCXT's response shape as much as possible.

## Binance Deprecation and Compatibility

Keep the existing Binance tool names for one release window:

- `market_get_ticker`
- `market_get_klines`
- `market_get_order_book`
- `market_get_funding_rates`

Change their descriptions to include a deprecation notice and steer callers to the `ccxt_*` tools.

Implementation behavior:

- `market_get_ticker` becomes a thin shim to `ccxt_public_call(exchange="binance", method="fetchTicker", args=[symbol])`
- `market_get_klines` becomes a thin shim to `ccxt_public_call(exchange="binance", method="fetchOHLCV", args=[symbol, interval, undefined, limit])`
- `market_get_order_book` becomes a thin shim to `ccxt_public_call(exchange="binance", method="fetchOrderBook", args=[symbol, limit])`
- `market_get_funding_rates` becomes a thin shim backed by Binance CCXT funding-rate capabilities, preferring unified history methods when present and falling back to Binance implicit endpoints when needed

Each shim should preserve the current output schema so existing callers do not break during the deprecation window.

## Error Handling

Use the repo's existing `createToolHandler` and formatted error patterns.

New error cases should include:

- invalid `exchange`
- invalid `account`
- unsupported `method`
- method classified for the wrong tool
- missing auth for private calls
- exchange initialization failures
- market-load failures

Error payloads should help the caller recover, for example by suggesting `ccxt_describe_exchange` after a capability mismatch.

## Documentation

Update:

- `README.md`
- `CHANGELOG.md`
- any market-tool guide that references Binance-only exchange support

Docs should position `ccxt_*` as the preferred exchange API and the Binance-specific tools as deprecated compatibility helpers.

## Testing Strategy

### Unit tests

- config parsing for valid and invalid account files
- instance caching behavior
- market-sharing behavior where implemented
- method classification rules
- rejection of misrouted method calls
- result envelope normalization

### Tool tests

- registration count and metadata for the new CCXT tools
- invocation success paths with mocked CCXT exchanges
- auth failure paths
- deprecated Binance shims still matching existing schemas

### SDK tests

- `src/api/ccxt.ts` invokers call the correct tool names with the correct payloads

### Runtime tests

- runtime health includes `ccxt`
- tool registry includes the new CCXT tools
- config failures degrade only the CCXT backend rather than the whole runtime

## Rollout Order

1. Add schemas, types, and config parsing.
2. Add CCXT instance factory and method classification.
3. Add generic tool definitions and runtime registration.
4. Add SDK exports.
5. Convert Binance tools into deprecated CCXT-backed shims.
6. Update docs and changelog.
7. Run targeted tests, then full verification.

## Success Criteria

- `web3agent` exposes native `ccxt_*` tools without running a second MCP server
- public exchange requests work across multiple CCXT exchanges
- private authenticated reads and writes are possible through named accounts
- write calls stay inside the existing financial policy and confirmation system
- Binance-specific market tools still work but are explicitly deprecated
- the tool surface is small enough to remain usable in MCP hosts
