# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Native CCXT tools** across the runtime, MCP server, CLI, and root SDK:
  - `ccxt_list_exchanges`
  - `ccxt_describe_exchange`
  - `ccxt_list_accounts`
  - `ccxt_public_call`
  - `ccxt_private_read`
  - `ccxt_private_write`
- **CCXT account configuration** via `CCXT_CONFIG_PATH`, allowing named authenticated exchange accounts without adding one environment variable per credential.

### Security

- High-risk CCXT methods (`withdraw`, `transfer`, and implicit variants like `sapiPrivatePostAssetTransfer`) are now detected via classification + pattern matching instead of exact name lookup.
- CCXT private write executor re-validates params via Zod before execution, closing a gap in the confirmation queue path.
- World-readable CCXT config files now block high-risk methods at both handler and executor layers (not just warn).
- `ccxt_describe_exchange` and `ccxt_list_exchanges` only advertise private capabilities when accounts have complete credentials (`apiKey` + `secret` or `privateKey`).

### Changed

- **BREAKING:** Policy engine now denies financial tools with unestimable USD value (`UNESTIMABLE_FINANCIAL_WRITE`) rather than allowing them as `GAS_ONLY`. The USD estimator has been extended to cover CCXT `createOrder`/`editOrder` params, but tools with truly unparseable args (e.g., `evm_write_contract` with opaque calldata) will be denied unless classified with `riskLevel: "destructive"`.
- Spot API default endpoint changed from `agents-sink-dev.orbs.network` to `agents-sink.orbs.network`. Set `SPOT_API_URL` env var to override.
- **BREAKING:** `ExplorerTxReceipt.status` enum widened from `"success" | "failed"` to `"success" | "failed" | "pending"`. Downstream SDK consumers with exhaustive type guards or switch statements must handle the new `"pending"` variant.
- **BREAKING:** `CcxtAccountSummary` no longer includes `hasPassword`, `hasUid`, or `hasWalletAddress` fields. These credential-presence booleans leaked configuration metadata to MCP consumers.
- **Binance market helpers are now deprecated compatibility shims** backed by the native CCXT layer:
  - `market_get_ticker`
  - `market_get_klines`
  - `market_get_order_book`
  - `market_get_funding_rates`

## [0.4.0] - 2026-03-23

### Breaking

- **Slippage field names disambiguated** across Orbs schemas:
  - Liquidity Hub (percentage): `slippage` → `slippagePct` (0.5 = 0.5%)
  - Spot orders (basis points): `slippage` → `slippageBps` (500 = 5%)
  - Prevents agents from confusing units — the old `slippage` field is removed

### Added

- **Unified Block Explorer** — 36 native tools replacing the RemoteMcpAdapter pattern. Multi-source router selects Blockscout or Etherscan per chain, with automatic fallback.
  - Accounts: `explorer_address_info`, `explorer_address_balance`, `explorer_address_tokens`, `explorer_address_nfts`, `explorer_address_transactions`
  - Blocks: `explorer_block_info`, `explorer_block_transactions`, `explorer_latest_block`, `explorer_block_count`
  - Contracts: `explorer_contract_abi`, `explorer_contract_source`, `explorer_is_verified`, `explorer_contract_creation`
  - Tokens: `explorer_token_info`, `explorer_token_holders`, `explorer_token_transfers`, `explorer_token_supply`, `explorer_token_balance`, `explorer_nft_metadata`, `explorer_nft_owner`
  - Transactions: `explorer_transaction_info`, `explorer_transaction_receipt`, `explorer_internal_transactions`, `explorer_transaction_logs`, `explorer_transaction_status`
  - Network: `explorer_gas_price`, `explorer_gas_oracle`, `explorer_chain_stats`, `explorer_latest_transactions`, `explorer_pending_transactions`, `explorer_search`, `explorer_supported_chains`, `explorer_health`, `explorer_ens_lookup`
  - Events: `explorer_contract_events`, `explorer_address_events`
- **Market Data Tools** — 20 tools for real-time and historical market data:
  - Price: `market_price`, `market_price_history`, `market_ohlcv`, `market_multi_price`
  - Discovery: `market_trending`, `market_top_by_market_cap`, `market_recently_listed`, `market_gainers_losers`
  - Token details: `market_token_info`, `market_token_markets`, `market_search`
  - DEX: `market_dex_pairs`, `market_dex_trades`, `market_pool_info`, `market_pool_ohlcv`
  - Categories & exchanges: `market_categories`, `market_exchanges`, `market_exchange_volume`, `market_global_stats`, `market_dominance`
