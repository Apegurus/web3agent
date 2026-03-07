# Web3agent V1 Framework

## TL;DR
> **Summary**: Build a greenfield TypeScript npm package that ships a hosted-default, proxy-preferred Web3 MCP framework for Claude Code, Cursor, Windsurf, and OpenCode, with a safe `init` flow, a manual-aggregation runtime, and a full automated test suite.
> **Deliverables**:
> - Published `web3agent` CLI/server package for Node 18+
> - `init` host detection + config/context writer for the four supported hosts
> - Proxy runtime aggregating custom Web3 tools, hosted Blockscout, and local EVM MCP
> - Full test suite, packaging checks, and publish-ready artifacts
> **Effort**: XL
> **Parallel**: YES - 3 waves
> **Critical Path**: 1 -> 2 -> 3 -> 6 -> 8 -> 11 -> 12

## Context
### Original Request
Build an easy-to-install Web3 agentic framework that plugs into existing agent tools, grounded first in the three root docs and refined through research before planning.

### Interview Summary
- `FRAMEWORK.md` is the canonical v1 spec when it conflicts with `REFERENCE.md` and `MCP_REFERENCE.md`.
- Blockscout may be hosted-default in v1; local/self-hosted Blockscout is not required for the first release.
- A single `npx <package>` proxy remains the preferred UX, but multi-server config fallback is allowed when it is safer or faster to ship.
- First-class host support is limited to Claude Code, Cursor, Windsurf, and OpenCode.
- Publish target should be `web3agent` if available; otherwise fall back to `@web3agent/cli` without changing the rest of the design.
- Orbs dSLTP is feature-flagged: include it only if source validation succeeds cleanly during implementation.
- v1 should ship with a full automated test suite, not just build/pack/manual QA.

### Metis Review (gaps addressed)
- Treat npm name availability, Orbs Liquidity Hub Node compatibility, and GOAT plugin chain restrictions as explicit gate checks in Task 1.
- Pin the runtime to the stable `@modelcontextprotocol/sdk` v1.x low-level `Server` API because GOAT targets it today; do not design around pre-alpha `McpServer` APIs.
- Implement proxy composition manually with upstream MCP clients and a deterministic tool-routing map; do not assume SDK-level multi-server composition exists.
- Assume degraded startup is allowed: if an optional backend is unavailable, start with reduced toolset and surface that state via `server_status` instead of failing the entire server.

## Work Objectives
### Core Objective
Ship a publishable `web3agent` package that gives supported agent hosts a low-friction installation path and exposes a reliable Web3 capability surface through either one proxy server entry or a safe multi-server fallback.

### Deliverables
- Node 18+ TypeScript ESM npm package with `bin` entry and executable build output.
- `init` command that detects Claude Code, Cursor, Windsurf, and OpenCode, writes MCP config safely, supports `--dry-run`, and installs context guidance.
- Runtime server that aggregates:
  - custom Web3 tools (wallet, GOAT-based tools, LI.FI, Orbs, utility tools)
  - hosted Blockscout MCP via upstream client transport
  - local EVM MCP via managed subprocess transport
- Persisted wallet management, confirmation queue, startup health/degradation reporting, and supported-chain registry.
- `WEB3_CONTEXT.md` shipped in the package and host-specific context/rules integration.
- Full automated test suite plus packaging/publish verification.

### Definition of Done (verifiable conditions with commands)
- `npm install` succeeds on Node 18+ with pinned production/test dependencies.
- `npm run build` produces executable `dist/index.js` and any required support files.
- `npm test` passes a full suite covering config writing, proxy routing, wallet flows, and integration adapters.
- `npm pack` produces a tarball containing runtime files, `WEB3_CONTEXT.md`, and no missing dependency errors.
- `node dist/index.js init --dry-run` detects supported host fixtures and prints deterministic config/context changes.
- `node dist/index.js` starts on stdio without optional secrets, logs only to stderr, and exposes a reduced but valid toolset.

### Must Have
- Stable MCP SDK v1.x implementation (`Server`, request handlers, stdio transport, upstream client transports).
- Hosted-default Blockscout integration using the official remote MCP endpoint with overridable URL for advanced users.
- EVM MCP integrated as a managed local subprocess, with wallet-state sync controlled by the framework.
- Chain-aware GOAT execution that adds optional `chainId` at the framework layer and routes to cached per-chain handlers.
- Non-destructive config writes with host-aware merge rules, deterministic managed entries/files, and `--dry-run` support.
- Full automated tests plus agent-executed QA scenarios for every task.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No `@modelcontextprotocol/server`/pre-alpha `McpServer` dependency in v1.
- No assumption that upstream servers can be composed automatically by the SDK.
- No hard requirement for locally bundled Blockscout infrastructure in v1.
- No destructive overwrite of existing host configs or rule files.
- No dSLTP implementation unless the validated contract/SDK surface is confirmed first.
- No all-or-nothing startup failure for optional backend outages; only the core runtime may fail fast.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: Full test suite using Vitest for unit/integration coverage and fixture-driven CLI tests.
- QA policy: Every task includes at least one happy-path and one failure/edge-path scenario executed by agent tools.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. Extract shared dependencies early and keep proxy/runtime assembly late.

Wave 1: gate validation, package/toolchain scaffold, runtime config contracts, host detection/config writer foundation.

Wave 2: upstream Blockscout adapter, upstream EVM adapter, wallet/confirmation subsystem, GOAT chain-aware provider.

Wave 3: LI.FI tools, Orbs tools (+ dSLTP flag gate), proxy runtime/CLI assembly, packaging/context/release matrix.

