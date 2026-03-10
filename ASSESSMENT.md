# web3agent — Codebase Assessment

> Generated 2025-03-09. No code changes made — analysis only.

## Project Overview

**web3agent** is a unified MCP (Model Context Protocol) proxy server that gives AI agents (Claude Code, Cursor, Windsurf, OpenCode) complete Web3 capabilities through a single `npx web3agent` entry point. It aggregates:

- **Blockscout** — indexed blockchain data (address info, tx history, NFTs, contract ABIs)
- **Etherscan** — contract data via MCP
- **EVM MCP** — live on-chain state (balances, contract reads, gas, ENS)
- **GOAT SDK plugins** — Uniswap, Balancer, ERC-20/721, DexScreener, ENS, CoinGecko, 0x
- **LI.FI** — cross-chain bridging and swaps
- **Orbs** — Liquidity Hub aggregated swaps, dTWAP, dLIMIT orders
- **Wallet management** — generate, persist, derive addresses
- **Token resolver** — canonical registry + DexScreener fallback

## Architecture

```
index.ts → CLI routing (init vs server mode)
  ↓
runtime/startup.ts → Initializes all adapters, wallet, plugins
  ↓
runtime/server.ts (ProxyServer) → Aggregates all tools, routes calls
  ├── upstream/blockscout/  → MCP client (StreamableHTTP/SSE)
  ├── upstream/etherscan/   → MCP client (StreamableHTTP/SSE)
  ├── upstream/evm/         → MCP client (stdio subprocess)
  ├── goat/provider.ts      → GOAT SDK integration (per-chain snapshots)
  ├── tools/lifi/           → LI.FI SDK
  ├── tools/orbs/           → Orbs SDK (Liquidity Hub, TWAP, dLIMIT)
  ├── tools/wallet/         → Wallet lifecycle management
  ├── tools/tokens/         → Token resolution (registry + DexScreener)
  └── tools/utility/        → Status, supported chains
```

## What's Working Well

- **Architecture**: Proxy pattern with graceful degradation is solid. Upstream adapters isolate external dependencies well.
- **Standards enforcement**: AGENTS.md + Biome config creates a consistent baseline.
- **Error handling philosophy**: `formatToolError`/`formatToolResponse` as the canonical return pattern is clean.
- **Confirmation queue**: Write-gating with TTL-based expiry is a smart security layer for an agent-facing tool.
- **Token registry**: Verified canonical addresses as the source of truth, with DexScreener fallback, is pragmatic.
- **Host detection + init CLI**: Multi-host support with automatic detection is user-friendly.
- **Test coverage breadth**: 34 test files covering adapters, wallet lifecycle, config validation, host writers, CLI, and degraded mode scenarios.

---

## Findings

### 🔴 Hidden Bugs

#### 1. GOAT snapshot cache never invalidated on wallet change

`GoatProvider.snapshots` caches GOAT tool snapshots per chainId, each containing a `toolHandler` bound to the old wallet client. When `wallet_activate` changes the wallet, nothing clears or rebuilds these snapshots. The `EvmAdapter` listens for `wallet-changed` and restarts, but `GoatProvider` doesn't. Any subsequent GOAT tool call on a previously-cached chain will use the **old wallet**, silently signing/sending from the wrong account.

**Fix**: Lazy invalidation — clear cache on `wallet-changed`, rebuild on next tool call.

#### 2. EvmAdapter process signal handlers accumulate and never detach

`initialize()` (line 57-59 of `evm/adapter.ts`) registers `process.on("exit")`, `process.on("SIGTERM")`, `process.on("SIGINT")` handlers every time it's called. These are never removed. After wallet changes trigger restarts, stale handlers reference old `this.transport` instances.

**Fix**: Full lifecycle management — ProxyServer owns signal handlers, calls `shutdown()` on all adapters.

#### 3. Missing token tool count in startup report

`startup.ts` calculates `totalToolCount` by summing framework + goat + blockscout + etherscan + evm + lifi + orbs tools. Token tools (`resolve_token`, `list_chain_tokens`) are registered in the server but **not counted**, making the reported tool count wrong.

**Fix**: Add token tool count to the total.

#### 4. `shutdown()` is never called on any adapter

`ProxyServer.shutdown()`, `BlockscoutAdapter.shutdown()`, `EtherscanAdapter.shutdown()`, `EvmAdapter.shutdown()` all exist but are never invoked on process exit. Only `EvmAdapter` has ad-hoc `process.on("exit")` signal handling. The Blockscout and Etherscan MCP clients are never properly closed.

**Fix**: ProxyServer registers signal handlers once and cascades `shutdown()` to all adapters.