- **Research Tools** — 13 tools for DeFi analytics and security research:
  - DeFi: `research_protocol_tvl`, `research_chain_tvl`, `research_yields`, `research_yield_history`, `research_stablecoin_info`, `research_stablecoin_history`
  - Security: `research_hack_history`, `research_hack_detail`
  - Protocol: `research_protocol_info`, `research_protocol_fees`, `research_dex_volume`
  - On-chain: `research_gas_history`, `research_bridge_volume`
- **SDK API layer** for all new tool groups: `src/api/explorer.ts`, `src/api/market.ts`, `src/api/research.ts` with full programmatic access.
- **TTL cache utility** (`src/tools/shared/cache.ts`) — shared caching for market and research data with configurable TTL.
- **1,373 tests** (up from 794) across 108 test files.

### Fixed

- **Circuit breaker never opened on persistent HTTP 5xx** — `resilientFetch` now increments failure count on non-2xx responses instead of resetting. Prevents infinite retries against dead upstreams.
- **`extractEstimatedUsd` bypassed spend limits for unrecognized tokens** — when token fields were present but decimals were unknown, returned `null` (gas-only) instead of `0` (estimation failed). Financial tools with unknown tokens now correctly require policy approval.
- **Atomic write left `.tmp` files on failure** — `atomicWriteJson` now cleans up temp files when `writeFile`, `sync`, or `rename` throws.
- **TWAP integer division** — `prepareTwapIntent` now validates that `fromAmount` is evenly divisible by `chunks` and that per-chunk amount is non-zero, instead of silently truncating.
- **`submitUrl` validation bypass** — replaced `startsWith()` string check with proper `URL.origin` comparison to prevent subdomain spoofing attacks.
- **Confirm-time policy gap** — `transactionConfirm` now denies financial operations when USD estimation fails (matching the `invokeTool` path).
- **Slippage unit confusion** — renamed ambiguous `slippage` field to `slippagePct` (Liquidity Hub) and `slippageBps` (Spot orders).

### Changed

- **Schema auto-discovery** uses `import.meta.glob` instead of manual `findSchemaFiles` — cross-platform compatible, no Windows path separator issues.
- **Explorer architecture** — Blockscout and Etherscan adapters no longer use RemoteMcpAdapter. Each has a typed client in `src/api/explorer/` with a router that selects the best source per chain.

## [0.3.0] - 2026-03-17

### Breaking

- **Field names normalized to `from/to` convention** across all schemas:
  - Orbs: `inAmount` → `fromAmount`, `srcToken` → `fromToken`, `dstToken` → `toToken`, `srcAmount` → `fromAmount`, `dstMinAmount` → `toMinAmount`
  - LiFi: `fromTokenAddress` → `fromToken`, `toTokenAddress` → `toToken`
- **Orbs slippage fields made explicit** — swap quote flows use `slippagePct`, while Spot/TWAP/limit order flows use `slippageBps`
- **Spot Protocol replaces old TWAP/Limit SDK** — `prepareTwapIntent` and `prepareLimitIntent` now return `SpotOrderIntent` instead of `TwapIntent`/`LimitIntent`. Old types are deprecated and will be removed in v0.5.0. See migration notes below.
- **`submitSignedTwapOrder` signature changed** — now an adapter wrapper accepting the old `{ order, signature: { v, r, s } }` shape but submitting via the new Spot API. Deprecated in favor of `submitSignedOrder`.
- **EVM tool inputSchemas now generated from Zod** — all 24 EVM tools migrated from manual JSON

### Added

- **Spot Protocol integration** — unified order system replacing old TWAP/Limit SDK. Pure-TypeScript implementation with EIP-712 typed data signing, no external SDK dependency for order preparation.
  - `orbs_place_order` — unified order tool (market, chunked, limit)
  - `orbs_prepare_order_intent` — browser-wallet intent preparation
  - `orbs_submit_signed_order` — submit externally signed orders
  - `orbs_query_orders` — query orders by swapper or hash
  - `orbs_cancel_order` — on-chain order cancellation via RePermit
  - Legacy `orbs_place_twap` and `orbs_place_limit` wrappers preserved for backwards compatibility
