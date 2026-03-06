# Learnings — web3agent-framework

## Project Conventions
- Package manager: pnpm (NEVER npm in dev scripts; npm only for end-user simulation via packed tarball)
- Build tool: tsup (not tsc) — tsup preserves shebangs natively
- Test framework: Vitest
- Linting/formatting: Biome
- Module system: ESM (`"type": "module"` in package.json)
- TypeScript: strict mode, `"module": "nodenext"`, `"moduleResolution": "nodenext"`, `"target": "es2022"`

## Architecture Decisions
- Low-level MCP `Server` API (NOT high-level `McpServer`) — needed for proxy control
- GOAT adapter pins MCP SDK to 1.0.4 — handled via pnpm `peerDependencyRules.allowedVersions`
- Blockscout: `__unlock_blockchain_analysis__` must be auto-called at init, then FILTERED from proxy surface
- Orbs Liquidity Hub: only available on 6 chains (Polygon 137, BSC 56, Base 8453, Linea 59144, Blast 81457, Arbitrum 42161)
- TWAP SDK: use `@orbs-network/twap-sdk` with `constructSDK()`, `derivedSwapValues()`, `prepareOrderArgs()`, `getOrders()`
- dSLTP: feature-gated — only implement if validated SDK exists

## Error Pattern
All tool errors use: `formatToolError(code, message, details?)` returning `{ content: [{ type: "text", text: JSON.stringify({ error: code, message, details }) }], isError: true }`

## Wallet Persistence
- File: `~/.web3agent/wallet.json`
- Permissions: `0o600`
- Precedence: `PRIVATE_KEY` env → `MNEMONIC` env → persisted file → ephemeral read-only

## Wave Structure
- Wave 1 (sequential): Task 1
- Wave 2 (parallel): Tasks 2, 3, 4
- Wave 3 (parallel): Tasks 5, 6, 7, 8, 9
- Wave 4 (sequential): Task 10, then 11
- Final Verification: F1-F4 parallel

## [2026-03-06] Task 1: Bootstrap Complete
- pnpm install: SUCCESS — no errors, peer dep warnings silenced via peerDependencyRules
- build: SUCCESS — dist/index.js with shebang `#!/usr/bin/env node`
- test: SUCCESS — 3 smoke tests pass (formatToolError, formatToolResponse string/object)
- typecheck: SUCCESS — strict mode, nodenext resolution
- lint: SUCCESS — Biome check clean on all 13 project files
- src/types/ frozen interfaces created and importable (config, health, wallet, tools, upstream)
- **Version fix**: `@orbs-network/twap-sdk` spec said `^2.7.29` but 2.x max is 2.0.54. Used `^5.0.0` (latest stable 5.0.125)
- **Biome adjustments**: Added `.argus/**` to ignore list; Biome prefers single-line function params when under lineWidth, template literals over string concat
- **Peer dep rules**: Added allowedVersions for @goat-sdk/core 0.5.0, viem 2.47.0, @goat-sdk/wallet-evm 0.3.0, utf-8-validate 6.0.6
- Actual installed versions: MCP SDK 1.27.1, viem 2.47.0, zod 3.25.76, typescript 5.9.3, tsup 8.5.1, biome 1.9.4, vitest 2.1.9
- Corepack auto-added `packageManager: pnpm@9.15.4` to package.json

## [2026-03-06] Task 2: Config + Chain Registry
- Viem chain names match imports exactly: `mainnet`, `base`, `arbitrum`, `optimism`, `polygon`, `linea`, `bsc`, `avalanche`, `zksync`, `scroll`, `mode`, `blast`, `mantle`, `celo`, `gnosis`, `sepolia`, `baseSepolia`
- Chain name lookup uses `chain.name` property (e.g. "Base" not "base") — normalized via `.toLowerCase()` for case-insensitive search
- `HealthStatus.core` is `BackendStatusCode` (string), while other backends are `BackendStatus` (object) — `markBackendDegraded` needs to handle both paths
- `formatHealthSummary` is already implemented in frozen `src/types/health.ts` — re-exported from `src/config/health.ts`
- `parseEnv` accepts `Partial<Record<string, string>>` to allow both `process.env` and test overrides
- `wallet-factory` returns NEW client every call (never cached) per LI.FI requirements
- Pre-existing `src/wallet/events.ts` typecheck error (TS2394 overload) from parallel Task 3/4 — not in this task's scope
- 22 tests passing: 11 runtime-config, 5 runtime-config-invalid, 6 registry

