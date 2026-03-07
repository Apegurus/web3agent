# Web3Agent Framework

## TL;DR
> **Summary**: Build a greenfield `web3agent` npm package — a fully functional TypeScript MCP server + CLI that gives AI agents (Claude Code, Cursor, Windsurf, OpenCode) complete Web3 capabilities through a single-install proxy architecture.
> **Deliverables**:
> - Published `web3agent` CLI/server package for Node 18+ (pnpm, tsup, Biome, Vitest)
> - `init` command with host detection, safe config writing, and context installation for 4 hosts
> - Proxy runtime aggregating custom Web3 tools (GOAT, LI.FI, Orbs), hosted Blockscout, and local EVM MCP
> - Wallet persistence, confirmation queue, chain-aware execution, degraded startup support
> - Full automated test suite and packaging verification
> **Effort**: XL
> **Parallel**: YES — 4 waves
> **Critical Path**: 1 → 2 → 4 → {5,6,7,8,9} → 10 → 11

## Context
### Original Request
Build an easy-to-install Web3 agentic framework that plugs into existing agent tools. The project is fully greenfield — empty folder, no repo, no package manager. This is the fully functional product, not an MVP or V1 iteration.

### Interview Summary
- FRAMEWORK.md is the canonical spec; REFERENCE.md and MCP_REFERENCE.md supplement it.
- Package name `web3agent` confirmed available on npm.
- pnpm for package management, Biome for linting/formatting, Vitest for testing, tsup for building.
- Git init locally, push to GitHub later manually.
- Low-level MCP `Server` API chosen for proxy control (avoids JSON Schema→Zod→JSON Schema roundtrip).
- Blockscout is hosted-default via StreamableHTTPClientTransport (SSE fallback), no local infra.
- EVM MCP is subprocess-only (`@mcpdotdirect/evm-mcp-server@2.0.4`), uses `EVM_PRIVATE_KEY`/`EVM_MNEMONIC` env vars.
- dSLTP remains feature-gated — separate protocol from Liquidity Hub, unclear SDK status.
- TWAP/dLIMIT use proper SDK (`@orbs-network/twap-sdk`), not raw contract calls.
- All external research completed at planning time — no deferred research in execution tasks.

### Metis Review (gaps addressed)
- GOAT pins MCP SDK to 1.0.4 while framework uses 1.27.1 — addressed via pnpm `peerDependencyRules.allowedVersions`.
- Blockscout `__unlock_blockchain_analysis__` is a bootstrap tool — must be auto-called during adapter init, then filtered from proxy surface.
- Orbs Liquidity Hub only available on 6 of 17 framework chains — per-chain availability check required with clear error messages.
- TWAP SDK (`@orbs-network/twap-sdk`) exists and provides `constructSDK()`, `derivedSwapValues()`, `prepareOrderArgs()`, `getOrders()` — use this instead of raw viem contract interaction.
- dSLTP is a separate protocol from Liquidity Hub, NOT the same SDK — revert to feature-gated approach.
- tsc strips shebangs — use tsup which handles this natively.
- Task 1 must freeze ALL shared TypeScript interfaces so Wave 2 tasks can run in parallel without conflicts.
- Added `formatToolError()` helper and consistent error response pattern across all tools.
- EVM subprocess cleanup: `process.on('exit')` + `client.close()` to prevent zombies.
- Confirmation queue needs TTL + `createdAt` timestamp to handle stale operations.

## Work Objectives
### Core Objective
Ship a publishable `web3agent` package that gives supported agent hosts a single-install path to complete Web3 capabilities through a proxy MCP server with graceful degradation.

### Deliverables
- Node 18+ TypeScript ESM npm package with `bin` entry and tsup-built executable output.
- `init` command that detects Claude Code, Cursor, Windsurf, and OpenCode, writes MCP config safely, supports `--dry-run`, and installs context guidance.
- Runtime MCP server that aggregates:
  - Custom Web3 tools (wallet, GOAT-based, LI.FI, Orbs, utilities)
  - Hosted Blockscout MCP via upstream StreamableHTTP/SSE client transport
  - Local EVM MCP via managed subprocess stdio transport
- Persisted wallet management, confirmation queue, startup health/degradation reporting, and supported-chain registry.
- `WEB3_CONTEXT.md` shipped in the package with host-specific context/rules integration.
- Full automated test suite (Vitest) plus packaging/publish verification.

### Definition of Done (verifiable conditions with commands)
- `pnpm install` succeeds on Node 18+ with all dependencies resolved.
- `pnpm run build` produces executable `dist/index.js` with shebang preserved.
- `pnpm test` passes full suite covering config, proxy routing, wallet flows, init adapters, and integration mocks.
- `pnpm pack` produces a tarball containing runtime files, `WEB3_CONTEXT.md`, and no missing dependency errors.
- `node dist/index.js init --dry-run` detects supported host fixtures and prints deterministic config/context changes.
- `node dist/index.js` starts on stdio without optional secrets, logs only to stderr, and exposes a reduced but valid toolset.

