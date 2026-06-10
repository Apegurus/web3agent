# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **fix(wallet)** — Thread `OWS_PASSPHRASE` / `OWS_FORCE_LEGACY` through `RuntimeConfig` so SDK consumers calling `createRuntime({ env })` are no longer silently downgraded to the legacy wallet backend. `wallet_info.passphraseConfigured` now reflects per-runtime config rather than the host `process.env`. (PR #20 finding 1)
- **fix(wallet)** — Startup `PRIVATE_KEY` / `MNEMONIC` under OWS is now kept in-memory only and does not write to the encrypted vault, matching the legacy backend's documented "env-as-session-override" semantics. Prevents accidental vault overwrite on multi-agent SDK consumers. (PR #20 finding 2)
- **fix(wallet)** — `wallet.json.migrated` plaintext backup is now created with explicit `0o600` mode regardless of the source file's mode. (PR #20 finding 3a)
- **fix(wallet)** — Migration recovers gracefully when both `wallet.json` and `wallet.json.migrated` are present and the OWS vault is already populated, instead of throwing on every subsequent boot. (PR #20 finding 3b)
- **fix(wallet)** — OWS vault directory creation goes through the shared `ensureSecureDir` helper, ensuring `0o700` on first write and chmod-repair for pre-existing `0o755` dirs on POSIX. (PR #20 finding 4)
- Added `LegacyWalletBackend` constructor reason so `wallet_info.backendReason` distinguishes between operator opt-out (`OWS_FORCE_LEGACY=1`), missing passphrase, Windows, and OWS module load failure.
- Documented single-wallet-per-process constraint in `SECURITY.md`.

## [0.5.0] - 2026-04-22

### Changed

- **`readJsonFile` (in `src/hosts/writers/base.ts`) now throws on malformed/unreadable configs.** Previously every read or parse error returned `null`. Programmatic consumers must now handle a thrown error tagged with `code === "HOST_CONFIG_MALFORMED"` (parse failure) or rethrown filesystem errors (EACCES, EPERM, EISDIR, …); only `ENOENT` continues to return `null`. This is the SDK-facing counterpart of the M2 host-writer fix below.

### Deprecated

- **Removal of `submitSignedTwapOrder`, `twapIntentSchema`, `limitIntentSchema` (and the related `prepareTwapIntent` / `prepareLimitIntent` helpers) deferred from v0.5.0 to v0.6.0.** These were marked for v0.5.0 removal per the v0.3.0 notes, but downstream consumers (Orbzy) still import them. Removal will be coordinated alongside that migration; `@deprecated` JSDoc has been updated to reflect the new target.

### Build

- **`prepack` hook in both publishable packages.** `web3agent` now runs `pnpm run build:package` (root tsup build) and `create-web3agent` runs `tsup` on `prepack`, guaranteeing a freshly-built `dist/` ships with every `npm pack` / `npm publish` even if the working tree's `dist/` is stale or absent (H4).
- **`create-web3agent` packaging contract.** The compatibility wrapper now reuses the canonical `web3agent/create` types, preserves the runtime-only dynamic import that keeps template asset lookup rooted in the main package, and declares its own `tsup` / `typescript` dev dependencies so package-local build and typecheck scripts are reproducible.

### CI

- **Node release matrix.** CI now validates both the published engine floor (Node 22) and the current Active LTS line (Node 24).
- **Blocking production audit.** The production dependency audit now fails CI on high-severity advisories; `path-to-regexp` is pinned to patched `8.4.0` through pnpm overrides to clear the transitive `@modelcontextprotocol/sdk -> express -> router` advisory.

### Fixed

- **`wallet_activate` in read-only mode (H1)** — activation was deadlocking under the default `CONFIRM_WRITES=true` flow because the tool was enqueuing with the ephemeral read-only `resolveEphemeral()` address. `transaction_confirm` then saw `walletAddress !== undefined` and enforced the read-only gate, blocking first-time activation. Now enqueues with `undefined`: `wallet_activate` is the transition *into* a signing wallet, so there is no pre-existing signer requirement.
- **CCXT `ccxt_private_write` per-method risk classification (H2)** — `classifyCcxtWriteRisk()` was dead code for direct `runtime.invokeTool()` paths because the runtime policy gate read the static `riskLevel: "financial"` field before the handler ran, denying `cancelOrder` / `setLeverage` with `UNESTIMABLE_FINANCIAL_WRITE`. Added dynamic `riskLevel: RiskLevel | ((args) => RiskLevel)` classifier support on `ToolDefinition`; the runtime resolves it via a new `resolveRiskLevel()` helper before sanitization, spend-tracking, and `evaluatePolicy`. `listTools()` still reports classifier-based tools as static `"financial"` (conservative upper bound) so MCP consumers keep the safety signal.
- **Policy numeric `Infinity` guards (M1)** — env parsing, explicit USD fields in tool args, and the spend-tracker record/window functions all accepted `Infinity` (since `Number.isNaN(Infinity) === false`). One `Infinity`-valued reservation or record would permanently poison the rolling spend window until process restart, effectively disabling spend caps. Added `Number.isFinite` guards at `parsePositiveFloat`, `extractEstimatedUsd` explicit-field loop, `recordSpend`, `reserveSpend`, and `getSpendWindow` (defensive).
- **`extractEstimatedUsd` also clamps non-finite computed paths to `0`.** The explicit-USD-field `Number.isFinite` guards (M1) do not cover computed paths — CCXT `amount * price` overflow and `estimateTokenUsd` returning a non-finite value could still propagate `Infinity` to `evaluatePolicy`. Now wrapped at the function boundary: any non-finite inner result is logged to stderr and replaced with `0` (estimation-failed).
- **`listTools()` / `getTool()` no longer leak `originalRiskLevel`.** The dynamic risk classifier support (H2) introduced an `originalRiskLevel` field on `RuntimeToolRecord` to preserve classifiers, but catalog accessors only stripped `handler` before returning. Now stripped alongside `handler`.
- **CCXT private write remediation.** Implicit private order endpoints are now classified as financial writes, non-USD crypto quote notionals are converted to USD for spend policy, private exchange creation rejects accounts without credentials, queued CCXT writes persist executable args for restart durability, and zero-USD estimates now flow through the standard policy-denial envelope.
- **Host writers refuse to overwrite malformed configs (M2)** — `readJsonFile` collapsed every read/parse failure into `return null`, which `BaseHostWriter.write()` interpreted as "config doesn't exist, create fresh", silently erasing user-edited malformed `.cursor/mcp.json`, `.opencode/config.json`, etc. Now only `ENOENT` returns `null`; malformed JSON throws a tagged `HOST_CONFIG_MALFORMED` error, and any other read error (EACCES, EPERM, etc.) rethrows so the writer refuses to proceed.
- **Host writers reject non-object JSON configs.** Parsed JSON configs whose top-level shape is an array, string, number, boolean, or `null` are now treated as malformed and left untouched instead of being overwritten as if they were missing.
- **CCXT capability gating (M3)** — `describeExchangeCapabilities` was advertising `private_read` / `private_write` based solely on account credentials, ignoring whether the exchange exposed the underlying methods. Now gates each mode on both credentials AND `exchange.has[method]` for the relevant read (`fetchBalance`/`fetchPositions`/`fetchOpenOrders`/`fetchMyTrades`) and write (`createOrder`/`cancelOrder`/`transfer`/`withdraw`/`setLeverage`) families. `requiresAuthFor` now reflects only modes that are actually reachable.
- **CLI `tools call` arg parsing (L4)** — the naive `rest.find((arg) => !arg.startsWith("--"))` picked the first non-flag token as the tool name, mis-identifying JSON input values (`{}`) that happened to not start with `--`. Replaced with a flag-aware `extractToolName()` that understands `--input` consumes its next token. Both `tools describe` and `tools call` dispatchers use it; ordering (flag-before-positional or positional-before-flag) no longer matters.
- **CLI `tools` validation errors outside JSON mode.** `web3agent tools describe` and `web3agent tools call` now print human-readable validation failures and set exit code `1` unless `--json` is requested; JSON mode continues to throw structured `CliExitError` envelopes.
- **CLI runtime setup JSON envelope (L1)** — `withCliRuntime` setup failures raised raw exceptions under `--json`, so machine-readable CLI consumers got a stack trace instead of a structured envelope. Now wraps setup failures as `CliExitError("RUNTIME_SETUP_FAILED", ...)` when `options.json` is true. Shutdown failures are now explicitly best-effort: logged to stderr with `[web3agent]` prefix, never rethrown, so a successful operation's result is preserved when only the cleanup fails.
- **x402 executor payload validation.** Internal `x402_fetch` confirmation payloads now use a dedicated Zod executor schema for the resolved `paymentChainId`, keeping internal queue data validated without exposing that field as public tool input.
- **`wallet_deactivate` in read-only mode (L6)** — was blocked by `executeWrite()`'s read-only gate. Deactivation is now session-local idempotent cleanup: it reverts the runtime to read-only mode without removing persisted wallet material. Permanent removal is handled by the separate confirmation-gated `wallet_delete` tool.
- **`serverStatus` guard for missing `_health.ccxt` (L8)** — matched the adjacent `agenticEconomy?.status ?? "not_initialized"` pattern; previously threw `TypeError` when `setHealthStatus` was invoked with a partial health object lacking the `ccxt` key.
- **Codex TOML writer (L9)** — `mergeManagedBlock` used non-start-anchored `indexOf(MARKER_END)`, so a literal `# web3agent:end` string in user comments before the managed block matched as the block terminator, producing garbage output. Now passes `startIdx + MARKER_START.length` as the search origin, plus an `endIdx > startIdx` sanity check. Additionally, `encodeTomlSection` now preserves `boolean` and finite `number` values (previously silently dropped); unsupported types emit a `[hosts/codex]` stderr warning.
- **`create-web3agent` symlink invocation (L10)** — the bin entrypoint compared `fileURLToPath(import.meta.url)` to `process.argv[1]` directly, so when invoked via `node_modules/.bin/create-web3agent` (a symlink) the two paths differed by realpath indirection, `isMain` was `false`, and the CLI silently exited. Now `realpathSync`-normalizes both sides before comparing; wrapped in `try/catch` so unexpected stat failures fall back to `isMain=false` (safe default — programmatic `runCreateCli` still works).

### Security

- **CCXT config permission checks fail closed (L2)** — the `statSync`-based permission check had an empty catch. If stat threw (e.g., EACCES on the parent directory, or a race with file removal) `insecurePermissions` defaulted to `false` and the credentials file was loaded without warning. Now the catch sets `insecurePermissions = true` and logs a `[ccxt]` stderr warning, so downstream high-risk-method gating always sees the signal.
- **CCXT config `insecurePermissions` signal preservation (L5)** — parse-error and non-array-accounts early returns hard-coded `insecurePermissions: false` even after the permission check had detected unsafe permissions. Now the computed local `insecurePermissions` propagates through both early-return branches.
- **State directory mode 0o700 (L3)** — `~/.web3agent` and its subdirectories for pending ops, spend log, and audit log were created with the process umask (typically 0o755), making them world-listable on multi-user systems even though files inside are 0o600. Directory metadata alone leaks the existence and timing of wallet and audit artifacts. Now `mkdir` passes explicit `mode: 0o700` in `src/utils/atomic-write.ts` and `src/wallet/audit.ts`.

### Tests

- **T1** — wallet-tools tests mocked `address: undefined` for read-only state, which does not match real `resolveEphemeral()` behavior (always sets `address`). Updated to reflect real state shape and added a new integration-style test that proves the H1 fix end-to-end.
- **T2** — `ccxt-tools.test.ts` asserted static `riskLevel === "financial"`, which masked H2 because the runtime never saw the classifier. Replaced with per-method classifier validation exercising all five branches (`createOrder`, `editOrder`, `cancelOrder`, `setLeverage`, method missing).
- **T3** — `managed-runtime.test.ts` stubs hardcoded `riskLevel: "financial"`, hiding the resolve-risk-level code path. Added a new test that stubs a classifier function and verifies the policy gate evaluates each call with the per-method risk level.
- **Integration coverage** — new `tests/runtime/invoke-tool-integration.test.ts` exercises the full `runtime.invokeTool → sanitization → policy gate → handler` path for H1 and H2 using module-boundary mocks for CCXT runtime state, accounts, and the unrelated GOAT provider chain (copied verbatim from the existing `managed-runtime.test.ts` pattern).
- **E2E cleanup (L11)** — `create-web3agent-smoke.test.ts` created `mkdtempSync` directories but never `rmSync`-ed them. Added `afterEach` cleanup that removes all tracked temp dirs. Verified: 0 new leaks per run (was 4 per run pre-fix).
- **New `tests/e2e/create-web3agent-bin-symlink.test.ts`** — creates a symlink to `dist/index.js` and invokes it via node to prove L10 fix. The existing `web3agent-create-cli-install.test.ts` invokes `dist/index.js` directly, bypassing the symlink path entirely.
- **Pack-mutex around `pnpm pack` calls in e2e** — added `tests/e2e/pack-mutex.ts`, a small O_EXCL-based file lock used by `web3agent-create-cli-install.test.ts`, `create-web3agent-generated-projects.test.ts`, and `packaging.test.ts`. Prevents a race where parallel pack invocations collide on tsup's `clean: true` step.

### Notes

- **`listTools()` reports dynamic-classifier tools as static `"financial"`.** This is by design — MCP consumers use `riskLevel` as a conservative upper-bound safety signal, and per-method classification (e.g., CCXT `cancelOrder` → `destructive`) is only resolved at invocation time. UIs that branch on `riskLevel` to choose warning copy will over-warn for `cancelOrder`-class operations on `ccxt_private_write` until they consume the resolved risk via the runtime invocation path.

### Fixed (from PR #17 merged into this release)

- **Confirmation queue** — clear `persistNeeded` inside the `schedulePersist()` catch arm so a failed `persistQueue()` cannot strand `flushPendingPersists()` in an infinite loop when a concurrent `schedulePersist()` raced the in-flight persist.
- **CCXT `ccxt_private_write`** — no longer persists `estimatedUsd: 0` for market orders. Market orders without price were already denied at confirm time via `UNESTIMABLE_FINANCIAL_WRITE`; this removes dead metadata from `pending-ops.json`.
- **`transaction_confirm`** — no longer rejects confirmation of off-chain CCXT private writes (which have no `walletAddress`) when the wallet is in read-only mode. The read-only gate now applies only to wallet-backed operations.
- **Spend reservation leak** — `transaction_confirm` now releases in-flight reservations on `NOT_FOUND` (concurrent-race) and stale-at-confirm paths. Previously, reservations created during policy evaluation were leaked when the op was lost between the pre-check peek and the final `confirm()` call.
- **CCXT admin/cancellation methods** — `cancelOrder`, `cancelAllOrders`, `setLeverage`, `setMarginMode`, `transfer`, `withdraw` are now classified as `destructive` rather than `financial` when queued, so the policy engine routes them through `GAS_ONLY` allow instead of denying as `UNESTIMABLE_FINANCIAL_WRITE`. Order-creation methods (`createOrder`, `editOrder`) remain `financial`. High-risk movement (`withdraw`/`transfer`) remains gated by `checkHighRiskGuards` for secure-permissions and confirmation enforcement.
- **`web3agent tools call` exit status** — the CLI now sets `process.exitCode = 1` whenever a tool invocation fails, either by throwing (`TOOL_INVOCATION_FAILED` envelope) or by returning an `{ ok: false }` envelope (e.g., `POLICY_DENIED`, `NOT_FOUND`). CI scripts and shell pipelines can now detect both failure modes via exit status. The JSON envelope on stdout is unchanged.
- **Persisted-op audit continuity** — `loadQueue()` now emits an `EXPIRED` audit entry for any persisted operation whose TTL expired during shutdown, matching runtime `pruneExpired()` behaviour. Audit trails are now continuous across process restarts.

### Internal

- Added `ConfirmationQueueManager.flushPendingPersists()` for deterministic test synchronization.
- Removed empty `registerCcxtExecutors()`; the closure-capturing enqueue in `handleCcxtPrivateWrite` is the sole mechanism for CCXT private writes.
- Added test coverage for the `execResult.isError → fail()` branch of `transactionConfirm` and tightened the wallet-mismatch retry assertion to verify the retry actually succeeds.

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
- **`evaluatePolicy` input** — added optional `requiresWalletBalance` flag. When `false` (e.g. off-chain CCXT ops), the `MIN_RESERVE` rule is skipped. Defaults to `true` for backward compatibility.
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