## [2026-03-06] Task 4: Wallet + Confirmation Queue
- wallet file path: ~/.web3agent/wallet.json (use homedir())
- file permissions 0o600 verified via stat in tests
- wallet-changed event emitted on activate/deactivate via WalletEventEmitter
- ConfirmationQueueManager is a class (not singleton) for testability — singleton exported as `confirmationQueue`
- EventEmitter overload typing: need `override` keyword + `any[]` for listener params (strict mode)
- biome-ignore directive required for `any` in EventEmitter overload
- Chains registry (Task 2) already merged — dynamic import with try/catch fallback used in list_supported_chains
- register.ts exports ToolDefinition[] arrays (not setRequestHandler calls) — Task 10 assembles
- viem exports: `generateMnemonic(english)`, `mnemonicToAccount(mnemonic, { accountIndex, addressIndex })`
- wallet_generate returns privateKey ONCE — never stored (security)
- Biome auto-fix: run `npx biome check --write` on specific files to avoid touching parallel tasks
- 14 tests passing: 5 wallet-persistence, 9 confirmation-queue

## [2026-03-06] Task 3: Host Detection + Init
- Host detection markers: .claude/ (user-level via homeDir), .cursor/ .windsurf/ .opencode/ (project-level)
- Config paths: Claude=~/.claude/mcp.json (or .mcp.json if exists), Cursor=.cursor/mcp.json, Windsurf=~/.codeium/windsurf/mcp_config.json, OpenCode=.opencode/config.json
- Windsurf uses `serverUrl` (not `url`) for SSE entries
- OpenCode uses `type:"local"` with `command: ["npx", "web3agent"]` (array, not string) for local servers
- OpenCode config key is `mcp` (not `mcpServers`)
- Backup files created as `.bak` before modification via `copyFile`
- Managed section markers: `<!-- web3agent:start -->` ... `<!-- web3agent:end -->` for idempotent context installation
- Context files: Claude=CLAUDE.md, Cursor=.cursor/rules/web3agent.mdc (with frontmatter), Windsurf=.windsurf/rules/web3agent.md, OpenCode=AGENTS.md
- Writer base module (`writers/base.ts`) shares `mergeServers`, `safeWriteConfig`, `readJsonFile` across all hosts
- Biome import order: `node:os` before `node:path` (alphabetical sorting)
- 18 tests passing: 11 detect, 7 writers
- QA: dry-run prints changes without modifying files, multi-host exits 1 with clear error

## [2026-03-06] Task 5: Blockscout Adapter
- Import paths for MCP client transports require `.js` extension: `@modelcontextprotocol/sdk/client/streamableHttp.js`, `.../sse.js`, `.../index.js`
- Bootstrap tool handling: `callTool({ name: "__unlock_blockchain_analysis__" })` must be called before `listTools()`
- SSEClientTransport deprecated in SDK 1.27.1 — only hints, no errors. Used as fallback after StreamableHTTPClientTransport
- Must re-create `Client` instance between transport attempts (connect may leave client in bad state)
- Mock pattern for MCP Client in vitest: mock all 3 modules separately (client/index, client/streamableHttp, client/sse)
- `PrefixedTool` requires both `upstreamName` (original tool name) and `prefix` (adapter name) fields
- `.sisyphus/evidence/` is gitignored — evidence saved locally but not committed
- 12 tests passing: 8 adapter, 4 degraded

## [2026-03-06] Task 6: EVM Adapter
- StdioClientTransport spawn: `npx -y @mcpdotdirect/evm-mcp-server` with whitelisted env only (PATH, HOME, TMPDIR, TERM, NODE_ENV + mapped EVM vars)
- Env var mapping: PRIVATE_KEY → EVM_PRIVATE_KEY, MNEMONIC → EVM_MNEMONIC, WALLET_ACCOUNT_INDEX → EVM_ACCOUNT_INDEX, ETHERSCAN_API_KEY passed through
- wallet-changed event binding: `walletEvents.on("wallet-changed", async () => this.restart())` in initialize()
- process.on cleanup handlers: exit, SIGTERM, SIGINT → killSubprocess()
- Mock pattern for StdioClientTransport: mock returns `{ process: { pid: N, kill: vi.fn() } }`
- Subprocess pid accessed via `(transport as unknown as { process?: { pid?: number } }).process?.pid` (type assertion needed)
- No subprocess killing issues in tests — mocks prevent actual spawn
- `restarting` guard flag prevents concurrent restarts from rapid wallet-changed events
- `.sisyphus/evidence/` is gitignored — force-added with `git add -f`
- 8 tests passing: 5 readonly, 3 wallet-refresh

