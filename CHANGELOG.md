# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