#### 5. `buildEvmEnv` ignores the wallet state parameter

The function signature is `buildEvmEnv(_walletState?: WalletState)` but it reads `process.env.PRIVATE_KEY` directly. When `wallet_activate` is called at runtime with a new private key, the persisted key is stored on disk but `process.env.PRIVATE_KEY` doesn't change. The EVM subprocess restart picks up the same old env. Dynamically activated wallets **don't propagate** to the EVM MCP subprocess.

**Fix**: `buildEvmEnv` reads from wallet state (persistence module), not `process.env`.

#### 6. Orbs swap re-quotes after `prepareSwap` without consistent token address

In `executeOrbsSwapNow`, `prepareSwap` may wrap native tokens (returning a new `fromToken`). The subsequent `sdk.getQuote()` correctly uses the returned `fromToken`, but if the swap submission path falls through to `submitSwap`, the `quote` object still has the SDK's view of the token. Potential approval mismatches for native tokens.

#### 7. `getConfig()` caching diverges from `parseEnv()` in startup

`startServer()` calls `parseEnv(process.env)` to get config, then later `getConfig()` which re-parses and caches independently. These are two separate `RuntimeConfig` objects. If any downstream code mutated one, the other wouldn't reflect it.

**Fix**: Ensure `startServer()` uses the cached instance consistently.

### 🟡 DRY Violations

#### 8. Host writers are ~85% copy-paste

`ClaudeWriter`, `CursorWriter`, `WindsurfWriter`, `OpenCodeWriter` all implement the same `read-existing → merge → dry-run check → write` flow. Only the config path, structure key (`mcpServers` vs `mcp`), and entry format differ. This is 4× duplication of a ~30-line method.

**Fix**: Abstract base class with config-specific overrides.

#### 9. Blockscout and Etherscan adapters share ~80% of their code

Both implement transport fallback (StreamableHTTP → SSE), health tracking, tool prefixing, and route mapping identically. Only Etherscan has auth headers and Blockscout has a bootstrap tool call.

**Fix**: `HttpMcpAdapter` base class; all three implement existing `UpstreamAdapter` interface. EvmAdapter implements interface directly (too different for shared base).

#### 10. Chain ID resolution pattern repeated 9 times in Orbs tools

`Number(params.chainId ?? getConfig().chainId)` appears in `orbsGetQuote`, `orbsSwap`, `orbsSwapStatus`, `orbsPlaceTwap`, `orbsPlaceLimit`, `orbsListOrders`, `executeOrbsSwapNow`, `executeOrbsTwapNow`, `executeOrbsLimitNow`.

**Fix**: Extract `resolveChainId(params)` utility.

#### 11. Wallet read-only guard duplicated across all write tools

The pattern `walletState.mode === "read-only" → return formatToolError(...)` is copied in `orbsSwap`, `orbsPlaceTwap`, `orbsPlaceLimit`, `lifiExecuteBridge`.

**Fix**: Extract `requireActiveWallet()` utility.

#### 12. Error catch pattern repeated ~20+ times across tool handlers

Every handler has the identical:
```typescript
catch (err: unknown) {
  return formatToolError("CODE", err instanceof Error ? err.message : "Unknown error");
}
```

**Fix**: Consider a `withToolErrorHandler(code, fn)` wrapper.

### 🟡 KISS Violations

#### 13. Inconsistent tool dispatch in ProxyServer

Some tools route by prefix (`blockscout_`, `etherscan_`, `evm_`), some by Set membership (`goatToolNames.has`), some by linear `.find()` search through arrays (`lifiTools`, `orbsTools`, `frameworkTools`). Should be one unified dispatch mechanism.

**Fix**: Single `Map<string, ToolHandler>` rebuilt on changes (wallet-changed, GOAT snapshot rebuild).

#### 14. `INTEGRATION_CHAINS` is a fragile manual union with duplicates

Lines 49-53 of `tools/utility/index.ts` manually merge three different arrays of chain IDs with overlapping values. The Set constructor silently hides the duplicates.

**Fix**: Derive from source registries programmatically.

#### 15. Duplicate degraded service tracking in startup

`startup.ts` pushes to `degradedServices[]` in catch blocks (lines 58, 68, 79), then checks health status again (lines 138-141) and pushes the same services. Deduped with `new Set()` — a bandaid for duplicated logic.

**Fix**: Single source of truth from health status object, no manual array.

### 🟡 Code Smells

#### 16. Health state as module-level mutable globals

`_health` and `_totalToolCount` in `tools/utility/index.ts` are set by `startup.ts` via `setHealthStatus()`. This pattern couples unrelated modules and makes testing hard.

**Fix**: Dependency injection — pass health/state through constructor or context object. Scope limited to health/state only; `getConfig()` stays as-is.