- **Treasury Policy Engine** — per-transaction, hourly, and daily USD spend limits with minimum reserve enforcement. Configurable via `POLICY_*` env vars or `web3agent policy` CLI subcommand.
  - Deny-by-default for financial tools when USD estimation fails
  - Gas-only tools (cancels, approvals) allowed with warning
  - Balance cache with automatic refresh on wallet change
  - Rolling-window spend tracker with disk persistence
- **Input sanitization** — blocks prompt injection and financial manipulation in MCP tool inputs
- **Resilient HTTP** — `resilientFetch` with configurable retry, exponential backoff with jitter, and circuit breaker. Integrated across all HTTP call sites including Spot API.
- **Shared base schemas** — `chainIdOptionalSchema`, `tokenPairSchema`, `tokenAmountSchema`, `tokenEstimateSchema`. All tool schemas extend these.
- **Output Zod schemas exported** — `swapIntentSchema`, `bridgeIntentSchema`, `simulationResultSchema`, `preparedOperationSchema`, and 12 more.
- **`agdp` and `x402` public entry points** — `import from "web3agent/agdp"` and `"web3agent/x402"` now work.
- **Spot API URL configurable** — set `SPOT_API_URL` env var to override the default endpoint. Required for production deployments.
- **Agent playground example** — Vercel AI SDK example app demonstrating programmatic usage.
- **794 tests** (up from 520) across 81 test files.

### Fixed

- **Bridge/quote estimates returned token symbols instead of addresses** — `prepareBridgeIntent` and `lifi_get_quote` now return `.address` with `fromDecimals`/`toDecimals`.
- **Limit order expiry** defaults to 24h when not specified (was falling through to 5min TTL).
- **Balance cache precision** — uses viem `formatUnits` instead of lossy `Number(balanceWei)`.
- **Wallet change clears balance cache** — prevents stale balance from previous wallet affecting policy decisions.
- **Legacy queued orders** — pre-v0.3.0 TWAP/limit entries in the confirmation queue are fully converted (chunks→fromMaxAmount, fillDelay→epoch, toMinAmount→outputLimit) before replay.
- **`submitSignedOrder` URL validation** — SDK and MCP layers both validate submit URL against configured Spot API base.
- **`schedulePersist` race condition** — spend tracker and confirmation queue re-persist if mutations arrive during in-flight write.
- **`riskLevel` serialized in confirmation queue** — preserved across process restarts.

### Changed

- **Types derived from Zod** — 15 manual interfaces in `types.ts` replaced with `z.infer<typeof schema>`. Zod is the single source of truth.
- **All `0x${string}` type annotations replaced with viem's `Hex` type** across 15 files.
- **CLAUDE.md and .claude/rules** updated with shared schema conventions and field naming rules.

### Migration Guide (Orbzy / downstream consumers)

- `submitSignedTwapOrder({ order, signature: { v, r, s } })` still works but is deprecated. Migrate to `submitSignedOrder({ submitUrl, order, signature: hex })`.
- `prepareTwapIntent` / `prepareLimitIntent` return `SpotOrderIntent` — signing data is at `.typedData` (not `.eip712`), order payload at `.submit.body.order`, approval at `.approval.tx`.
- Input schemas use `fromToken`/`toToken`/`fromAmount` everywhere. Update any hardcoded old field names.
- `TwapIntent` / `LimitIntent` types are deprecated. Use `SpotOrderIntent`.

## [0.2.0] - 2026-03-15

### Breaking

- **Node 22+ required** — Node 18 reached EOL April 2025. CI, build target, and engine field all bumped to Node 22.
- **`chainId` now optional** in all Orbs schemas — previously required by Zod validation but handlers fell back to runtime config. Now the schema matches the behavior: omit `chainId` and the runtime default applies.

### Changed

- **All tool inputSchemas generated from Zod** — manual JSON schema definitions replaced with `zodToJsonSchema()`. Descriptions live in a single place (the Zod `.describe()` annotation) and are included in `listTools()` JSON Schema output.
- **Shared utilities extracted** — `resolveToolChainId()`, `resolveToolChain()`, `buildWriteContext()` eliminate repeated boilerplate across tool handlers.
- **Read-only handlers use `createToolHandler`** — `agdpGetOfferings`, `x402CheckRequirements` migrated to the shared handler factory.

