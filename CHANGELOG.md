# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-03-17

### Breaking

- **Field names normalized to `from/to` convention** across all schemas:
  - Orbs: `inAmount` → `fromAmount`, `srcToken` → `fromToken`, `dstToken` → `toToken`, `srcAmount` → `fromAmount`, `dstMinAmount` → `toMinAmount`
  - LiFi: `fromTokenAddress` → `fromToken`, `toTokenAddress` → `toToken`
- **EVM tool inputSchemas now generated from Zod** — all 24 EVM tools migrated from manual JSON

### Added

- **Shared base schemas** — `chainIdOptionalSchema`, `tokenPairSchema`, `tokenAmountSchema`, `tokenEstimateSchema` in `common.ts`. All tool schemas extend these instead of redeclaring fields.
- **Output Zod schemas exported** — `swapIntentSchema`, `bridgeIntentSchema`, `simulationResultSchema`, `preparedOperationSchema`, and 12 more. Consumers get runtime-validatable schemas for API outputs.
- **`agdp` and `x402` public entry points** — `import from "web3agent/agdp"` and `"web3agent/x402"` now work.
- **109 schema quality tests** (auto-discovered) enforce `.describe()` on all schema fields.
- **Spot API URL configurable** — set `SPOT_API_URL` env var to override the default endpoint. Required for production deployments.

### Fixed

- **Bridge/quote estimates returned token symbols instead of addresses** — `prepareBridgeIntent` and `lifi_get_quote` now return `.address` with `fromDecimals`/`toDecimals`.

### Changed

- **Types derived from Zod** — 15 manual interfaces in `types.ts` replaced with `z.infer<typeof schema>`. Zod is the single source of truth.
- **CLAUDE.md and .claude/rules** updated with shared schema conventions and field naming rules.

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