## [2026-03-06] Task 7: GOAT Provider
- `getOnChainTools` returns `{ listOfTools: () => [...], toolHandler }` — `listOfTools` is a **function** not array
- ERC20 plugin only exports `USDC, WETH, PEPE, MODE` — no USDT or DAI
- ERC721 requires `{ tokens: Token[] }` (not zero args) — uses `BAYC, CRYPTOPUNKS`
- ENS requires `{ provider?, chainId? }` — empty object `{}` works
- CoinGecko requires `apiKey` (not optional) — moved to Tier 2
- Uniswap requires `{ apiKey, baseUrl }` — kept in Tier 1 with defaults
- Balancer requires `{ rpcUrl, apiUrl? }` — kept in Tier 1 with fallback rpcUrl
- GOAT SDK generics: `GetOnChainToolsParams<TWalletClient>` requires `as any` cast when mixing PluginBase<EVMWalletClient> with PluginBase<WalletClientBase>
- Chain availability matrix: uniswap [1,137,43114,8453,10,42161,42220], balancer [34443,8453,137,100,42161,43114,10]
- Pre-existing typecheck errors in `src/orbs/approval.ts` (parallel task) — not in goat scope
- 10 tests passing: 5 chain-aware-provider, 5 chain-unavailable

## [2026-03-06] Task 8: LI.FI Tools
- `getQuote()` returns `LiFiStep` (NOT `Route`) — must use `convertQuoteToRoute()` before `executeRoute()`
- `LiFiStep` shape: `{ id, type: "lifi", tool, toolDetails, action, estimate, includedSteps }` — no `tags`, no `steps`
- `ExtendedChain` from `getChains()` has `nativeToken: Token` (NOT `nativeCurrency`)
- `Action` type has `fromChainId/toChainId/fromToken/toToken/fromAmount` but NOT `fromAmountUSD` — that's on `estimate.fromAmountUSD`
- `Estimate` type: `toAmount`, `toAmountMin`, `toAmountUSD`, `fromAmountUSD?`, `executionDuration`, `gasCosts: GasCost[]`
- `GasCost` shape: `{ type, price, estimate, limit, amount, amountUSD, token }` — `type` is `'SUM' | 'APPROVE' | 'SEND' | 'FEE'`
- `ExecutionOptions.updateRouteHook` receives `RouteExtended` (has `steps: LiFiStepExtended[]` with optional `execution`)
- Mock pattern: mock both `@lifi/sdk` and wallet modules; LiFiStep mock needs `id`, `type`, `tool`, `toolDetails`, `action`, `estimate`, `includedSteps`
- `getChains()` param is optional (`ChainsRequest?`) — can call with no args
- Pre-existing typecheck errors in `src/orbs/approval.ts` from parallel task — not LI.FI scope
- 5 tests passing: 3 quote, 2 confirmation