### Fixed

- **CI OOM** — DTS generation worker ran out of memory on GitHub Actions. Fixed with `NODE_OPTIONS=--max-old-space-size=4096` at job level.
- **`@orbs-network/twap-ui` moved to production deps** — the twap-sdk hard-requires it at runtime. Was a devDep, causing `MODULE_NOT_FOUND` for end-user installs.
- **Slippage description corrected** — was "0-1, default 0.03", actually uses percentage format (0.5 = 0.5%).

### Removed

- **`@goat-sdk/adapter-model-context-protocol`** — zero imports in source. Codebase implements its own MCP dispatch.
- **`reflect-metadata`** — zero imports in source. Leftover from earlier decorator-based approach.

### Added

- **CLAUDE.md** — agentic coding guidance with architecture overview, conventions, and commands.
- **Schema quality test** — 52 tests enforce that all Zod schema fields have `.describe()`. Prevents regression.
- **520 tests** (up from 464) across 67 test files.

## [0.1.0] - 2025-12-20

Initial public release. A unified MCP proxy server that gives AI agents complete Web3 capabilities through `npx web3agent`.

### Added

- **CLI entrypoint** (`npx web3agent`) with stdio MCP server and `--version`/`--help` flags
- **Host auto-detection** (`npx web3agent init`) for Claude Code, Cursor, Windsurf, and OpenCode
- **Blockscout adapter** — indexed blockchain data (address info, tx history, NFTs, contract ABIs, token lookups) with transport fallback
- **EVM MCP adapter** — managed subprocess for live on-chain state (balances, contract reads/writes, gas, ENS, multicall)
- **Etherscan adapter** — contract ABI fetching with graceful degradation
- **GOAT plugins** — Uniswap swaps, Balancer LP, ERC-20/721 transfers, DexScreener pairs, chain-aware tiered loading
- **LI.FI tools** — cross-chain bridging quotes and execution with Zod-validated inputs
- **Orbs tools** — Liquidity Hub aggregated swaps, dTWAP orders, dLIMIT orders, Permit2 approval flow
- **Token resolver** (`resolve_token`) — symbol-to-address resolution with built-in registry and DexScreener fallback
- **Wallet management** — generate, activate (private key or mnemonic), derive addresses, deactivate, sign messages/typed data
- **Confirmation queue** — durable pending operation queue with wallet-bound confirmations and disk persistence
- **Chain support tiers** — Tier 0 (full), Tier 1 (core), Tier 2 (limited) classification for 17 EVM chains
- **Shared utilities** — `executeWrite`, `validateInput`, `resolveChainId`, `requireActiveWallet`, `formatToolError`
- **RemoteMcpAdapter** base class — shared lifecycle for Blockscout and Etherscan adapters
- **BaseConfigWriter** — shared host config writing logic
- **Build-time version injection** via tsup define
- **Graceful shutdown** with SIGINT/SIGTERM handlers and resource cleanup
- **Single dispatch map** in ProxyServer preventing duplicate tool registrations
- **WEB3_CONTEXT.md** — ships in the tarball as an AI-readable tool routing guide
- **268 tests** across 41 test files (Vitest) covering all modules
- **CI pipeline** (GitHub Actions) with lint, typecheck, build, and test gates
- **Biome** linting and formatting with `noEmptyBlockStatements` enforcement

### Fixed

- Persisted wallet file now takes priority over env vars in subprocess key resolution (runtime `wallet_activate` propagates correctly)
- EVM adapter signal handler lifecycle — proper cleanup on wallet restart, no handler accumulation
- GOAT provider rebuilds snapshots on wallet change with generation tracking (prevents stale tool snapshots)
- Removed misleading WBTC aliases from token registry (BSC BTCB was incorrectly aliased)
- `splitSignature` input validation prevents cryptic errors on malformed signatures
- Durable confirmation queue persists across process restarts with wallet-address binding
- Config consolidation via `setConfig`/`resetConfig` eliminates scattered `process.env` reads

### Changed

- Tool handlers migrated to Zod schemas for input validation (LI.FI, Orbs, wallet, tokens)
- Upstream adapters refactored to extend `RemoteMcpAdapter` base class
- Host config writers refactored to extend `BaseConfigWriter`

[0.1.0]: https://github.com/Apegurus/web3agent/releases/tag/v0.1.0
