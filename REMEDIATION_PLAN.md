# web3agent Remediation Plan

## P0 — Bugs / Security Issues

### 1. GOAT snapshot cache never invalidated on wallet change
- **File**: `src/goat/provider.ts`
- **Fix**: Add a `clearSnapshots()` method. Have `startServer()` listen for `wallet-changed` and call it. Alternatively, `dispatchGoatTool` could always rebuild if the wallet mode has changed since the snapshot was created (store wallet address alongside each snapshot).
- **Scope**: ~15 lines changed

### 2. `transaction_confirm` doesn't guard against deactivated wallet
- **File**: `src/tools/wallet/index.ts` → `transactionConfirm()`
- **Fix**: Before calling `result.operation.executor()`, check `getWalletState().mode !== "read-only"` for write-type operations. Return an error if wallet was deactivated since enqueue.
- **Scope**: ~5 lines

### 3. `splitSignature` — no input validation
- **File**: `src/utils/signature.ts`
- **Fix**: Validate that input starts with `0x` and is exactly 132 chars. Throw descriptive error otherwise.
- **Scope**: ~5 lines

### 4. Base WBTC token alias points to cbBTC
- **File**: `src/tokens/registry.ts`, chain 8453
- **Fix**: Remove the `WBTC` alias entirely (there is no canonical WBTC on Base — only cbBTC exists). A user asking for "WBTC on Base" should get a "not found" with cbBTC suggested, rather than silently getting the wrong token.
- **Scope**: ~5 lines

### 5. `fetchDecimals` silently defaults to 18
- **File**: `src/tokens/resolver.ts`
- **Fix**: If the RPC call for decimals fails, return `null` from `resolveViaDexScreener` instead of guessing. The caller already handles `null` gracefully ("TOKEN_NOT_FOUND"). Never fabricate decimals — a wrong decimal value on a swap could cause massive fund loss.
- **Scope**: ~10 lines

---

## P1 — Architecture / DRY Violations

### 6. Extract `RemoteMcpAdapter` base class
- **Files**: New `src/upstream/remote-mcp-adapter.ts`, refactor `blockscout/adapter.ts` and `etherscan/adapter.ts`
- **Fix**: Create a base class handling: transport fallback (StreamableHTTP → SSE), tool prefixing, routeMap, `getTools()`, `callTool()`, `getHealth()`, `shutdown()`. Subclasses override `initialize()` for adapter-specific logic (Blockscout's bootstrap call, Etherscan's auth header).
- **Scope**: ~100 lines new, ~80 lines removed from each adapter

### 7. Single config instance — eliminate dual parsing
- **Files**: `src/config/env.ts`, `src/runtime/startup.ts`
- **Fix**: Have `startServer()` call `parseEnv()` once, then explicitly set the module-level cache via a new `setConfig(config)` export. Remove the re-parsing in `getConfig()`. This guarantees a single source of truth.
- **Scope**: ~10 lines

### 8. Pass config to `initializeWallet` instead of re-reading env
- **Files**: `src/wallet/persistence.ts`, `src/runtime/startup.ts`
- **Fix**: Add `privateKey` and `mnemonic` to `initializeWallet`'s config parameter. Remove the direct `process.env` reads from `persistence.ts`. The env is already parsed — no reason to read it again.
- **Scope**: ~15 lines

### 9. `INTEGRATION_CHAINS` derived from sources
- **File**: `src/tools/utility/index.ts`
- **Fix**: Import `RESTRICTED_PLUGIN_CHAINS` from `goat/dispatch.ts` and `LIQUIDITY_HUB_CHAINS` from `orbs/chains.ts`. Compute the union programmatically instead of hardcoding duplicate arrays.
- **Scope**: ~5 lines

### 10. Version string from package.json
- **Files**: `src/index.ts`, `src/runtime/server.ts`, `src/upstream/blockscout/adapter.ts`, `src/upstream/etherscan/adapter.ts`
- **Fix**: Create `src/version.ts` that reads from `package.json` (using `createRequire` or a build-time constant via tsup's `define`). Replace all 5 hardcoded `"0.1.0"` strings.
- **Scope**: ~15 lines new, 5 replacements

---

## P2 — Robustness Improvements

### 11. Graceful shutdown coordinator
- **Files**: `src/runtime/startup.ts`, `src/runtime/server.ts`
- **Fix**: Register a SIGTERM/SIGINT handler in `startServer()` that calls `server.shutdown()`, then `blockscoutAdapter.shutdown()`, `etherscanAdapter.shutdown()`, `evmAdapter.shutdown()` in parallel. Update `ProxyServer` to hold adapter references and coordinate.
- **Scope**: ~25 lines

### 12. Chain support tiers — `isSupported` vs `isFullySupported`
- **Files**: `src/chains/registry.ts`
- **Fix**: Add a `FULLY_SUPPORTED_CHAINS` set derived from the intersection of token registry + DexScreener slugs. Add `isFullySupported(id)` for contexts where you need more than just "viem knows this chain." Use in tool descriptions so the LLM knows which chains have real support.
- **Scope**: ~20 lines

### 13. Eliminate `degradedServices` double-push
- **File**: `src/runtime/startup.ts`
- **Fix**: Remove the manual pushes inside the try/catch blocks (lines 58, 69, 80). The post-initialization health checks on lines 138-141 already handle this. The `new Set()` dedup becomes unnecessary.
- **Scope**: ~10 lines removed

---

## P3 — Deferred / Won't Fix Now

- **Ephemeral wallet**: Keep current behavior. The GOAT provider already handles this correctly (conditional plugin loading). LiFi and Orbs tools guard against read-only mode. A deterministic address would be misleading. The ephemeral key is fine for SDK initialization — it can't accidentally spend funds because there are none.
- **Wallet encryption at rest**: Deferred to future implementation.
- **npx -y for EVM subprocess**: Standard MCP pattern (confirmed in all host writer configs). Keep as-is.

---

## Suggested Execution Order

1. **P0 items first** (1-5) — correctness/security fixes
2. **P1 #7 + #8 together** — config consolidation is a single coherent change
3. **P1 #6** — adapter refactor is the largest change, do it in isolation
4. **P1 #9 + #10** — small standalone fixes
5. **P2 items** — robustness improvements, lower urgency