### Must Have
- MCP SDK v1.27.1 with low-level `Server` API, request handlers, stdio transport, upstream client transports.
- Hosted-default Blockscout via StreamableHTTPClientTransport (SSE fallback) with `BLOCKSCOUT_MCP_URL` override.
- EVM MCP as managed local subprocess with wallet-state sync and env var mapping (`PRIVATE_KEY` → `EVM_PRIVATE_KEY`).
- Chain-aware GOAT execution with per-call `chainId` and cached per-chain handlers.
- Non-destructive config writes with host-aware merge rules and `--dry-run` support.
- Full automated tests plus agent-executed QA scenarios for every task.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No pre-alpha `McpServer` high-level API (we use low-level `Server` for proxy control).
- No assumption that upstream servers can be composed automatically by the SDK.
- No hard requirement for locally bundled Blockscout infrastructure.
- No destructive overwrite of existing host configs or rule files.
- No dSLTP implementation unless validated SDK/contract surface is confirmed.
- No all-or-nothing startup failure for optional backend outages.
- No `npm` commands in dev scripts — pnpm throughout. Exception: CI end-to-end verification may run `npm install` from the packed tarball to simulate end-user experience (since end users use `npx web3agent`).

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test framework: Vitest for unit/integration coverage and fixture-driven CLI tests.
- QA policy: Every task includes at least one happy-path and one failure/edge-path scenario.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`
- Error pattern: All tool errors use `formatToolError(code, message, details)` for consistent MCP responses.

## Execution Strategy
### Parallel Execution Waves

Wave 1 (Bootstrap — 1 task, must complete first): Repo scaffolding, dependencies, build pipeline, test harness, shared interface stubs.

Wave 2 (Foundation — 3 parallel tasks): Runtime config + chain registry + health model | Host detection + init + context | Wallet + confirmation + utilities.

Wave 3 (Adapters & Integrations — 5 parallel tasks): Blockscout adapter | EVM adapter | GOAT provider | LI.FI tools | Orbs unified.

Wave 4 (Assembly — 2 tasks, sequential): Proxy runtime + CLI assembly | Packaging + WEB3_CONTEXT.md + CI.

### Dependency Matrix (full, all tasks)
- 1 blocks 2, 3, 4 (everything needs the scaffold and shared interfaces).
- 2 blocks 5, 6, 7, 8, 9, 10 (adapters/integrations depend on config contracts and chain registry).
- 3 is independent after 1 — only blocks 10 and 11 (init feeds into CLI assembly and release).
- 4 blocks 6, 7, 8, 9, 10 (all integrations depend on wallet/confirmation subsystem).
- 5 depends on 2 and feeds 10.
- 6 depends on 2, 4 and feeds 10.
- 7 depends on 2, 4 and feeds 10.
- 8 depends on 2, 4 and feeds 10.
- 9 depends on 2, 4 and feeds 10.
- 10 depends on 3, 5, 6, 7, 8, 9.
- 11 depends on 10.

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 1 task → `unspecified-high`
- Wave 2 → 3 tasks → `unspecified-high`, `writing`, `unspecified-high`
- Wave 3 → 5 tasks → `unspecified-high` (×5)
- Wave 4 → 2 tasks → `deep`, `writing`

## TODOs

- [x] 1. Bootstrap repo, scaffold package, install dependencies, and freeze shared interfaces

  **What to do**: Initialize the greenfield repository and create a complete, buildable project skeleton. Steps:
  1. `git init` with a comprehensive `.gitignore` (node_modules, dist, .env, coverage, .sisyphus/evidence).
  2. `pnpm init` and populate `package.json` with all production and dev dependencies (see exact list below).
  3. Create `tsconfig.json` for ESM (`"module": "nodenext"`, `"moduleResolution": "nodenext"`, `"target": "es2022"`, strict mode).
  4. Create `tsup.config.ts` for building: entry `src/index.ts`, format `esm`, target `node18`, shebang banner `#!/usr/bin/env node`, clean output.
  5. Create `biome.json` with TypeScript linting + formatting defaults.
  6. Create `vitest.config.ts` with test directory `tests/`, coverage provider, and deterministic temp directory setup.
  7. Create source directory structure: `src/{config,chains,wallet,tools,hosts,upstream,goat,lifi,orbs,runtime,cli,assets,utils}/`.
  8. Create test directory structure: `tests/{config,wallet,hosts,upstream,goat,lifi,orbs,runtime,e2e,fixtures}/`.
  9. Create `src/index.ts` entry point that routes `init` subcommand vs default server mode (stub implementations).
  10. **CRITICAL**: Create `src/types/` with all shared TypeScript interfaces that Wave 2 tasks will code against. These are the frozen contracts:
      - `src/types/config.ts` — `RuntimeConfig`, `EnvVars`, `ChainConfig`, `SupportedChain`
      - `src/types/health.ts` — `HealthStatus`, `BackendStatus`, `StartupReport`
      - `src/types/wallet.ts` — `WalletState`, `WalletMode`, `PendingOperation`, `ConfirmationQueue`
      - `src/types/tools.ts` — `ToolRoute`, `ToolSource`, `AggregatedToolList`, `formatToolError()`, `formatToolResponse()`
      - `src/types/upstream.ts` — `UpstreamAdapter`, `AdapterHealth`, `PrefixedTool`
  11. Create `src/utils/errors.ts` with `formatToolError(code, message, details?)` returning `{ content: [{ type: "text", text: JSON.stringify({ error: code, message, details }) }], isError: true }`.
  12. Ensure `pnpm install && pnpm run build && pnpm test` all pass (test suite starts with a single smoke test).

  **Exact dependency list for package.json**:
  ```json
  {
    "name": "web3agent",
    "version": "0.1.0",
    "type": "module",
    "bin": { "web3agent": "dist/index.js" },
    "files": ["dist", "WEB3_CONTEXT.md"],
    "engines": { "node": ">=18" },
    "dependencies": {
      "@modelcontextprotocol/sdk": "^1.27.1",
      "@goat-sdk/adapter-model-context-protocol": "^0.2.11",
      "@goat-sdk/core": "^0.5.0",
      "@goat-sdk/wallet-viem": "^0.2.0",
      "@goat-sdk/plugin-uniswap": "^0.2.16",
      "@goat-sdk/plugin-balancer": "^0.1.15",
      "@goat-sdk/plugin-0x": "^0.1.11",
      "@goat-sdk/plugin-dexscreener": "^0.1.9",
      "@goat-sdk/plugin-coingecko": "^0.2.10",
      "@goat-sdk/plugin-erc20": "^0.2.14",
      "@goat-sdk/plugin-erc721": "^0.1.22",
      "@goat-sdk/plugin-ens": "^0.1.4",
      "@lifi/sdk": "^3.15.6",
      "@orbs-network/liquidity-hub-sdk": "^1.0.74",
      "@orbs-network/twap-sdk": "^2.7.29",
      "viem": "^2.0.0",
      "zod": "^3.25.0",
      "zod-to-json-schema": "^3.23.5"
    },
    "devDependencies": {
      "typescript": "^5.5.0",
      "tsup": "^8.0.0",
      "@biomejs/biome": "^1.9.0",
      "vitest": "^2.0.0",
      "@types/node": "^20.0.0"
    },
    "pnpm": {
      "peerDependencyRules": {
        "allowedVersions": {
          "@goat-sdk/adapter-model-context-protocol>@modelcontextprotocol/sdk": "1.27.1"
        }
      }
    },
    "scripts": {
      "build": "tsup",
      "test": "vitest run",
      "test:watch": "vitest",
      "lint": "biome check .",
      "lint:fix": "biome check --write .",
      "typecheck": "tsc --noEmit",
      "pack:check": "pnpm pack --dry-run"
    }
  }
  ```

  **Must NOT do**: Do not write implementation code beyond stubs. Do not use npm (pnpm only). Do not leave the executable bit or shebang as a manual step (tsup handles it). Do not make types overly specific — they are contracts, not implementations.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Cross-cutting scaffold with build/test/type correctness.
  - Skills: [] — Standard TypeScript project setup.
  - Omitted: [`git-master`] — Simple git init, no complex history operations.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 | Blocked By: none

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:5` — Package is TypeScript ESM, Node 18+, built with `tsc` (we use tsup instead for shebang support).
  - Pattern: `FRAMEWORK.md:305-310` — Package quality expectations.
  - Pattern: `REFERENCE.md:185-187` — `npx` compatibility requires shebang + executable + `bin` entry.
  - External: `https://github.com/modelcontextprotocol/typescript-sdk` — SDK v1.27.1 import paths.
  - External: `https://github.com/goat-sdk/goat/tree/master/typescript/packages/adapters/model-context-protocol` — GOAT adapter, pins SDK 1.0.4, needs peerDependencyRules.
  - External: `https://tsup.egoist.dev/` — tsup config reference for ESM + shebang.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm install` succeeds with all deps resolved and no peer dep errors.
  - [ ] `pnpm run build` produces `dist/index.js` with `#!/usr/bin/env node` shebang line.
  - [ ] `pnpm test` runs and passes at least one smoke test.
  - [ ] `pnpm run typecheck` passes with strict mode enabled.
  - [ ] `pnpm run lint` passes with Biome defaults.
  - [ ] All shared interface files exist in `src/types/` and are importable from other src modules.
  - [ ] `.gitignore` excludes node_modules, dist, .env, coverage, and .sisyphus/evidence.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Fresh install/build/test/lint all pass
    Tool: Bash
    Steps: run `pnpm install && pnpm run build && pnpm test && pnpm run lint && pnpm run typecheck`
    Expected: all commands exit 0; dist/index.js exists with shebang; test output shows at least 1 passing test
    Evidence: .sisyphus/evidence/task-1-bootstrap.txt

  Scenario: Built CLI is executable
    Tool: Bash
    Steps: run `node dist/index.js --help` (or just `node dist/index.js` if no --help yet)
    Expected: exits 0 without module resolution or permission errors; outputs to stderr only
    Evidence: .sisyphus/evidence/task-1-cli.txt
  ```

  **Commit**: YES | Message: `build(scaffold): bootstrap web3agent repo with deps and shared interfaces` | Files: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `tsup.config.ts`, `biome.json`, `vitest.config.ts`, `.gitignore`, `src/**`, `tests/**`

- [x] 2. Implement runtime config contracts, chain registry, and startup health model

  **What to do**: Implement the central typed config layer that every command and adapter uses. This task fills in the implementations for the interfaces defined in Task 1's `src/types/config.ts`, `src/types/health.ts`, and chain-related types.
  1. **Env parsing** (`src/config/env.ts`): Parse all env vars into a typed `RuntimeConfig` object using a single entry point. Variables: `CHAIN_ID` (default: 8453 = Base), `PRIVATE_KEY`, `MNEMONIC`, `WALLET_ACCOUNT_INDEX` (default: 0), `WALLET_ADDRESS_INDEX` (default: 0), `RPC_URL` (override for default chain only), `CONFIRM_WRITES` (default: true), `BLOCKSCOUT_MCP_URL` (default: `https://mcp.blockscout.com/mcp`), `ETHERSCAN_API_KEY`, `LIFI_API_KEY`, `ZEROX_API_KEY`, `COINGECKO_API_KEY`. Invalid values (e.g., non-numeric `CHAIN_ID`) must produce structured validation errors, not silent fallbacks.
  2. **Chain registry** (`src/chains/registry.ts`): Define all 17 supported chains with ID, name, viem chain object import, and native currency. Chains: mainnet (1), Base (8453), Arbitrum (42161), Optimism (10), Polygon (137), Linea (59144), BSC (56), Avalanche (43114), zkSync Era (324), Scroll (534352), Mode (34443), Blast (81457), Mantle (5000), Celo (42220), Gnosis (100), Sepolia (11155111), Base Sepolia (84532). Expose `getChainById(id)`, `getChainByName(name)`, `getAllChains()`, `isSupported(id)`.
  3. **Health model** (`src/config/health.ts`): Implement `StartupReport` with per-backend status (core, blockscout, evm, goat plugins). Distinguish required-core failures (fatal) from optional-backend failures (degraded). Provide `formatHealthSummary()` for stderr startup logging.
  4. **Wallet client factory** (`src/config/wallet-factory.ts`): Export a `createWalletClientForChain(account, chainId)` function that returns a viem `WalletClient` using the chain's default public transport (or `RPC_URL` override for the default chain). This factory is used by GOAT, LI.FI, and Orbs.

  **Must NOT do**: Do not leave env parsing scattered across individual tool files. Do not fail the entire server for optional backend outages. Do not remove `CHAIN_ID` — the spec uses default-chain + per-call override. Do not implement wallet persistence here (that's Task 4).

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Typed contract layer for the entire runtime.
  - Skills: [] — Standard runtime architecture.
  - Omitted: [`frontend-ui-ux`] — No visual work.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 5, 6, 7, 8, 9, 10 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:120-127` — Chain handling is per-call but a default chain (`CHAIN_ID`) is expected. `RPC_URL` overrides only the default chain transport.
  - Pattern: `FRAMEWORK.md:236-251` — Complete env var table with defaults and effects.
  - Pattern: `FRAMEWORK.md:210-212` — `server_status` must report loaded capabilities and confirmation mode.
  - Pattern: `REFERENCE.md:175-183` — Per-call chain model with wallet client factory pattern.
  - Pattern: `src/types/config.ts` (from Task 1) — Interface contracts to implement against.
  - Pattern: `src/types/health.ts` (from Task 1) — Health model interfaces.
  - External: `https://viem.sh/docs/clients/wallet` — Viem wallet client creation API.
  - External: `https://viem.sh/docs/chains` — Viem chain object imports.

  **Acceptance Criteria** (agent-executable only):
  - [ ] A single config module produces deterministic runtime settings from env vars and defaults.
  - [ ] The chain registry includes all 17 chains and exposes lookup by ID and name.
  - [ ] Invalid env values (non-numeric CHAIN_ID, unsupported chain, etc.) produce structured validation errors.
  - [ ] Optional backend failures are represented in typed startup health state, not unstructured strings.
  - [ ] `createWalletClientForChain()` returns a valid viem WalletClient for any supported chain.
  - [ ] Unit tests cover env precedence, invalid config rejection, chain lookup, and degraded-startup classification.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Default-chain config resolves predictably
    Tool: Bash
    Steps: run `pnpm test -- tests/config/runtime-config.test.ts`
    Expected: tests prove Base (8453) is the fallback default, CHAIN_ID overrides it, RPC_URL applies only to the chosen default chain
    Evidence: .sisyphus/evidence/task-2-config.txt

  Scenario: Invalid env input is rejected cleanly
    Tool: Bash
    Steps: run `CHAIN_ID=not-a-number pnpm test -- tests/config/runtime-config-invalid.test.ts`
    Expected: test asserts a structured validation error, not a silent fallback
    Evidence: .sisyphus/evidence/task-2-config-error.txt
  ```

  **Commit**: YES | Message: `feat(config): implement runtime contracts, chain registry, and health model` | Files: `src/config/**`, `src/chains/**`, `tests/config/**`, `tests/chains/**`

- [x] 3. Build host detection, safe config writing, and context installation for the four hosts

  **What to do**: Implement the `init` command foundations for Claude Code, Cursor, Windsurf, and OpenCode.
   1. **Host detection** (`src/hosts/detect.ts`): Check for project markers to identify the agent environment. Detection signals:
     - Claude Code: `~/.claude/` directory (user-level config home)
     - Cursor: `.cursor/` directory in project root
     - Windsurf: `.windsurf/` directory in project root, or `~/.codeium/windsurf/` user-level
     - OpenCode: `.opencode/` directory in project root
     Exit with a targeted error listing detected hosts if multiple are found and `--host` is not passed.
  2. **Config writers** (`src/hosts/writers/`): One writer per host, each implementing safe non-destructive merge. Canonical config file paths (aligned with MCP_REFERENCE.md examples):
     - **Claude Code**: Write to `~/.claude/mcp.json` (user-level, as per MCP_REFERENCE.md:21). JSON with `mcpServers` object. Proxy mode: single `web3agent` entry. Multi-server mode: `web3agent`, `blockscout`, `evm` entries. Note: if a project-level `.mcp.json` exists, prefer writing there instead — but default to user-level.
     - **Cursor**: Write to `.cursor/mcp.json` in project root (as per MCP_REFERENCE.md:64). Similar JSON structure.
     - **Windsurf**: Write to `~/.codeium/windsurf/mcp_config.json` (user-level, as per MCP_REFERENCE.md:114). JSON with `mcpServers`, note Windsurf uses `serverUrl` for SSE entries.
     - **OpenCode**: Write to `.opencode/config.json` in project root (as per MCP_REFERENCE.md:159). JSON with `mcp` key, entries use `type: "local"` for stdio servers and `type: "sse"` for SSE.
     All writers: parse existing file, merge only managed entries (keyed by server name `web3agent`/`blockscout`/`evm`), preserve unrelated config, create backup `.bak` file before modifying, deterministic JSON formatting (2-space indent, sorted keys within managed entries).
  3. **Context installation** (`src/hosts/context/`): Install context/rules guidance per host:
     - Claude Code: Write/update `CLAUDE.md` with `## Web3` section containing `WEB3_CONTEXT.md` content.
     - Cursor: Write `.cursor/rules/web3agent.mdc` with frontmatter (description, globs, alwaysApply: false).
     - Windsurf: Write `.windsurf/rules/web3agent.md` with routing guidance.
     - OpenCode: Append `## Web3` managed block to `AGENTS.md`.
     Idempotent: repeated runs update existing managed sections, never duplicate content.
  4. **CLI routing** (`src/cli/init.ts`): Parse `--host`, `--mode` (proxy|multi-server), `--project` (working directory), `--dry-run` flags. Wire into the detection + writer + context pipeline. Dry-run prints what would change without modifying files.
  5. **Fixtures** (`tests/fixtures/hosts/`): Create fixture directories simulating each host environment for deterministic testing.

  **Must NOT do**: Do not overwrite entire config files. Do not mutate user-global config for hosts that support project-local. Do not write host support for any host beyond the four listed. Do not use interactive prompts (env vars or flags only).

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: Safe file-generation/merge logic plus host-specific copy and compatibility rules.
  - Skills: [] — Host config writing is custom to this project.
  - Omitted: [`frontend-ui-ux`] — No frontend deliverable.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 10, 11 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:84-101` — `init` is responsible for host detection, env prompts, config writes, confirmation output. Shows config formats per host.
  - Pattern: `MCP_REFERENCE.md:17-36` — Claude Code config shape: `{ mcpServers: { blockscout: { type: "sse", url: "..." }, evm: { command: "npx", args: [...] } } }`.
  - Pattern: `MCP_REFERENCE.md:62-79` — Cursor config shape (similar to Claude).
  - Pattern: `MCP_REFERENCE.md:112-128` — Windsurf config shape: `~/.codeium/windsurf/mcp_config.json`, uses `serverUrl` instead of `url` for SSE entries.
  - Pattern: `MCP_REFERENCE.md:152-172` — OpenCode config shape: `opencode.json` with `mcp` key, `type: "sse"` and `type: "local"`.
  - Pattern: `MCP_REFERENCE.md:40-54` — Claude CLAUDE.md context example.
  - Pattern: `MCP_REFERENCE.md:82-105` — Cursor .mdc rules file example with frontmatter.
  - Pattern: `MCP_REFERENCE.md:130-147` — Windsurf rules file example.
  - Pattern: `MCP_REFERENCE.md:174-191` — OpenCode AGENTS.md example.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `init --dry-run` prints deterministic config/context changes for each supported host fixture.
  - [ ] `init` writes only managed entries/files/blocks and preserves unrelated config.
  - [ ] Multiple hosts detected → exit with targeted selection error unless `--host` supplied.
  - [ ] Repeated `init` runs are idempotent — managed sections update, never duplicate.
  - [ ] Backup `.bak` files are created before modifying existing config files.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Dry-run for Claude fixture
    Tool: Bash
    Steps: run `node dist/index.js init --host claude --mode proxy --project tests/fixtures/hosts/claude-project --dry-run`
    Expected: exits 0, prints .mcp.json and CLAUDE.md diff/summary, fixture files unchanged
    Evidence: .sisyphus/evidence/task-3-init-claude.txt

  Scenario: Ambiguous host detection fails safely
    Tool: Bash
    Steps: run `node dist/index.js init --project tests/fixtures/hosts/multi-host-project`
    Expected: exits non-zero with message listing detected hosts and asking for --host
    Evidence: .sisyphus/evidence/task-3-init-error.txt
  ```

  **Commit**: YES | Message: `feat(init): add host detection, config writers, and context installation` | Files: `src/hosts/**`, `src/cli/**`, `tests/hosts/**`, `tests/fixtures/hosts/**`

- [x] 4. Implement wallet persistence, confirmation queue, and wallet/utility tools

  **What to do**: Build the framework-owned wallet subsystem and confirmation layer, making it the single source of truth for active account state.
  1. **Wallet persistence** (`src/wallet/persistence.ts`):
     - Startup resolution order: `PRIVATE_KEY` env → `MNEMONIC` env → `~/.web3agent/wallet.json` → ephemeral read-only key.
     - File format: `{ type: "private-key", privateKey: "0x...", address: "0x..." }` or `{ type: "mnemonic", mnemonic: "...", accountIndex: 0, addressIndex: 0 }`.
     - File permissions: `0o600` (user read/write only), set via `fs.writeFile` options `{ mode: 0o600 }` to avoid TOCTOU race.
     - `wallet_activate`: Accepts private key or mnemonic, writes to `~/.web3agent/wallet.json`, hot-swaps active account, emits `wallet-changed` event.
     - `wallet_deactivate`: Deletes the persisted file, reverts to read-only mode, emits `wallet-changed` event.
     - Emit events so EVM adapter (Task 6) can respond to wallet changes.
  2. **Confirmation queue** (`src/wallet/confirmation.ts`):
     - In-memory queue (clears on restart — deliberate safety property).
     - Each `PendingOperation` has: unique ID, type, description, params, `createdAt` timestamp, TTL (default 30 minutes).
     - Write operations enqueue and return a human-readable summary + queue ID.
     - `transaction_confirm(id)`: Executes the queued operation. Warn if operation is stale (>TTL) but still execute.
     - `transaction_deny(id)`: Discards without executing.
     - `transaction_list()`: Shows all pending operations.
     - `wallet_set_confirmation(enabled)`: Runtime toggle.
     - `CONFIRM_WRITES=false` disables globally at startup.
     - What counts as a write: ETH transfers, token transfers/approvals, swaps, bridges, contract calls, `wallet_activate`, `wallet_deactivate`.
  3. **Wallet generation tools** (`src/tools/wallet/`): Five tools using viem primitives, no network calls:
     - `wallet_generate` → `{ address, privateKey, warning }` (warning: key returned once, never stored)
     - `wallet_generate_mnemonic` → `{ mnemonic, firstAddress, derivationPath, warning }`
     - `wallet_from_mnemonic` → `{ address, derivationPath }` (NO private key returned)
     - `wallet_derive_addresses` → batch derive 1-20 addresses from mnemonic
     - `wallet_get_active` → `{ address, chain, mode }` where mode is `"private-key"` | `"mnemonic"` | `"read-only"`
  4. **Utility tools** (`src/tools/utility/`):
     - `server_status` → wallet mode, active chain, which plugins loaded, confirmation mode, backend health
     - `list_supported_chains` → all 17 chains with IDs and names
  5. **MCP registration helpers** (`src/tools/register.ts`): Export functions to register these tools on the low-level `Server` instance with proper JSON Schema (converted from Zod via `zod-to-json-schema`).

  **Must NOT do**: Do not silently persist generated credentials (wallet_generate returns key but never stores it). Do not store backup copies of private keys on deactivation. Do not let write operations bypass confirmation when CONFIRM_WRITES is enabled. Do not use the high-level McpServer API — use the low-level Server with setRequestHandler.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Wallet handling and confirmation semantics are security-sensitive core behavior.
  - Skills: [] — Custom runtime work.
  - Omitted: [`frontend-ui-ux`] — No UI deliverable.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 6, 7, 8, 9, 10 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:130-140` — Wallet persistence path, file shape, precedence order, activate/deactivate behavior.
  - Pattern: `FRAMEWORK.md:144-152` — Confirmation queue semantics, opt-out mechanisms, what counts as a write.
  - Pattern: `FRAMEWORK.md:156-166` — Wallet generation tool list, warning requirements, derivation details.
  - Pattern: `FRAMEWORK.md:208-212` — Utility tool expectations for server_status and chain listing.
  - Pattern: `REFERENCE.md:119-144` — Detailed pending queue pattern, transaction_confirm/deny/list, opt-out via env and runtime toggle.
  - Pattern: `REFERENCE.md:148-170` — Wallet file shape, permissions model, startup resolution order, activate/deactivate flow.
  - Pattern: `src/types/wallet.ts` (from Task 1) — WalletState, PendingOperation, ConfirmationQueue interfaces.
  - External: `https://viem.sh/docs/accounts/local/privateKeyToAccount` — Private key account creation.
  - External: `https://viem.sh/docs/accounts/local/mnemonicToAccount` — Mnemonic/HD derivation.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Wallet file creation uses `{ mode: 0o600 }` and startup precedence is covered by tests.
  - [ ] All wallet and transaction-management tools are registered with correct behavior.
  - [ ] `server_status` reports wallet mode, confirmation state, active chain, and backend health placeholders.
  - [ ] Deactivation deletes the persisted wallet file without leaving backup secret artifacts.
  - [ ] Confirmation queue respects CONFIRM_WRITES env var and runtime toggle.
  - [ ] Stale operations (past TTL) warn but still execute on confirmation.
  - [ ] `wallet-changed` event is emitted on activate/deactivate for downstream adapter sync.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Wallet activate persists and reports correct mode
    Tool: Bash
    Steps: run `HOME=$(pwd)/tests/tmp/home-wallet pnpm test -- tests/wallet/wallet-persistence.test.ts`
    Expected: tests prove wallet_activate creates ~/.web3agent/wallet.json with 0o600 semantics and wallet_get_active reflects the persisted mode
    Evidence: .sisyphus/evidence/task-4-wallet.txt

  Scenario: Confirmation queue blocks write execution by default
    Tool: Bash
    Steps: run `pnpm test -- tests/wallet/confirmation-queue.test.ts`
    Expected: write actions enqueue pending operations and only execute after transaction_confirm
    Evidence: .sisyphus/evidence/task-4-wallet-queue.txt
  ```

  **Commit**: YES | Message: `feat(wallet): add persistence, confirmation queue, and wallet/utility tools` | Files: `src/wallet/**`, `src/tools/wallet/**`, `src/tools/utility/**`, `src/tools/register.ts`, `tests/wallet/**`

- [ ] 5. Implement the hosted Blockscout upstream adapter

  **What to do**: Build a dedicated upstream adapter for Blockscout using the MCP `Client` API.
  1. **Transport setup** (`src/upstream/blockscout/adapter.ts`): Connect to `https://mcp.blockscout.com/mcp` (overridable via `BLOCKSCOUT_MCP_URL` env var). Try `StreamableHTTPClientTransport` first; if it fails (connection error or unsupported), fall back to `SSEClientTransport` with a warning logged to stderr. Import paths:
     - `import { Client } from "@modelcontextprotocol/sdk/client/index.js"`
     - `import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"`
     - `import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"`
  2. **Bootstrap tool handling**: After connecting, call the `__unlock_blockchain_analysis__` tool automatically during adapter init. This is Blockscout's required bootstrap step. Do NOT expose this tool in the proxy surface.
  3. **Tool discovery and prefixing**: Fetch upstream tool list via `client.listTools()`. Filter out `__unlock_blockchain_analysis__`. Prefix remaining tool names with `blockscout_` (e.g., `get_address_info` → `blockscout_get_address_info`). Build a deterministic route map: `Map<string, { upstreamName: string, client: Client }>`.
  4. **Call routing**: When the proxy receives a `blockscout_*` call, strip prefix, forward to upstream client via `client.callTool({ name, arguments })`, return result verbatim.
  5. **Degradation**: If connection fails, mark Blockscout as degraded in runtime health and continue startup. Log the failure to stderr. Expose zero Blockscout tools but don't crash.
  6. **Adapter interface**: Implement the `UpstreamAdapter` interface from `src/types/upstream.ts` (from Task 1).

  **Expected Blockscout tools (15, after filtering bootstrap)**: `get_chains_list`, `get_address_by_ens_name`, `lookup_token_by_symbol`, `get_contract_abi`, `inspect_contract_code`, `get_address_info`, `get_tokens_by_address`, `get_block_number`, `get_transactions_by_address`, `get_token_transfers_by_address`, `nft_tokens_by_address`, `get_block_info`, `get_transaction_info`, `read_contract`, `direct_api_call`.

  **Must NOT do**: Do not depend on a Python subprocess. Do not expose `__unlock_blockchain_analysis__` as a user-facing tool. Do not fail the whole runtime because Blockscout is unavailable. Do not modify upstream tool descriptions (proxy them verbatim with prefix).

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Transport/client integration with routing and degradation behavior.
  - Skills: [] — Custom adapter work.
  - Omitted: [`frontend-ui-ux`] — No UI involvement.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 10 | Blocked By: 1, 2

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:52-58` — Blockscout provides indexed history, verified ABIs, tx history, NFT metadata.
  - Pattern: `FRAMEWORK.md:70-78` — Proxy architecture requirement and routing strategy.
  - Pattern: `MCP_REFERENCE.md:9` — Blockscout is hosted SSE at `https://mcp.blockscout.com/mcp`.
  - Pattern: `src/types/upstream.ts` (from Task 1) — `UpstreamAdapter`, `AdapterHealth`, `PrefixedTool` interfaces.
  - Research finding: Blockscout MCP exposes 16 tools. `__unlock_blockchain_analysis__` is a bootstrap tool that must be auto-called then filtered.
  - Research finding: SSEClientTransport is deprecated in SDK 1.27.1. StreamableHTTPClientTransport is the replacement. Fallback to SSE if needed.
  - External: `https://docs.blockscout.com/devs/mcp-server` — Official hosted MCP docs and tool descriptions.
  - External: `https://github.com/modelcontextprotocol/typescript-sdk` — Client transport APIs (Client, StreamableHTTPClientTransport, SSEClientTransport).

  **Acceptance Criteria** (agent-executable only):
  - [ ] The adapter exposes 15 prefixed Blockscout tools and stores a route map for the proxy layer.
  - [ ] `__unlock_blockchain_analysis__` is called during init and NOT re-exposed as a proxied tool.
  - [ ] Connection failures mark Blockscout as degraded without crashing the local runtime.
  - [ ] Integration tests cover both successful mocked connection and unavailable-endpoint degradation.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Adapter loads and prefixes upstream tools
    Tool: Bash
    Steps: run `pnpm test -- tests/upstream/blockscout-adapter.test.ts`
    Expected: tests assert exposed names are prefixed with blockscout_, route-map entries exist, bootstrap tool is filtered out
    Evidence: .sisyphus/evidence/task-5-blockscout.txt

  Scenario: Unreachable Blockscout degrades instead of crashing
    Tool: Bash
    Steps: run `BLOCKSCOUT_MCP_URL=https://127.0.0.1:9 pnpm test -- tests/upstream/blockscout-degraded.test.ts`
    Expected: runtime health marks Blockscout unavailable; startup remains successful with zero Blockscout tools
    Evidence: .sisyphus/evidence/task-5-blockscout-error.txt
  ```

  **Commit**: YES | Message: `feat(blockscout): add hosted upstream adapter with transport fallback` | Files: `src/upstream/blockscout/**`, `tests/upstream/blockscout*.test.ts`

- [ ] 6. Implement the managed EVM MCP subprocess adapter and wallet-sync lifecycle

  **What to do**: Build the EVM adapter as a managed local subprocess.
  1. **Subprocess management** (`src/upstream/evm/adapter.ts`): Spawn `npx -y @mcpdotdirect/evm-mcp-server` as a child process. Connect via `StdioClientTransport` from `@modelcontextprotocol/sdk/client/stdio.js`. Import: `import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"`.
  2. **Env var mapping**: The EVM MCP uses different env var names than the framework:
     - Framework `PRIVATE_KEY` → EVM subprocess `EVM_PRIVATE_KEY`
     - Framework `MNEMONIC` → EVM subprocess `EVM_MNEMONIC`
     - Framework `WALLET_ACCOUNT_INDEX` → EVM subprocess `EVM_ACCOUNT_INDEX`
     - Pass through: `ETHERSCAN_API_KEY`
     Do NOT pass the full parent environment — explicitly whitelist only needed vars.
  3. **Tool discovery and prefixing**: Fetch upstream tool list via `client.listTools()`. Prefix with `evm_` (e.g., `get_balance` → `evm_get_balance`). Build route map. EVM MCP exposes 25 tools; also has 10 prompts but we do NOT proxy prompts in this version.
  4. **Wallet-sync lifecycle**: Listen for `wallet-changed` events from the wallet subsystem (Task 4). When the active wallet changes:
     - Close existing MCP client connection
     - Kill subprocess
     - Restart subprocess with updated env vars reflecting the new wallet state
     - Re-fetch tool list (should be the same but re-validate)
     - Update health metadata (restart count, last restart timestamp)
  5. **Read-only mode**: When no wallet is configured, start the subprocess without `EVM_PRIVATE_KEY`/`EVM_MNEMONIC`. EVM MCP still works for read operations (balances, contract reads, etc.).
  6. **Cleanup**: Register `process.on('exit')` and `process.on('SIGTERM')` handlers to kill the subprocess. Also call `client.close()` to cleanly disconnect. Track subprocess PID for debugging.
  7. **Health reporting**: Expose restart count, PID, uptime, and wallet sync status via `AdapterHealth`.

  **Must NOT do**: Do not treat EVM as fire-and-forget — must restart on wallet change. Do not allow stale wallet credentials after activation/deactivation. Do not pass full parent environment to subprocess. Do not proxy EVM MCP prompts. Do not log secrets to stderr.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Subprocess lifecycle, env hygiene, and runtime synchronization are failure-prone.
  - Skills: [] — Standard Node process/orchestration work.
  - Omitted: [`git-master`] — Version control is not the core problem.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 10 | Blocked By: 1, 2, 4

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:62-66` — EVM MCP provides live state and general contract read capability.
  - Pattern: `FRAMEWORK.md:130-140` — Wallet persistence model; canonical inside the framework.
  - Pattern: `src/types/upstream.ts` (from Task 1) — `UpstreamAdapter`, `AdapterHealth` interfaces.
  - Pattern: `src/wallet/persistence.ts` (from Task 4) — Wallet-changed event pattern.
  - Research finding: EVM MCP v2.0.4, invoked via `npx -y @mcpdotdirect/evm-mcp-server`, env vars are `EVM_PRIVATE_KEY`/`EVM_MNEMONIC`/`EVM_ACCOUNT_INDEX` (NOT bare `PRIVATE_KEY`).
  - Research finding: Subprocess-only — no programmatic API. Must use StdioClientTransport.
  - Research finding: 25 tools (wallet info, network, ENS, blocks, txs, balances, tokens, contracts, multicall, transfers, NFTs, signing). 10 prompts (not proxied).
  - External: `https://www.npmjs.com/package/@mcpdotdirect/evm-mcp-server` — Package docs.
  - External: `https://github.com/mcpdotdirect/evm-mcp-server` — Source and env var documentation.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Runtime starts EVM adapter in read-only mode with no configured wallet.
  - [ ] Wallet activation/deactivation triggers adapter restart with updated env vars.
  - [ ] Adapter exposes 25 prefixed tools and health metadata without leaking secrets into logs.
  - [ ] Subprocess is killed on parent process exit (no zombies).
  - [ ] Integration tests cover startup, restart-on-wallet-change, and degraded subprocess failure.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Read-only EVM adapter starts cleanly
    Tool: Bash
    Steps: run `pnpm test -- tests/upstream/evm-adapter-readonly.test.ts`
    Expected: subprocess starts without wallet credentials; exposes read-safe prefixed tools
    Evidence: .sisyphus/evidence/task-6-evm.txt

  Scenario: Wallet change forces adapter refresh
    Tool: Bash
    Steps: run `pnpm test -- tests/upstream/evm-adapter-wallet-refresh.test.ts`
    Expected: wallet-changed event causes subprocess reinit/restart with updated env; health metadata reflects restart
    Evidence: .sisyphus/evidence/task-6-evm-refresh.txt
  ```

  **Commit**: YES | Message: `feat(evm): add managed subprocess adapter with wallet sync` | Files: `src/upstream/evm/**`, `tests/upstream/evm*.test.ts`

- [ ] 7. Implement the chain-aware GOAT provider and tiered plugin loading

  **What to do**: Wrap GOAT's `getOnChainTools()` behind a framework-owned provider that supports per-call chain selection.
  1. **Plugin registry** (`src/goat/plugins.ts`): Define the tiered plugin loading:
     - **Tier 0 (always loaded)**: `@goat-sdk/plugin-erc20` (with USDC/USDT/WETH/DAI token list), `@goat-sdk/plugin-erc721`, `@goat-sdk/plugin-ens`, `@goat-sdk/plugin-dexscreener`, `@goat-sdk/plugin-coingecko`
     - **Tier 1 (wallet configured)**: `@goat-sdk/plugin-uniswap`, `@goat-sdk/plugin-balancer`
     - **Tier 2 (specific API keys)**: `@goat-sdk/plugin-0x` (requires `ZEROX_API_KEY`)
     Wrap each plugin constructor in `try/catch` — if a plugin fails to init, skip it silently, log to stderr, and record in health.
  2. **Chain-aware caching** (`src/goat/provider.ts`): For each supported chain, create a GOAT tool snapshot via `getOnChainTools({ wallet: viem(walletClient), plugins })` where `walletClient` is created via the `createWalletClientForChain()` factory (from Task 2). Cache the `{ listOfTools, toolHandler }` result per chain. When no wallet is configured, use a per-session ephemeral private key (`generatePrivateKey()` from viem) to satisfy GOAT's wallet requirement.
  3. **Per-call chain dispatch** (`src/goat/dispatch.ts`): The public tool surface is the union of tool names across all cached chains. Register them as framework tools that add an optional `chainId` parameter. When called:
     - Resolve `chainId` from the call parameter, falling back to the default chain from config.
     - Look up the cached handler for that chain.
     - If the tool is unavailable on the requested chain (e.g., Uniswap not on Linea), return a structured error: `{ error: "TOOL_UNAVAILABLE_ON_CHAIN", message: "uniswap_swap is not available on Linea (59144). Available on: Ethereum, Polygon, Avalanche, Base, Optimism, Zora, Arbitrum, Celo." }`
  4. **Chain restrictions matrix**: Embed the researched chain support:
     - Uniswap: mainnet (1), Polygon (137), Avalanche (43114), Base (8453), Optimism (10), Zora, Arbitrum (42161), Celo (42220)
     - Balancer: Mode (34443), Base (8453), Polygon (137), Gnosis (100), Arbitrum (42161), Avalanche (43114), Optimism (10), Polygon zkEVM, Fraxtal
     - ERC-20/ERC-721/ENS: all chains
     - DexScreener/CoinGecko: all chains (data APIs, chain-agnostic)
  5. **JSON Schema passthrough**: GOAT's `listOfTools()` returns JSON Schema for tool parameters. Since we use the low-level `Server` API, pass these schemas through directly — no Zod conversion needed. Add the optional `chainId` property to each schema.

  **Must NOT do**: Do not expose raw GOAT tool schemas without the framework-level `chainId` parameter. Do not assume every plugin supports every chain. Do not crash startup because one plugin fails to init. Do not convert JSON Schema to Zod and back.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Reconciles GOAT's fixed-chain adapters with framework's per-call model.
  - Skills: [] — Careful custom adapter logic.
  - Omitted: [`git-master`] — No git-specialized work.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 10 | Blocked By: 1, 2, 4

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:104-117` — GOAT adapter is the core of custom tools, JSON Schema → MCP wiring, capability tiers.
  - Pattern: `FRAMEWORK.md:120-127` — Chain handling is per-call with default chain.
  - Pattern: `REFERENCE.md:29-34` — GOAT's MCP adapter shape: `getOnChainTools()` → `{ listOfTools, toolHandler }`.
  - Research finding: GOAT adapter v0.2.11, uses `zod-to-json-schema` internally. `listOfTools()` returns `{ name, description, inputSchema: JSONSchema7 }[]`. `toolHandler(name, params)` returns MCP-compatible result.
  - Research finding: GOAT requires wallet client even for read-only — use ephemeral key via `generatePrivateKey()`.
  - Research finding: Uniswap supports 8 chains (mainnet, polygon, avalanche, base, optimism, zora, arbitrum, celo). Balancer supports 9 chains (mode, base, polygon, gnosis, arbitrum, avalanche, optimism, polygonZkEvm, fraxtal).
  - External: `https://github.com/goat-sdk/goat/tree/master/typescript/packages/adapters/model-context-protocol/src/index.ts` — Adapter source code.
  - External: `https://github.com/goat-sdk/goat/tree/master/typescript/examples/by-framework/model-context-protocol` — MCP integration examples.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Framework-wrapped GOAT tools accept optional `chainId` and dispatch to correct cached chain handler.
  - [ ] Unsupported chain/plugin combos return structured error listing available chains, not crash.
  - [ ] Tier loading obeys wallet/API-key gates and silently skips plugin init failures with health reporting.
  - [ ] Ephemeral key is used for read-only mode; GOAT tools still function for reads.
  - [ ] Tests cover cross-chain dispatch and unavailable-plugin error path.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Wrapped GOAT tools dispatch by chainId
    Tool: Bash
    Steps: run `pnpm test -- tests/goat/chain-aware-provider.test.ts`
    Expected: same public tool routes to different cached handlers when chainId changes
    Evidence: .sisyphus/evidence/task-7-goat.txt

  Scenario: Unsupported chain/plugin returns clear error
    Tool: Bash
    Steps: run `pnpm test -- tests/goat/chain-unavailable.test.ts`
    Expected: deterministic "not available on chain" error for excluded plugin/chain pair, listing available chains
    Evidence: .sisyphus/evidence/task-7-goat-error.txt
  ```

  **Commit**: YES | Message: `feat(goat): add chain-aware provider with tiered plugin loading` | Files: `src/goat/**`, `tests/goat/**`

- [ ] 8. Implement LI.FI cross-chain tools on the framework wallet/confirmation model

  **What to do**: Add a dedicated LI.FI integration layer, separate from GOAT.
  1. **SDK configuration** (`src/lifi/config.ts`): Configure LI.FI with the framework's wallet:
     ```typescript
     import { createConfig, EVM } from '@lifi/sdk'

     createConfig({
       integrator: 'web3agent',
       apiKey: process.env.LIFI_API_KEY, // optional
       providers: [
         EVM({
           getWalletClient: async () => currentWalletClient,
           switchChain: async (chainId: number) => {
             // MUST create a fresh wallet client — never reuse across chains
             return createWalletClientForChain(account, chainId)
           },
         }),
       ],
     })
     ```
     The `switchChain` callback must always return a NEW `createWalletClient()` call. Never cache or reuse wallet clients across chains.
  2. **Tools** (`src/tools/lifi/`): Three MCP tools:
     - `lifi_get_chains` — always available, returns list of LI.FI supported chains. Read-only.
     - `lifi_get_quote` — available when wallet configured. Uses `getQuote()` (single best route, not `getRoutes()`). Parameters: `fromChainId`, `toChainId`, `fromTokenAddress`, `toTokenAddress`, `fromAmount`. Returns **trimmed summary only**: source/destination chains, amount in/out (human-readable + USD), estimated time, bridge/DEX path summary, fees, and `toAmountMin`. Never return the full route object.
     - `lifi_execute_bridge` — write operation, gated by confirmation queue. Creates a `PendingOperation` with the route summary. On confirmation, calls `executeRoute()` with an `updateRouteHook` callback that logs progress to stderr. Cross-chain routes can take minutes — the tool call blocks until completion.
  3. **Chain-aware wallet factory**: Use `createWalletClientForChain()` from Task 2's config module for `switchChain`. LI.FI calls `switchChain` internally when signing on a different chain during multi-step routes.

  **Must NOT do**: Do not register LI.FI through GOAT. Do not return raw LI.FI route objects (they bloat context). Do not execute bridges directly when confirmation layer is enabled. Do not use `getRoutes()` for `lifi_get_quote` — use `getQuote()` for simplicity.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Multi-chain execution, wallet-factory coordination, and response trimming.
  - Skills: [] — Library-specific integration work.
  - Omitted: [`frontend-ui-ux`] — No visual surface.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 10 | Blocked By: 1, 2, 4

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:170-180` — LI.FI is a custom direct integration, NOT a GOAT plugin. switchChain must return fresh client. Route objects must be trimmed.
  - Pattern: `REFERENCE.md:47-58` — Server-side provider setup, blocking route execution, trimmed summary expectations.
  - Research finding: `@lifi/sdk@3.15.6`. Node.js compatible with raw viem wallet clients. `createConfig({ integrator, providers: [EVM({ getWalletClient, switchChain })] })`. Use `getQuote()` for single best route (simpler than `getRoutes()`).
  - Research finding: Route trimmed fields: `fromAmount`, `fromAmountUSD`, `toAmount`, `toAmountUSD`, `toAmountMin`, `gasCostUSD`, `steps`, `tags` (FASTEST/CHEAPEST).
  - Research finding: `executeRoute(route, { updateRouteHook })` blocks until complete. Progress via `route.steps[0].execution`.
  - External: `https://docs.li.fi/integrate-li.fi-sdk/get-a-quote-and-execute-it` — LI.FI SDK docs.
  - External: `https://github.com/lifinance/sdk/blob/main/examples/node/examples/bridge.ts` — Node.js bridge example.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `lifi_get_chains` is always available; `lifi_get_quote` and `lifi_execute_bridge` appear only in wallet-backed mode.
  - [ ] Quote responses are trimmed to decision-useful fields (amounts, fees, time, path summary). No raw route objects.
  - [ ] Bridge execution routes through the confirmation queue; uses fresh chain-specific wallet client on `switchChain`.
  - [ ] Tests cover multi-chain quote path and confirmation-gated bridge path (with mocked LI.FI SDK).

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: LI.FI quote returns trimmed multi-chain summary
    Tool: Bash
    Steps: run `pnpm test -- tests/lifi/lifi-quote.test.ts`
    Expected: returned payload includes only summary fields; uses expected source/destination chain metadata
    Evidence: .sisyphus/evidence/task-8-lifi.txt

  Scenario: Bridge execution is gated by confirmation
    Tool: Bash
    Steps: run `pnpm test -- tests/lifi/lifi-confirmation.test.ts`
    Expected: lifi_execute_bridge creates pending operation; only executes after transaction_confirm
    Evidence: .sisyphus/evidence/task-8-lifi-queue.txt
  ```

  **Commit**: YES | Message: `feat(lifi): add cross-chain quote and bridge execution tools` | Files: `src/lifi/**`, `src/tools/lifi/**`, `tests/lifi/**`

- [ ] 9. Implement Orbs unified integration: Liquidity Hub, dTWAP, dLIMIT, and gated dSLTP

  **What to do**: Integrate all four Orbs products using their respective SDKs.
  1. **Liquidity Hub** (`src/orbs/liquidity-hub.ts`): Uses `@orbs-network/liquidity-hub-sdk`.
     - `const sdk = constructSDK({ partner: "web3agent", chainId })` — create per-chain SDK instances.
     - **Chain availability**: Liquidity Hub only works on 6 of the framework's 17 chains: Polygon (137), BSC (56), Base (8453), Linea (59144), Blast (81457), Arbitrum (42161). Other chains must return a clear "Liquidity Hub not available on this chain" error.
     - Tools:
       - `orbs_get_quote` — Read-only, available without wallet. Calls `sdk.getQuote({ fromToken, toToken, inAmount, slippage })`. Returns trimmed summary: inToken, outToken, inAmount, outAmount, minAmountOut, exchange. Chaingate: only on supported chains.
       - `orbs_swap` — Write operation, wallet required, confirmation-gated. Requires EIP-712 signing of the quote. Flow: get quote → sign eip712 data → `sdk.swap(quote, signature)`.
  2. **dTWAP + dLIMIT** (`src/orbs/twap.ts`): Uses `@orbs-network/twap-sdk`.
     - `const twapSDK = constructSDK({ config })` where config comes from the twap-sdk's built-in configs for each chain/exchange pair.
     - **Config loading**: Load config from `@orbs-network/twap-sdk` package's exported configs. Map framework chain IDs to available exchange adapters. Bundle a snapshot of supported chain/exchange pairs.
     - Tools:
       - `orbs_place_twap` — Write, confirmation-gated. Uses `twapSDK.derivedSwapValues()` to compute chunk sizes from human-readable inputs, then `twapSDK.prepareOrderArgs()` to get contract call params. Requires ERC-20 approval first. Enqueues into confirmation queue with summary: source/dest tokens, chunk size, number of chunks, fill delay, total duration, deadline.
       - `orbs_place_limit` — Write, confirmation-gated. Same SDK, `chunks=1` and non-zero `dstMinAmount`. Summary includes: limit price, expiry, token pair.
       - `orbs_list_orders` — Read-only, wallet required. Uses `twapSDK.getOrders(account)` to fetch open orders via Lens contract.
     - **Supported chains**: Per configs.json — Ethereum, Polygon, Arbitrum, Base, BSC, Fantom, zkSync, Linea, Sonic, and more. Verify availability per chain/exchange pair.
  3. **dSLTP** (`src/orbs/dsltp.ts`): Feature-gated.
     - dSLTP is a separate protocol from Liquidity Hub, with unclear SDK status.
     - Gate: Only implement if during this task's execution, the `@orbs-network/liquidity-hub-sdk` or a separate dSLTP package provides validated stop-loss/take-profit functions.
     - If validated: implement `orbs_place_stop_loss` and `orbs_place_take_profit` tools, both write/confirmation-gated.
     - If NOT validated: omit dSLTP tools entirely. Surface the omission in `server_status` under a `dsltp: "unavailable — SDK not validated"` field.
     - Do NOT create placeholder/fake tools.
  4. **Per-chain availability** (`src/orbs/chains.ts`): Create a chain-availability registry that maps each Orbs product to its supported chains. Tools called on unsupported chains return structured errors listing available chains.
  5. **Approval helper** (`src/orbs/approval.ts`): dTWAP/dLIMIT require ERC-20 approval before `ask()`. Create a helper that checks current allowance and, if insufficient, creates an approval `PendingOperation` in the confirmation queue before the order operation.

  **Must NOT do**: Do not fake dSLTP with placeholder tools. Do not bypass approval or confirmation semantics for Orbs writes. Do not call Orbs tools on unsupported chains — return structured error. Do not use raw contract calls for TWAP — use `@orbs-network/twap-sdk`.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Multi-SDK integration with chain gating and feature flags.
  - Skills: [] — Specialized Web3 protocol integration.
  - Omitted: [`git-master`] — No version control work.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 10 | Blocked By: 1, 2, 4

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:184-204` — Four Orbs products, gating expectations, Liquidity Hub SDK, dTWAP contract interaction, dSLTP uncertainty.
  - Pattern: `REFERENCE.md:68-116` — Integration approach summary table, SDK vs contract methods, quote/swap patterns.
  - Research finding: `@orbs-network/liquidity-hub-sdk@1.0.74` — zero deps, Node.js compatible. `constructSDK({ partner, chainId })` → `getQuote()`, `swap()`. Supported chains: Polygon, BSC, Fantom, Base, Linea, Blast, Polygon zkEVM, Sonic, Arbitrum.
  - Research finding: `@orbs-network/twap-sdk@2.7.29` — proper SDK with `constructSDK()`, `derivedSwapValues()`, `prepareOrderArgs()`, `getOrders()`. Uses config objects per chain/exchange.
  - Research finding: dSLTP is a separate protocol, NOT part of Liquidity Hub v2. No confirmed standalone SDK. Keep feature-gated.
  - Research finding: TWAP `ask()` signature: `ask({ exchange, srcToken, dstToken, srcAmount, srcBidAmount, dstMinAmount, deadline, bidDelay, fillDelay, data })` → returns `uint64 id`.
  - Research finding: Lens contract: `makerOrders(address)` → `Order[]`, `hasAllowance(token, maker, amount)` → `bool`.
  - External: `https://github.com/orbs-network/liquidity-hub-sdk` — Liquidity Hub SDK source.
  - External: `https://github.com/orbs-network/twap` — TWAP SDK, configs.json, ABI, Lens references.
  - External: `https://docs.orbs.network/v3/protocols/dsltp-protocol` — dSLTP protocol documentation (for validation).

  **Acceptance Criteria** (agent-executable only):
  - [ ] `orbs_get_quote` works on supported chains; returns structured error on unsupported chains.
  - [ ] dTWAP and dLIMIT use `@orbs-network/twap-sdk` with correct `derivedSwapValues()` + `prepareOrderArgs()` flow.
  - [ ] All write operations (swap, place_twap, place_limit) route through confirmation queue.
  - [ ] dSLTP tools only appear when validation passes; otherwise `server_status` reports omission.
  - [ ] `orbs_list_orders` returns open orders via Lens contract for active wallet.
  - [ ] Tests cover quote on supported/unsupported chain, write gating, and dSLTP feature-flag omission.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Orbs quote on supported vs unsupported chain
    Tool: Bash
    Steps: run `pnpm test -- tests/orbs/orbs-quote.test.ts`
    Expected: quote succeeds on Base (8453); returns structured "not available" error on Ethereum mainnet (1)
    Evidence: .sisyphus/evidence/task-9-orbs.txt

  Scenario: dSLTP stays hidden when validation absent
    Tool: Bash
    Steps: run `pnpm test -- tests/orbs/orbs-dsltp-flag.test.ts`
    Expected: dSLTP tools do not register unless validation flag is enabled; server_status reports omission
    Evidence: .sisyphus/evidence/task-9-orbs-flag.txt
  ```

  **Commit**: YES | Message: `feat(orbs): add Liquidity Hub, TWAP/dLIMIT, and gated dSLTP` | Files: `src/orbs/**`, `src/tools/orbs/**`, `tests/orbs/**`

- [x] 10. Assemble the proxy runtime and single-binary CLI contract

  **What to do**: Build the actual runtime entrypoint that stitches together every subsystem.
  1. **CLI routing** (`src/index.ts`): The main entry point routes between two modes:
     - `web3agent init [--host] [--mode] [--project] [--dry-run]` → runs the init flow from Task 3.
     - `web3agent` (no subcommand) → starts the MCP stdio server (proxy mode).
     - `web3agent --help` → prints usage summary to stderr.
     - `web3agent --version` → prints package version to stderr.
  2. **Proxy runtime** (`src/runtime/server.ts`): Create a low-level MCP `Server` instance:
     ```typescript
     import { Server } from "@modelcontextprotocol/sdk/server/index.js"
     import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
     import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js"
     ```
     Wire up handlers:
     - `ListToolsRequestSchema` handler: Aggregate tool lists from all sources:
       a. Custom tools (wallet, utilities) — always present
       b. GOAT tools (from Task 7's chain-aware provider) — filtered by tier
       c. Blockscout tools (from Task 5's adapter) — prefixed, if connected
       d. EVM tools (from Task 6's adapter) — prefixed, if running
       e. LI.FI tools (from Task 8) — filtered by wallet availability
       f. Orbs tools (from Task 9) — filtered by wallet + chain
       Return the merged list with deterministic ordering (custom → GOAT → Blockscout → EVM → LI.FI → Orbs).
     - `CallToolRequestSchema` handler: Route by tool name:
       a. `blockscout_*` → Blockscout adapter client
       b. `evm_*` → EVM adapter client
       c. GOAT tools → GOAT provider's toolHandler
       d. `lifi_*` → LI.FI handler
       e. `orbs_*` → Orbs handler
       f. `wallet_*`, `transaction_*`, `server_status`, `list_supported_chains` → framework tools
       Unknown tool → return `{ content: [{ type: "text", text: "Unknown tool" }], isError: true }`.
  3. **Startup sequence** (`src/runtime/startup.ts`):
     a. Parse config (Task 2)
     b. Initialize wallet state (Task 4)
     c. Start Blockscout adapter (async, degraded OK) (Task 5)
     d. Start EVM adapter (async, degraded OK) (Task 6)
     e. Initialize GOAT provider (Task 7)
     f. Initialize LI.FI (Task 8)
     g. Initialize Orbs (Task 9)
     h. Log startup summary to stderr: loaded tools count, active backends, wallet mode, confirmation state, any degraded services.
     i. Connect stdio transport.
  4. **Tool list refresh**: When wallet changes cause the tool surface to change (e.g., Tier 1 tools appear/disappear), send a `notifications/tools/list_changed` notification via the Server's notification mechanism so the host refreshes.
  5. **Stdout discipline**: NEVER write to stdout except through the MCP transport. All logs, warnings, startup messages go to stderr.

  **Must NOT do**: Do not write to stdout outside MCP wire traffic. Do not expose upstream prompts/resources as tools. Do not make proxy mode mandatory when user selects multi-server fallback in init. Do not block startup waiting for optional backends — start serving with what's available.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: Stitches every runtime subsystem and sets the final public contract.
  - Skills: [] — Custom runtime assembly.
  - Omitted: [`frontend-ui-ux`] — No frontend scope.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: 11 | Blocked By: 3, 5, 6, 7, 8, 9

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:11-17` — Same binary supports runtime and init modes.
  - Pattern: `FRAMEWORK.md:70-78` — Proxy architecture, tool routing, manual aggregation.
  - Pattern: `FRAMEWORK.md:280-284` — Tool list includes all three capability sources when available.
  - Pattern: `REFERENCE.md:23-25` — stdout is MCP wire only; logs to stderr.
  - Research finding: Low-level Server API: `server.setRequestHandler(ListToolsRequestSchema, handler)` and `server.setRequestHandler(CallToolRequestSchema, handler)`. No McpServer.
  - Research finding: MCP SDK v1.27.1 has `Server.sendNotification()` for list_changed notifications.
  - All upstream adapter implementations from Tasks 5-9.
  - External: `https://github.com/modelcontextprotocol/typescript-sdk` — Server API, transport, notification patterns.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `node dist/index.js` starts a valid stdio MCP server with aggregated tool list.
  - [ ] `node dist/index.js init` routes into the host config flow with `--host`, `--mode`, `--dry-run`.
  - [ ] Runtime logs emitted to stderr only; no stdout corruption.
  - [ ] Wallet-driven tool-surface changes trigger list_changed notification.
  - [ ] Startup succeeds with reduced toolset when optional backends are offline.
  - [ ] Tool routing dispatches to correct handler based on tool name prefix/registry.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Proxy runtime starts with aggregated tools
    Tool: Bash
    Steps: run `pnpm test -- tests/runtime/proxy-runtime.test.ts`
    Expected: runtime exposes custom + GOAT + prefixed blockscout/evm tools through one MCP server
    Evidence: .sisyphus/evidence/task-10-proxy.txt

  Scenario: Optional backend outage allows startup
    Tool: Bash
    Steps: run `pnpm test -- tests/runtime/proxy-degraded.test.ts`
    Expected: startup succeeds with reduced toolset; server_status reflects missing backends
    Evidence: .sisyphus/evidence/task-10-proxy-degraded.txt
  ```

  **Commit**: YES | Message: `feat(runtime): assemble proxy server and CLI entrypoint` | Files: `src/index.ts`, `src/runtime/**`, `tests/runtime/**`

- [x] 11. Ship WEB3_CONTEXT.md, complete the release matrix, and harden publish readiness

  **What to do**: Finalize the package for release.
  1. **WEB3_CONTEXT.md** (`WEB3_CONTEXT.md` at package root): Author the context file matching actual routing behavior:
     ```markdown
     ## Active MCPs (via web3agent proxy)

     All tools are accessible through a single `web3agent` MCP server entry.

     ### Tool Routing Guide

     **Blockscout tools** (prefixed `blockscout_`): indexed history, verified ABIs, tx history,
     token transfers, NFT metadata, contract source, address search. Works on 3000+ chains.

     **EVM tools** (prefixed `evm_`): live on-chain state — current balances, contract reads,
     gas estimation, ENS resolution, multicall, signing. Writes require configured wallet.

     **Web3 tools** (wallet, DeFi, market data):
     - Wallet: generate, activate, deactivate, get_active, derive addresses
     - DeFi: Uniswap/Balancer swaps (via GOAT), LI.FI cross-chain bridging
     - Market data: DexScreener, CoinGecko (no API key required)
     - Advanced orders: Orbs Liquidity Hub (same-chain aggregated swaps),
       dTWAP (time-weighted), dLIMIT (limit orders)
     - Utilities: server_status, list_supported_chains, transaction management

     ### Chain Selection
     Default chain: Base (8453). Override per-call with `chainId` parameter.
     Supported: Ethereum, Base, Arbitrum, Optimism, Polygon, Linea, BSC,
     Avalanche, zkSync Era, Scroll, Mode, Blast, Mantle, Celo, Gnosis,
     Sepolia, Base Sepolia.
     ```
     Adjust content based on actual tool names and availability from Tasks 5-10.
  2. **End-to-end tests** (`tests/e2e/`):
     - Host fixture matrix: test `init` output for all 4 hosts × both modes (proxy + multi-server).
     - Tarball contents: verify `pnpm pack` output includes `dist/**`, `package.json`, `WEB3_CONTEXT.md`.
     - CLI smoke: `node dist/index.js --help`, `node dist/index.js --version`.
     - Executable: verify shebang line exists in `dist/index.js`.
  3. **CI** (`.github/workflows/ci.yml`):
     - Trigger on push/PR.
     - Matrix: Node 18.x on ubuntu-latest.
     - Steps: `pnpm install`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`, `pnpm pack`.
     - Also test: `npm install` from the packed tarball to verify it works for end users who use npm.
     - No auto-publish — manual `npm publish` by the user.
  4. **README.md**: Create a minimal README with: package description, install command (`npx web3agent init`), usage (`npx web3agent`), env var table, supported hosts, supported chains. Not docs — just enough for npm/GitHub landing page.

  **Must NOT do**: Do not promise dSLTP if it wasn't validated. Do not silently omit WEB3_CONTEXT.md from tarball. Do not add auto-publish CI. Do not mention hosts beyond the four supported.

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: Context authoring, fixture documentation, packaging, CI, README.
  - Skills: [] — No special local skill required.
  - Omitted: [`frontend-ui-ux`] — No interface work.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: none | Blocked By: 10

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:216-233` — WEB3_CONTEXT.md purpose and routing guidance content.
  - Pattern: `FRAMEWORK.md:305-310` — Package quality expectations: install, build, pack, tarball contents.
  - Pattern: `MCP_REFERENCE.md:220-254` — Validation prompts and chain ID table for reference.
  - All tool names and routing from Tasks 5-10.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `WEB3_CONTEXT.md` ships in the tarball and matches actual routing behavior.
  - [ ] CI runs install/lint/typecheck/build/test/pack on Node 18 and fails on errors.
  - [ ] E2E fixture tests cover proxy and multi-server init for all four hosts.
  - [ ] `pnpm pack` produces a stable tarball with no missing runtime/context files.
  - [ ] `npm install` from the packed tarball works (end-user simulation).
  - [ ] README.md exists with install/usage/env vars/hosts/chains documentation.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Tarball contains runtime and context assets
    Tool: Bash
    Steps: run `pnpm pack`; inspect tarball via `tar -tf web3agent-*.tgz`
    Expected: includes dist/**, package.json, WEB3_CONTEXT.md, README.md
    Evidence: .sisyphus/evidence/task-11-pack.txt

  Scenario: Host fixture release matrix
    Tool: Bash
    Steps: run `pnpm test -- tests/e2e/host-matrix.test.ts`
    Expected: proxy and multi-server init outputs correct for Claude Code, Cursor, Windsurf, OpenCode
    Evidence: .sisyphus/evidence/task-11-host-matrix.txt
  ```

  **Commit**: YES | Message: `chore(release): ship WEB3_CONTEXT.md, CI, README, and release matrix` | Files: `WEB3_CONTEXT.md`, `README.md`, `.github/workflows/ci.yml`, `tests/e2e/**`

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Create one commit per completed task using the messages listed in each task.
- Keep foundation tasks (1, 2, 4) isolated from integration tasks (5-9) so regressions can be bisected.
- Reserve the final packaging/release commit for tarball, context asset, and CI verification changes.

## Success Criteria
- The package installs and builds cleanly on Node 18+ and is publish-ready through `pnpm pack`.
- `init` safely configures the four supported hosts, supports dry-run output, and never trashes unrelated config.
- Proxy mode starts with hosted Blockscout + managed EVM + custom tools where available, and degrades gracefully when optional backends are offline.
- Wallet activation/deactivation, confirmation queueing, and startup resolution behave deterministically across restarts.
- GOAT, LI.FI, and validated Orbs capabilities are available behind clear tiering rules and chain-aware execution.
- Automated tests and task-level QA evidence prove the package can be executed by agents without human guesswork.