### Dependency Matrix (full, all tasks)
- 1 blocks 2, 4, 6, 8, 10, 12 because package name, SDK pin, and external integration constraints must be frozen first.
- 2 blocks 3-12 because every implementation task depends on the repo scaffold, scripts, and full test harness.
- 3 blocks 5-11 because adapters and custom tools rely on central env, chain, degradation, and health models.
- 4 depends on 1-2 and runs in parallel with 3; 11 and 12 depend on it for host fixtures and file contracts.
- 5 depends on 1-3 and feeds 11.
- 6 depends on 1-3 and 7; 11 depends on it.
- 7 depends on 2-3 and feeds 6, 8, 9, 10, 11.
- 8 depends on 1-3 and 7; 9 and 10 depend on it.
- 9 depends on 2-3, 7, 8 and feeds 11.
- 10 depends on 1-3, 7, 8 and feeds 11.
- 11 depends on 3, 5, 6, 7, 8, 9, 10.
- 12 depends on 1-11.

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 -> 4 tasks -> `deep`, `unspecified-high`, `writing`
- Wave 2 -> 4 tasks -> `unspecified-high`, `deep`
- Wave 3 -> 4 tasks -> `deep`, `unspecified-high`, `writing`

## TODOs

- [ ] 1. Freeze external gates and fallback contracts

  **What to do**: Verify the last unvalidated external assumptions before broad implementation begins. Check npm name availability for `web3agent`; if unavailable, lock the fallback package name to `@web3agent/cli` without changing runtime/file layout. Validate the Blockscout endpoint contract (`https://mcp.blockscout.com/mcp`) and freeze the upstream client transport as `SSEClientTransport`, with an advanced-user override env var named `BLOCKSCOUT_MCP_URL`. Verify whether `@orbs-network/liquidity-hub-sdk` imports cleanly in Node 18 ESM without browser/Wagmi shims. Build a chain-support matrix for GOAT Tier 1 plugins (at minimum Uniswap and Balancer on Base, Mainnet, Arbitrum, Optimism) and record any chain exclusions so wrapper tools can fail clearly instead of guessing.
  **Must NOT do**: Do not start coding LI.FI/Orbs/proxy logic before the gate report exists. Do not adopt `@modelcontextprotocol/server` or any pre-alpha MCP package even if docs/examples look cleaner.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: External package validation and fallback contracts determine the entire architecture.
  - Skills: [] — No special local skill is required beyond targeted research.
  - Omitted: [`frontend-ui-ux`] — No UI/design work is involved.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 4, 6, 8, 10, 12 | Blocked By: none

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:17` — One package should serve both runtime and `init` modes.
  - Pattern: `FRAMEWORK.md:52` — Blockscout is an external MCP source that needs packaging research.
  - Pattern: `FRAMEWORK.md:78` — Manual aggregation/routing is acceptable if the SDK has no composition primitive.
  - Pattern: `FRAMEWORK.md:188` — Orbs Liquidity Hub Node compatibility must be verified before planning execution.
  - Pattern: `REFERENCE.md:199` — MCP SDK API verification is explicitly required research.
  - Pattern: `REFERENCE.md:204` — Orbs Liquidity Hub compatibility is a named research item.
  - External: `https://docs.blockscout.com/devs/mcp-server` — Official Blockscout MCP docs and transport contract.
  - External: `https://www.npmjs.com/package/@mcpdotdirect/evm-mcp-server` — EVM MCP runtime/package facts.
  - External: `https://github.com/goat-sdk/goat/tree/master/typescript/packages/adapters/model-context-protocol` — GOAT adapter behavior and dependency constraints.

  **Acceptance Criteria** (agent-executable only):
  - [ ] A gate report script or checked-in artifact records the chosen package name, MCP SDK version pin, Blockscout transport choice, Orbs Node compatibility result, and GOAT plugin chain matrix.
  - [ ] The project uses `web3agent` only if verified available at planning-time execution; otherwise the fallback package name is frozen consistently.
  - [ ] The Blockscout override contract is frozen as `BLOCKSCOUT_MCP_URL` rather than the older `BLOCKSCOUT_API_URL` assumption for hosted-default v1.
  - [ ] dSLTP remains marked as gated/optional until its source validation passes.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Gate report passes with frozen decisions
    Tool: Bash
    Steps: run `node scripts/validate-integrations.mjs`; inspect stdout/stderr for package-name decision, transport decision, and Orbs compatibility result
    Expected: exits 0 and writes `.sisyphus/evidence/task-1-gates.json` containing all required decisions
    Evidence: .sisyphus/evidence/task-1-gates.json

  Scenario: Unsupported upstream assumption fails loudly
    Tool: Bash
    Steps: run `BLOCKSCOUT_MCP_URL=https://invalid.example node scripts/validate-integrations.mjs --check-blockscout`
    Expected: exits non-zero with a transport/connectivity error and does not silently mark Blockscout as validated
    Evidence: .sisyphus/evidence/task-1-gates-error.txt
  ```

  **Commit**: YES | Message: `docs(spec): freeze external integration gates` | Files: `scripts/validate-integrations.mjs`, `docs/architecture/compatibility-matrix.md`, `package.json`

- [ ] 2. Scaffold the npm package, build pipeline, and full test harness

  **What to do**: Create the greenfield package structure for Node 18+ TypeScript ESM. Use npm, `tsc`, and a shebang-preserving post-build step for the CLI binary. Set up Vitest as the full test runner with unit, fixture, and integration suites under `tests/`. Create the initial `src/` layout for config, hosts, upstream adapters, runtime, tools, and assets. Add package scripts for `build`, `test`, `test:watch`, `pack:check`, and any needed typecheck/prepublish validation. Pin `@modelcontextprotocol/sdk` to a stable v1.x version compatible with GOAT.
  **Must NOT do**: Do not leave package naming conditional inside runtime code. Do not use Bun/pnpm-only tooling. Do not leave the executable bit or shebang as a manual post-install step.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Cross-cutting repo scaffold with build and test correctness.
  - Skills: [] — Standard TypeScript/npm project setup.
  - Omitted: [`git-master`] — Git workflow is not the bottleneck for this task.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:5` — Package is TypeScript ESM, Node 18+, built with `tsc`, distributed via npm `bin`.
  - Pattern: `FRAMEWORK.md:305` — `npm install` must succeed on Node 18+.
  - Pattern: `FRAMEWORK.md:307` — Build output must include valid `dist/index.js`.
  - Pattern: `REFERENCE.md:185` — `npx` compatibility requires shebang + executable build output.
  - External: `https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x` — Stable SDK import paths and package shape.
  - External: `https://www.npmjs.com/package/@goat-sdk/adapter-model-context-protocol` — Confirms GOAT adapter dependency expectations.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npm install`, `npm run build`, and `npm test` all pass in a fresh checkout.
  - [ ] The compiled CLI entry is executable and invokable through `node dist/index.js` and the npm `bin` contract.
  - [ ] Vitest is configured for unit + fixture/integration tests with deterministic temp directories.
  - [ ] The package manifest pins the stable MCP SDK line and includes `WEB3_CONTEXT.md` in publishable files.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Fresh install/build/test succeeds
    Tool: Bash
    Steps: run `npm install`; run `npm run build`; run `npm test`
    Expected: all commands exit 0 and produce `dist/index.js` plus passing test output
    Evidence: .sisyphus/evidence/task-2-scaffold.txt

  Scenario: Executable contract exists after build
    Tool: Bash
    Steps: run `npm run build`; run `node dist/index.js --help`
    Expected: exits 0 and prints CLI help without module-resolution or permission errors
    Evidence: .sisyphus/evidence/task-2-scaffold-help.txt
  ```

  **Commit**: YES | Message: `build(scaffold): initialize web3agent package and test harness` | Files: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/**`, `tests/**`

- [ ] 3. Implement canonical config contracts, chain registry, and startup health policy

  **What to do**: Build the central typed config layer that every command and adapter uses. Support `CHAIN_ID` as the default chain with Base (`8453`) as the default default, while preserving per-call `chainId` override in wrapper tools. Treat `RPC_URL` as an override for the default chain transport only; do not invent a full multi-chain RPC map in v1. Add typed parsing for `PRIVATE_KEY`, `MNEMONIC`, wallet derivation indexes, `CONFIRM_WRITES`, `BLOCKSCOUT_MCP_URL`, `ETHERSCAN_API_KEY`, `LIFI_API_KEY`, `ZEROX_API_KEY`, and Orbs feature flags. Define a runtime health model that distinguishes required core startup failures from optional backend degradation and is later surfaced by `server_status`.
  **Must NOT do**: Do not leave env parsing ad hoc in individual tool files. Do not fail the entire server just because Blockscout or EVM upstream startup failed. Do not remove `CHAIN_ID`; v1 uses default-chain + per-call override rather than per-call-only purism.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: This is the typed contract layer for the entire runtime.
  - Skills: [] — Standard runtime architecture work.
  - Omitted: [`frontend-ui-ux`] — No visual work exists.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 5, 6, 7, 8, 9, 10, 11 | Blocked By: 2

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:120` — Chain handling is per-call, but a default chain is still expected.
  - Pattern: `FRAMEWORK.md:126` — `CHAIN_ID` and `RPC_URL` semantics in the newer canonical spec.
  - Pattern: `FRAMEWORK.md:236` — Base env-var table for v1 behavior.
  - Pattern: `FRAMEWORK.md:210` — `server_status` must report loaded capabilities and confirmation mode.
  - Pattern: `REFERENCE.md:177` — Older per-call-only interpretation that must be reconciled explicitly, not ignored.
  - External: `https://opencode.ai/docs/mcp-servers/` — Current OpenCode config/environment naming and timeout concepts.

  **Acceptance Criteria** (agent-executable only):
  - [ ] A single config module produces deterministic runtime settings from env vars and defaults.
  - [ ] The supported chain registry includes all chains listed in `FRAMEWORK.md` and exposes a reusable lookup by ID/name.
  - [ ] Optional backend failures are represented in typed startup health state rather than unstructured log strings.
  - [ ] Unit tests cover env precedence, invalid config rejection, and degraded-startup classification.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Default-chain config resolves predictably
    Tool: Bash
    Steps: run `npm test -- tests/config/runtime-config.test.ts`
    Expected: tests prove Base is the fallback default, `CHAIN_ID` overrides it, and `RPC_URL` applies only to the chosen default chain
    Evidence: .sisyphus/evidence/task-3-config.txt

  Scenario: Invalid env input is rejected cleanly
    Tool: Bash
    Steps: run `CHAIN_ID=not-a-number npm test -- tests/config/runtime-config-invalid.test.ts`
    Expected: exits non-zero or failing test asserts a structured validation error instead of silent fallback
    Evidence: .sisyphus/evidence/task-3-config-error.txt
  ```

  **Commit**: YES | Message: `feat(config): add runtime contracts and startup health model` | Files: `src/config/**`, `src/chains/**`, `tests/config/**`

- [ ] 4. Build host detection, safe config writing, and context installation for the big four hosts

  **What to do**: Implement `init` foundations for Claude Code, Cursor, Windsurf, and OpenCode only. Detection should use project markers first and refuse to guess when multiple hosts are detected unless `--host` is passed. Write targets should be: Claude project `.mcp.json`; Cursor `.cursor/mcp.json`; Windsurf whichever path is validated in Task 1's compatibility matrix (project-local if supported, otherwise the documented user-level path); OpenCode `opencode.json`. Use non-destructive merge rules, managed server names (`web3agent`, `blockscout`, `evm` when fallback mode is chosen), deterministic formatting, backups for modified JSON files, and `--dry-run`. Install context guidance through dedicated managed files/blocks: `CLAUDE.md`, `.cursor/rules/web3agent.mdc`, `.windsurf/rules/web3agent.md`, and a managed `AGENTS.md` block for OpenCode, all pointing to shipped `WEB3_CONTEXT.md` content.
  **Must NOT do**: Do not overwrite entire config files. Do not write host support for OpenClaw or generic “others” in v1. Do not mutate user-global config by default for hosts that support project-local config.

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: Safe file-generation/merge logic plus host-specific copy and compatibility rules.
  - Skills: [] — Host config writing is custom to this repo.
  - Omitted: [`frontend-ui-ux`] — No frontend deliverable.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 11, 12 | Blocked By: 1, 2

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:84` — `init` is responsible for host detection, env prompts, config writes, and confirmation output.
  - Pattern: `FRAMEWORK.md:94` — Older host config examples that must be reconciled with live docs.
  - Pattern: `MCP_REFERENCE.md:17` — Existing host-specific shape examples for Claude/Cursor/Windsurf/OpenCode.
  - External: `https://code.claude.com/docs/en/mcp` — Current Claude Code `.mcp.json`/scope behavior and config schema.
  - External: `https://opencode.ai/docs/mcp-servers/` — Current OpenCode `mcp`, `command`, `environment` schema.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `init --dry-run` prints deterministic config/context changes for each supported host fixture.
  - [ ] `init` writes only managed entries/files/blocks and preserves unrelated config.
  - [ ] When multiple hosts are detected, the command exits with a targeted selection error unless `--host` is supplied.
  - [ ] Host-specific context artifacts are created/updated without duplicating content on repeated runs.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Dry-run detection and merge output works for Claude fixture
    Tool: Bash
    Steps: run `node dist/index.js init --host claude --mode proxy --project tests/fixtures/hosts/claude-project --dry-run`
    Expected: exits 0, prints the `.mcp.json` and `CLAUDE.md` diff/summary, and leaves fixture files unchanged
    Evidence: .sisyphus/evidence/task-4-init-claude.txt

  Scenario: Ambiguous host detection fails safely
    Tool: Bash
    Steps: run `node dist/index.js init --project tests/fixtures/hosts/multi-host-project`
    Expected: exits non-zero with a message listing detected hosts and asking for `--host`
    Evidence: .sisyphus/evidence/task-4-init-error.txt
  ```

  **Commit**: YES | Message: `feat(init): add host detection and safe config writers` | Files: `src/hosts/**`, `src/cli/init/**`, `tests/fixtures/hosts/**`, `tests/init/**`

- [ ] 5. Implement the hosted Blockscout upstream adapter

  **What to do**: Build a dedicated upstream adapter for Blockscout using the MCP client API and `SSEClientTransport` against `https://mcp.blockscout.com/mcp` by default, with `BLOCKSCOUT_MCP_URL` as an advanced override. On startup, connect, fetch the upstream tool list, filter out any Blockscout-specific bootstrap/instruction tools from the exposed proxy surface, prefix the remaining names with `blockscout_`, and register a deterministic route map for later proxy dispatch. Preserve upstream errors and long-running progress messages where possible, but normalize all exposed tool names and descriptions into the framework namespace. If connection fails, mark Blockscout degraded in runtime health and continue startup.
  **Must NOT do**: Do not depend on a Python subprocess for the default v1 path. Do not expose raw upstream tool names into proxy mode. Do not fail the whole runtime because the hosted endpoint is unavailable.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Transport/client integration with routing and degradation behavior.
  - Skills: [] — Custom adapter work.
  - Omitted: [`frontend-ui-ux`] — No UI involvement.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 11 | Blocked By: 2, 3

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:52` — Blockscout exists to provide indexed history, ABI, token transfer, and NFT metadata.
  - Pattern: `FRAMEWORK.md:72` — Proxy mode routes backend tools based on source-specific selection.
  - Pattern: `MCP_REFERENCE.md:9` — Historical repo direction treated Blockscout as hosted/remote, which aligns with v1 user choice.
  - External: `https://docs.blockscout.com/devs/mcp-server` — Official hosted MCP docs and tool/instruction behavior.
  - External: `https://mcp.blockscout.com/` — Landing page for the hosted endpoint.
  - External: `https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x` — Client transport APIs for upstream MCP connections.

  **Acceptance Criteria** (agent-executable only):
  - [ ] The adapter exposes a prefixed Blockscout tool list and stores a route map for the proxy layer.
  - [ ] Connection failures mark Blockscout as degraded without crashing the local runtime.
  - [ ] Upstream bootstrap/instruction tools are not re-exposed as user-facing proxied tools.
  - [ ] Integration tests cover both successful hosted/mocked connection and unavailable-endpoint degradation.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Adapter loads and prefixes upstream tools
    Tool: Bash
    Steps: run `npm test -- tests/upstream/blockscout-adapter.test.ts`
    Expected: tests assert that exposed names are prefixed with `blockscout_`, route-map entries exist, and instruction-only upstream tools are filtered out
    Evidence: .sisyphus/evidence/task-5-blockscout.txt

  Scenario: Unreachable Blockscout degrades instead of crashing
    Tool: Bash
    Steps: run `BLOCKSCOUT_MCP_URL=https://127.0.0.1:9 npm test -- tests/upstream/blockscout-degraded.test.ts`
    Expected: test passes only if runtime health marks Blockscout unavailable and startup remains successful
    Evidence: .sisyphus/evidence/task-5-blockscout-error.txt
  ```

  **Commit**: YES | Message: `feat(blockscout): add hosted upstream adapter` | Files: `src/upstream/blockscout/**`, `tests/upstream/blockscout*.test.ts`

- [ ] 6. Implement the managed EVM MCP subprocess adapter and wallet-sync lifecycle

  **What to do**: Build the EVM adapter as a managed local subprocess using `npx -y @mcpdotdirect/evm-mcp-server` and MCP stdio client transport. Prefix proxied tools with `evm_`, capture upstream tool metadata for the route map, and wire adapter startup to the framework's canonical wallet state. When the active wallet changes via env resolution at startup or through runtime `wallet_activate` / `wallet_deactivate`, restart or reinitialize the EVM subprocess so its env reflects the latest active credentials. Preserve read-only operation when no wallet is configured. Expose adapter health and restart counts for `server_status`.
  **Must NOT do**: Do not treat the EVM server as a fire-and-forget child process. Do not allow the subprocess to keep stale wallet credentials after activation/deactivation. Do not pass the full parent environment through blindly.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Subprocess lifecycle, env hygiene, and runtime synchronization are failure-prone.
  - Skills: [] — Standard Node process/orchestration work.
  - Omitted: [`git-master`] — Version control is not the core problem.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 11 | Blocked By: 2, 3, 7

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:62` — EVM MCP provides live state and general contract read capability.
  - Pattern: `FRAMEWORK.md:66` — EVM MCP packaging/invocation/env behavior needed research.
  - Pattern: `FRAMEWORK.md:130` — Wallet persistence model must remain canonical inside the framework.
  - External: `https://www.npmjs.com/package/@mcpdotdirect/evm-mcp-server` — Package/install/runtime contract.
  - External: `https://github.com/mcpdotdirect/evm-mcp-server` — Tool surface, env vars, and command behavior.

  **Acceptance Criteria** (agent-executable only):
  - [ ] The runtime can start the EVM adapter in read-only mode with no configured wallet.
  - [ ] Wallet activation/deactivation triggers an adapter refresh or restart so upstream env state matches framework wallet state.
  - [ ] The adapter exposes prefixed tools and health metadata without leaking secrets into logs.
  - [ ] Integration tests cover startup, restart-on-wallet-change, and degraded subprocess failures.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Read-only EVM adapter starts cleanly
    Tool: Bash
    Steps: run `npm test -- tests/upstream/evm-adapter-readonly.test.ts`
    Expected: test proves the subprocess starts without wallet credentials and exposes read-safe prefixed tools
    Evidence: .sisyphus/evidence/task-6-evm.txt

  Scenario: Wallet change forces adapter refresh
    Tool: Bash
    Steps: run `npm test -- tests/upstream/evm-adapter-wallet-refresh.test.ts`
    Expected: test proves `wallet_activate` or wallet-state change causes a subprocess reinit/restart and refreshed health metadata
    Evidence: .sisyphus/evidence/task-6-evm-refresh.txt
  ```

  **Commit**: YES | Message: `feat(evm): add managed subprocess adapter` | Files: `src/upstream/evm/**`, `tests/upstream/evm*.test.ts`

- [ ] 7. Implement wallet persistence, confirmation queue, and utility tool contracts

  **What to do**: Build the framework-owned wallet subsystem, making it the single source of truth for active account state. Support the startup precedence `PRIVATE_KEY` -> `MNEMONIC` -> `~/.web3agent/wallet.json` -> ephemeral read-only session key. Persist wallet state in plaintext JSON with mode `0o600`; do not create backup secret files on deactivation. Implement the confirmation queue for all write operations (`transaction_confirm`, `transaction_deny`, `transaction_list`, `wallet_set_confirmation`) and utility tools (`wallet_generate`, `wallet_generate_mnemonic`, `wallet_from_mnemonic`, `wallet_derive_addresses`, `wallet_get_active`, `wallet_activate`, `wallet_deactivate`, `server_status`, `list_supported_chains`). Publish runtime events or callbacks so the EVM adapter can respond to wallet changes.
  **Must NOT do**: Do not silently persist generated credentials. Do not store extra backup copies of private keys/mnemonics. Do not let write operations bypass confirmation when `CONFIRM_WRITES` is enabled.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Wallet handling and confirmation semantics are security-sensitive core behavior.
  - Skills: [] — Custom runtime work.
  - Omitted: [`frontend-ui-ux`] — No UI deliverable.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 6, 8, 9, 10, 11 | Blocked By: 2, 3

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:130` — Wallet persistence path and precedence order.
  - Pattern: `FRAMEWORK.md:144` — Confirmation queue semantics and tool set.
  - Pattern: `FRAMEWORK.md:156` — Wallet generation tool list and warning requirements.
  - Pattern: `FRAMEWORK.md:208` — Utility tool expectations for `server_status` and chain listing.
  - Pattern: `REFERENCE.md:148` — Wallet file shape and permission model.
  - Pattern: `REFERENCE.md:119` — Queue pattern details for write gating.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Wallet file creation uses strict user-only permissions and startup precedence is covered by tests.
  - [ ] All required wallet and transaction-management tools are registered with the correct safe behavior.
  - [ ] `server_status` reports wallet mode, confirmation state, active chain, and backend health.
  - [ ] Deactivation deletes the persisted wallet file and does not leave backup secret artifacts.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Wallet activate persists and reports correct mode
    Tool: Bash
    Steps: run `HOME=$(pwd)/tests/tmp/home-wallet npm test -- tests/wallet/wallet-persistence.test.ts`
    Expected: tests prove `wallet_activate` creates `~/.web3agent/wallet.json` with `0o600` semantics and `wallet_get_active` reflects the persisted mode
    Evidence: .sisyphus/evidence/task-7-wallet.txt

  Scenario: Confirmation queue blocks write execution by default
    Tool: Bash
    Steps: run `npm test -- tests/wallet/confirmation-queue.test.ts`
    Expected: test proves write actions enqueue pending operations and only execute after `transaction_confirm`
    Evidence: .sisyphus/evidence/task-7-wallet-queue.txt
  ```

  **Commit**: YES | Message: `feat(wallet): add persistence and confirmation queue` | Files: `src/wallet/**`, `src/tools/wallet/**`, `tests/wallet/**`

- [ ] 8. Implement the chain-aware GOAT provider and tiered plugin loading

  **What to do**: Wrap GOAT's `getOnChainTools()` behind a framework-owned provider that caches one GOAT tool snapshot per supported chain using the canonical wallet client factory. Build the public tool surface as the union of available GOAT tool names across chains, then re-register them as framework tools that add an optional `chainId` parameter before dispatching to the correct cached handler. Maintain the capability tiers defined in the spec: Tier 0 always loaded, Tier 1 loaded only when wallet-backed mode is available, Tier 2 loaded only when required API keys are present. Wrap plugin loading in `try/catch`; if a plugin or chain is unsupported, omit the tool from the affected chain and return a clear "tool unavailable on chain X" error at call time.
  **Must NOT do**: Do not expose raw GOAT tool schemas unchanged if they cannot accept framework-level `chainId`. Do not assume every Tier 1 plugin supports every chain. Do not crash startup because one plugin fails to initialize.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: This task reconciles fixed-chain GOAT adapters with the framework's per-call chain model.
  - Skills: [] — Requires careful custom adapter logic.
  - Omitted: [`git-master`] — No git-specialized work is needed.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9, 10, 11 | Blocked By: 1, 2, 3, 7

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:104` — GOAT adapter is the core of custom tools and requires JSON Schema -> MCP wiring.
  - Pattern: `FRAMEWORK.md:110` — Capability tiers and silent-skip semantics.
  - Pattern: `FRAMEWORK.md:120` — Chain handling must be per-call.
  - Pattern: `REFERENCE.md:29` — GOAT's MCP adapter returns a separate tool list and handler.
  - External: `https://github.com/goat-sdk/goat/tree/master/typescript/packages/adapters/model-context-protocol` — Actual adapter shape (`listOfTools`, `toolHandler`).
  - External: `https://github.com/goat-sdk/goat/tree/master/typescript/examples/by-framework/model-context-protocol` — Reference integration pattern.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Framework-wrapped GOAT tools accept optional `chainId` and dispatch to the correct cached chain-specific handler.
  - [ ] Unsupported chain/plugin combinations return a structured unavailability error instead of crashing.
  - [ ] Tier loading obeys wallet/API-key gates and silently skips plugin init failures with health reporting.
  - [ ] Tests cover at least one cross-chain dispatch case and one unavailable-plugin case.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Wrapped GOAT tools dispatch by chainId
    Tool: Bash
    Steps: run `npm test -- tests/goat/chain-aware-provider.test.ts`
    Expected: tests prove the same public tool routes to different cached handlers when `chainId` changes
    Evidence: .sisyphus/evidence/task-8-goat.txt

  Scenario: Unsupported chain/plugin returns clear error
    Tool: Bash
    Steps: run `npm test -- tests/goat/chain-unavailable.test.ts`
    Expected: test proves the framework returns a deterministic "not available on chain" error for an excluded plugin/chain pair
    Evidence: .sisyphus/evidence/task-8-goat-error.txt
  ```

  **Commit**: YES | Message: `feat(goat): add chain-aware provider and tiered loading` | Files: `src/goat/**`, `src/tools/goat/**`, `tests/goat/**`

- [ ] 9. Implement LI.FI custom tools on top of the framework wallet/confirmation model

  **What to do**: Add a dedicated LI.FI integration layer separate from GOAT. Configure LI.FI with a fresh wallet client per target chain through the framework wallet factory and make sure `switchChain` never reuses stale clients. Expose `lifi_get_chains` always. Expose `lifi_get_quote` and `lifi_execute_bridge` only in wallet-backed mode for v1, matching the canonical newer spec. `lifi_get_quote` must return a trimmed response that includes source/destination chains, amount in/out, estimated time, bridge/DEX path summary, and fees — never the full route object. `lifi_execute_bridge` must enqueue into the confirmation queue rather than executing immediately when confirmations are enabled.
  **Must NOT do**: Do not register LI.FI through GOAT. Do not return raw LI.FI route payloads. Do not execute a bridge directly when the confirmation layer is enabled.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: Multi-chain execution, wallet-factory coordination, and response trimming require careful custom logic.
  - Skills: [] — Library-specific integration work.
  - Omitted: [`frontend-ui-ux`] — No visual surface.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 11 | Blocked By: 2, 3, 7, 8

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:170` — LI.FI is a custom direct integration, not a GOAT plugin.
  - Pattern: `FRAMEWORK.md:174` — `switchChain` must return a fresh wallet client for the target chain.
  - Pattern: `FRAMEWORK.md:176` — Tool set and confirmation expectations for LI.FI.
  - Pattern: `FRAMEWORK.md:178` — Route objects are too large; return trimmed summaries.
  - Pattern: `REFERENCE.md:47` — Additional implementation detail for server-side provider setup and blocking route execution.
  - External: `https://www.npmjs.com/package/@lifi/sdk` — Package contract and current SDK docs.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `lifi_get_chains` is always available; `lifi_get_quote` and `lifi_execute_bridge` appear only in wallet-backed mode.
  - [ ] Quote responses are trimmed to decision-useful fields and never dump the raw route object.
  - [ ] Bridge execution routes through the confirmation queue and uses a fresh chain-specific wallet client when execution switches chains.
  - [ ] Tests cover a multi-chain quote path and a confirmation-gated bridge path.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: LI.FI quote returns trimmed multi-chain summary
    Tool: Bash
    Steps: run `npm test -- tests/lifi/lifi-quote.test.ts`
    Expected: tests prove the returned payload includes only summary fields and uses the expected source/destination chain metadata
    Evidence: .sisyphus/evidence/task-9-lifi.txt

  Scenario: Bridge execution is gated by confirmation
    Tool: Bash
    Steps: run `npm test -- tests/lifi/lifi-confirmation.test.ts`
    Expected: test proves `lifi_execute_bridge` creates a pending operation first and only executes after `transaction_confirm`
    Evidence: .sisyphus/evidence/task-9-lifi-queue.txt
  ```

  **Commit**: YES | Message: `feat(lifi): add bridged quote and execution tools` | Files: `src/lifi/**`, `src/tools/lifi/**`, `tests/lifi/**`

- [ ] 10. Implement Orbs Liquidity Hub, dTWAP, and dLIMIT with dSLTP behind a validation gate

  **What to do**: Integrate Orbs in two layers. First, add Liquidity Hub quote support (`orbs_get_quote`) using `@orbs-network/liquidity-hub-sdk`; allow this quote tool in read-only mode if Task 1 validates clean Node usage. Second, implement dTWAP and dLIMIT through direct contract interactions using the validated contract addresses, ABI, approval flow, and Lens status queries from the `orbs-network/twap` repo. Route all write paths through the confirmation queue. Add dSLTP only behind an explicit feature flag if Task 1 or later source validation confirms contracts/ABI/SDK details cleanly; otherwise omit the dSLTP tools and surface that omission in `server_status`.
  **Must NOT do**: Do not fake dSLTP support with placeholder tools. Do not treat dLIMIT as a separate contract from dTWAP. Do not bypass approval or confirmation semantics for Orbs writes.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: Mixed SDK + direct-contract integration with a feature-gated edge product.
  - Skills: [] — Specialized Web3 protocol integration.
  - Omitted: [`git-master`] — Git history work is not relevant.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 11 | Blocked By: 1, 2, 3, 7, 8

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:184` — Four Orbs products and gating expectations.
  - Pattern: `FRAMEWORK.md:188` — Liquidity Hub SDK contract and Node-compatibility uncertainty.
  - Pattern: `FRAMEWORK.md:194` — dTWAP uses direct `ask()` contract interaction.
  - Pattern: `FRAMEWORK.md:198` — dLIMIT is the same contract with one-chunk parameterization.
  - Pattern: `FRAMEWORK.md:202` — dSLTP is the newest/least documented product and requires fresh validation.
  - Pattern: `REFERENCE.md:106` — Integration summary table for Liquidity Hub, dTWAP, dLIMIT, dSLTP.
  - External: `https://github.com/orbs-network/liquidity-hub-sdk` — Liquidity Hub SDK source.
  - External: `https://github.com/orbs-network/twap` — Contract configs, ABI, and Lens references.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `orbs_get_quote` works in read-only mode if the SDK is Node-compatible; otherwise the omission is explicit and tested.
  - [ ] dTWAP and dLIMIT use the same contract/ABI path with correct parameterization and confirmation queue behavior.
  - [ ] dSLTP tools only appear when the feature gate is enabled after passing validation.
  - [ ] Tests cover quote behavior, write gating, and the feature-flag omission path.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Orbs quote tool works or omits explicitly based on validation result
    Tool: Bash
    Steps: run `npm test -- tests/orbs/orbs-quote.test.ts`
    Expected: tests prove either a valid quote flow in Node or an explicit "feature unavailable" state recorded in health/status
    Evidence: .sisyphus/evidence/task-10-orbs.txt

  Scenario: dSLTP stays hidden when flag/validation is absent
    Tool: Bash
    Steps: run `npm test -- tests/orbs/orbs-dsltp-flag.test.ts`
    Expected: test proves dSLTP tools do not register unless the validation flag is explicitly enabled
    Evidence: .sisyphus/evidence/task-10-orbs-flag.txt
  ```

  **Commit**: YES | Message: `feat(orbs): add liquidity hub and advanced order tools` | Files: `src/orbs/**`, `src/tools/orbs/**`, `tests/orbs/**`

- [ ] 11. Assemble the proxy runtime and single-binary CLI contract

  **What to do**: Build the actual runtime entrypoint so `npx web3agent` starts the MCP stdio server and `npx web3agent init` runs the host config flow. Use the stable MCP SDK `Server` API, wire in custom tools plus prefixed upstream adapters, and maintain a deterministic tool-routing map keyed by exposed tool name. Proxy only tools in v1; do not proxy upstream prompts/resources. Log startup and health summary to stderr only. Support `list_changed`/refresh behavior when wallet changes cause the EVM adapter or custom tool surface to change. Respect the fallback decision: if the user chooses multi-server mode in `init`, write separate config entries, but keep proxy mode as the default recommendation.
  **Must NOT do**: Do not write to stdout outside MCP wire traffic. Do not expose upstream prompts/resources as if they were tools. Do not make proxy mode mandatory when the user selects multi-server fallback.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: This task stitches together every runtime subsystem and sets the final public contract.
  - Skills: [] — Custom runtime assembly.
  - Omitted: [`frontend-ui-ux`] — No frontend scope.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 12 | Blocked By: 3, 5, 6, 7, 8, 9, 10

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:11` — Same binary supports runtime and `init` modes.
  - Pattern: `FRAMEWORK.md:70` — Proxy architecture requirement and routing idea.
  - Pattern: `FRAMEWORK.md:280` — Tool list must include all three capability sources when available.
  - Pattern: `REFERENCE.md:23` — stdout is reserved for MCP wire traffic; logs go to stderr.
  - External: `https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x` — Stable `Server` API and transport behavior.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `node dist/index.js` starts a valid stdio MCP server with custom + upstream prefixed tools where available.
  - [ ] `node dist/index.js init` routes into the host config flow and supports `--host`, `--mode`, and `--dry-run`.
  - [ ] Runtime logs are emitted to stderr only, with no stdout corruption.
  - [ ] Wallet-driven tool-surface changes trigger a refresh/list-changed path or deterministic runtime re-exposure.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Proxy runtime starts with aggregated tools
    Tool: Bash
    Steps: run `npm test -- tests/runtime/proxy-runtime.test.ts`
    Expected: tests prove the runtime exposes custom tools plus any available `blockscout_` and `evm_` prefixed tools through one MCP server
    Evidence: .sisyphus/evidence/task-11-proxy.txt

  Scenario: Optional backend outage still allows startup
    Tool: Bash
    Steps: run `npm test -- tests/runtime/proxy-degraded.test.ts`
    Expected: test proves startup succeeds with reduced toolset and `server_status` reflects the missing backend
    Evidence: .sisyphus/evidence/task-11-proxy-degraded.txt
  ```

  **Commit**: YES | Message: `feat(runtime): assemble proxy server and cli contract` | Files: `src/index.ts`, `src/runtime/**`, `tests/runtime/**`

- [ ] 12. Ship `WEB3_CONTEXT.md`, complete the release matrix, and harden publish readiness

  **What to do**: Finalize the package for release. Author and ship `WEB3_CONTEXT.md` so it matches the actual v1 routing behavior (hosted Blockscout, local EVM subprocess, custom web3 tools). Add fixture-backed end-to-end tests for every supported host, every `init` mode (`proxy` and `multi-server`), tarball contents, and release smoke checks. Add CI for install/build/test/pack on Node 18. Default CI/publish behavior to PR/build validation plus manual npm publish; do not assume automated tag-publish because the user never requested or confirmed that workflow. Ensure repeated `npm pack` runs produce stable, complete artifacts.
  **Must NOT do**: Do not publish docs/context that promise OpenClaw or generic-host support in v1. Do not silently omit `WEB3_CONTEXT.md` from the tarball. Do not add auto-publish automation as if it were a settled requirement.

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: This task combines packaging, context authoring, fixture documentation, and release checks.
  - Skills: [] — No special local skill required.
  - Omitted: [`frontend-ui-ux`] — No interface work.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: none | Blocked By: 1, 2, 4, 11

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `FRAMEWORK.md:216` — `WEB3_CONTEXT.md` purpose and routing guidance.
  - Pattern: `FRAMEWORK.md:305` — Package quality expectations for install/build/pack.
  - Pattern: `FRAMEWORK.md:309` — Published package must include `WEB3_CONTEXT.md`.
  - Pattern: `MCP_REFERENCE.md:220` — Existing user-facing validation prompts that should inspire fixture/smoke checks.
  - External: `https://code.claude.com/docs/en/mcp` — Current Claude host behavior for project-level MCP configs.
  - External: `https://opencode.ai/docs/mcp-servers/` — Current OpenCode docs for config examples.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `WEB3_CONTEXT.md` ships in the tarball and matches the actual v1 routing behavior.
  - [ ] CI runs install/build/test/pack on Node 18 and fails on missing publish assets.
  - [ ] End-to-end fixture tests cover proxy mode and multi-server fallback for all four hosts.
  - [ ] `npm pack` produces a stable tarball with no missing runtime/context files.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```bash
  Scenario: Tarball contains runtime and context assets
    Tool: Bash
    Steps: run `npm pack`; inspect tarball contents via `tar -tf web3agent-*.tgz`
    Expected: tarball includes `dist/**`, `package.json`, and `WEB3_CONTEXT.md` with no missing core assets
    Evidence: .sisyphus/evidence/task-12-pack.txt

  Scenario: Host fixture release matrix stays green
    Tool: Bash
    Steps: run `npm test -- tests/e2e/host-matrix.test.ts`
    Expected: test proves proxy and multi-server init outputs remain correct across Claude Code, Cursor, Windsurf, and OpenCode fixtures
    Evidence: .sisyphus/evidence/task-12-host-matrix.txt
  ```

  **Commit**: YES | Message: `chore(release): ship context asset and publish matrix` | Files: `WEB3_CONTEXT.md`, `.github/workflows/**`, `tests/e2e/**`, `README.md`

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Create one commit per completed task using the messages listed in each task; do not squash during implementation unless the user later requests history cleanup.
- Keep the runtime foundation (`2`, `3`, `7`, `8`, `11`) isolated from integration tasks so regressions can be bisected quickly.
- Reserve the final packaging/release commit for tarball, context asset, and CI/publish verification changes.

## Success Criteria
- The package installs and builds cleanly on Node 18+ and is publish-ready through `npm pack`.
- `init` safely configures the four supported hosts, supports dry-run output, and never trashes unrelated config.
- Proxy mode starts with hosted Blockscout + managed EVM/local custom tools where available, and degrades gracefully when optional backends are offline.
- Wallet activation/deactivation, confirmation queueing, and startup resolution behave deterministically across restarts.
- GOAT, LI.FI, and validated Orbs capabilities are available behind clear tiering rules and chain-aware execution.
- Automated tests and task-level QA evidence prove the package can be executed by agents without human guesswork.