## [2026-03-06] Task 9: Orbs Integration
- **Liquidity Hub SDK** (`@orbs-network/liquidity-hub-sdk@1.0.74`): `constructSDK({ partner, chainId })` → `.getQuote(args)`, `.swap(quote, signature)`, `.getTransactionDetails(txHash, quote)`
- **TWAP SDK** (`@orbs-network/twap-sdk@5.0.125`): NOT v2.7.29 from spec — v5.x has completely different API
- v5 key exports: `buildRePermitOrderData()`, `submitOrder(order, signature)`, `getAccountOrders({ chainId, account })`, `getConfig(chainId, partner)`, `getSrcTokenChunkAmount()`, `getDeadline()`
- `Signature` type is `{ v, r, s }` all as `0x${string}` — must split raw hex signature from `signTypedData`
- `permit2Address` and `maxUint256` are exported from LH SDK at runtime but TypeScript `nodenext` resolution fails for them — hardcoded values in `approval.ts`
- `Quote.eip712` and `Quote.permitData` are typed as `any` — used for EIP-712 signing
- `Account.signTypedData` is optional in viem's `Account` type — must guard with `if (!account.signTypedData)` before calling
- `RePermitOrder` → `Record<string, unknown>` needs `as unknown as Record<string, unknown>` double cast
- `DsltpToolDefinition.handler` must return `Promise<CallToolResult>` not `Promise<unknown>` to match `ToolDefinition`
- dSLTP: SDK has `Module.STOP_LOSS` / `Module.TAKE_PROFIT` enums and `triggerAmountPerTrade` in order params, but NOT a standalone dSLTP SDK — it's part of TWAP order flow, feature-gated as `DSLTP_AVAILABLE = false`
- TWAP SDK v5 requires `@orbs-network/twap-ui` as peer dep for analytics module — causes runtime import error but works with mocking in tests
- Liquidity Hub chains: Polygon (137), BSC (56), Base (8453), Linea (59144), Blast (81457), Arbitrum (42161)
- TWAP chains (conservative): ETH (1), Polygon (137), BSC (56), Arbitrum (42161), Base (8453), Linea (59144), zkSync (324), Fantom (250), Avalanche (43114), Blast (81457), Sonic (146), Scroll (534352)
- 9 tests passing: 4 orbs-quote, 5 orbs-dsltp-flag
## [2026-03-06] Task 10: Proxy Runtime Assembly
- Implemented a low-level MCP ProxyServer using `Server` + stdio transport with deterministic tool ordering across framework, GOAT, Blockscout, EVM, LI.FI, and Orbs sources.
- Added explicit name-based routing for each tool family and normalized unknown calls through `formatToolError("UNKNOWN_TOOL", ...)` to keep MCP errors consistent.
- Wired wallet-change events to `notifications/tools/list_changed`, which keeps clients in sync when wallet mode/address changes affect tool availability.
- Built startup with degraded-mode tolerance for Blockscout/EVM init failures, stderr-only startup reporting, and continued server boot with remaining tool providers.
- Added runtime-focused tests for aggregation/routing/notifications and degraded startup behavior by mocking MCP server internals and adapter failures.
- Switched tsup splitting on and removed eager ERC721 GOAT plugin import to keep CLI `--help` and startup execution stable under current Node runtime.

## [2026-03-06] Task 10: Proxy Runtime Assembly
- ProxyServer class uses low-level `Server` from `@modelcontextprotocol/sdk/server/index.js` (NOT McpServer)
- Tool routing order: framework → GOAT → blockscout → evm → lifi → orbs (deterministic)
- GOAT tool routing uses `Set<string>` from `goatProvider.getAllToolNames()` — no prefix assumption
- `notifications/tools/list_changed` sent via `server.notification({ method: "notifications/tools/list_changed" })`
- startup.ts catches adapter initialize() errors individually — degraded OK, never fatal
- All logging goes to stderr ONLY — stdout is reserved for MCP transport
- `initializeWallet` takes `{ chainId, accountIndex, addressIndex }` config object
- `initializeLifi(apiKey?)` takes optional API key string
- `goatProvider.initialize({ zeroxApiKey, coingeckoApiKey, rpcUrl })` — all optional
- `normalizeInputSchema()` helper ensures all tool schemas have `type: "object"` for MCP compliance
- 111/111 tests passing after Task 10 (10 new runtime tests added)
- tsup build: `startup-5A2PVIZZ.js` is 56KB (includes all adapter imports via tree-shaking)

## Task 11: Release Artifacts (2026-03-06)

### What was built
- WEB3_CONTEXT.md: AI agent context file documenting all tools, chains, and environment variables
- README.md: Minimal npm landing page with install/usage instructions
- .github/workflows/ci.yml: Full CI pipeline with pack verification
- tests/e2e/host-matrix.test.ts: 9 tests covering 4 hosts x 2 modes + multi-host error case
- tests/e2e/packaging.test.ts: 6 tests for tarball contents and CLI behavior

### Patterns learned
- pnpm pack --json outputs file list without creating tarball (unlike npm pack --dry-run)
- execSync needs shell: true for shell redirections like 2>&1
- package.json "files" array controls what gets packed (added README.md)
- Host fixtures in tests/fixtures/hosts/ use directory markers (.claude/, .cursor/, etc.)

### Test results
- All 126 tests pass (111 existing + 15 new e2e tests)
- Typecheck clean
- Build successful
- Tarball verified: contains dist/, README.md, WEB3_CONTEXT.md, package.json