#### 17. `formatHealthSummary` defined in `types/health.ts`

A rendering/formatting function doesn't belong in a types file. `config/health.ts` re-exports it, creating a confusing import chain.

**Fix**: Move implementation to `config/health.ts`.

#### 18. Two bare catch blocks violate AGENTS.md standards

- `persistence.ts:135-137` — `catch { /* corrupted wallet file */ }` — no `biome-ignore` comment
- `resolver.ts:140-142` — `catch { /* RPC decimals() best-effort */ }` — no `biome-ignore` comment

**Fix**: Add `biome-ignore` comments per AGENTS.md convention.

#### 19. BSC WBTC maps to BTCB address

`registry.ts` line 111-116: BSC's `WBTC` entry points to the same address as `BTCB` (0x7130d...). A user asking for "WBTC" on BSC gets BTCB (Binance-pegged BTC), which may not be their intention.

**Fix**: Remove WBTC alias on BSC, keep BTCB only.

### 🟡 Missing Test Coverage

No tests exist for these critical paths:

| Module | Risk |
|--------|------|
| `tokens/resolver.ts` (DexScreener fallback) | User-facing token resolution |
| `tokens/registry.ts` | Canonical address correctness |
| `utils/signature.ts` | Used in financial operations (TWAP/dLIMIT signing) |
| `utils/errors.ts` | Core response formatting |
| `orbs/liquidity-hub.ts` (`normalizeEip712ForSigning`, `prepareSwap`, `submitSwap`, `pollSwapStatus`) | Complex EIP-712 normalization, swap execution |
| `tools/tokens/index.ts` | Tool handler for token resolution |

### 🟢 Feature Gap

#### 20. Token resolver: native token → wrapped mapping

The token registry has no entries for native tokens (ETH, MATIC, BNB) — only wrapped versions. Each integration handles wrapping differently (Orbs wraps on-the-fly, LI.FI handles internally, GOAT varies).

**Fix**: `resolve_token('ETH', 8453)` should return WETH address with a note about wrapping.

---

## Implementation Priority

### Phase 1 — Financial/Correctness Risk (do first)

| # | Item | Why |
|---|------|-----|
| 1 | GOAT wallet invalidation | Wrong wallet signing transactions |
| 5 | EVM wallet propagation | Wrong wallet for EVM operations |
| 19 | BSC WBTC alias removal | User gets wrong token |
| 3 | Token count in startup | Misleading server status |

### Phase 2 — Reliability

| # | Item | Why |
|---|------|-----|
| 2+4 | Full lifecycle / shutdown | Resource leaks, orphan processes |
| 7 | `getConfig()` consistency | Config divergence risk |
| 18 | Bare catch blocks | AGENTS.md compliance |

### Phase 3 — Maintainability (DRY/KISS/Smells)

| # | Item |
|---|------|
| 8 | Abstract base class for host writers |
| 9 | HttpMcpAdapter base for Blockscout/Etherscan |
| 10 | `resolveChainId()` utility |
| 11 | `requireActiveWallet()` utility |
| 12 | `withToolErrorHandler()` wrapper |
| 13 | Single dispatch map |
| 14 | Derive `INTEGRATION_CHAINS` programmatically |
| 15 | Single degraded-services source of truth |
| 16 | DI for health state |
| 17 | Move `formatHealthSummary` |

### Phase 4 — Coverage & Features

| # | Item |
|---|------|
| 19 | Tests for all untested modules |
| 20 | Native token → wrapped mapping in resolver |

---

## Design Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| GOAT invalidation strategy | Lazy (clear on change, rebuild on use) | Avoids unnecessary rebuilds for unused chains |
| Shutdown ownership | ProxyServer owns lifecycle | Single responsibility, no scattered signal handlers |
| Writer/adapter refactor | Abstract base class | Natural OOP hierarchy for similar classes |
| Tool dispatch | Single Map, rebuilt on changes | Consistent O(1) lookup, eliminates mixed strategies |
| EVM wallet propagation | Read from wallet state | Source of truth is persistence module, not env vars |
| DI scope | Health/state only | `getConfig()` is stable enough; full DI is over-engineering |
| Adapter base class scope | HttpMcpAdapter for Blockscout/Etherscan + UpstreamAdapter interface for all three | EvmAdapter is too different for shared base |
| Dynamic dispatch | Rebuild map on changes | Simplest correct approach |
| Native tokens | Resolver handles mapping | Consistent UX — user says "ETH", gets WETH with note |
| BSC WBTC | Remove alias | Users should know they're getting BTCB |
| Test priority | All untested modules equally | Financial operations demand full coverage |
