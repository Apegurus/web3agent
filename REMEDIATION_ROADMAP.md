# Remediation Roadmap

## Locked Decisions

The following architectural and behavioral decisions are finalized and must not be revisited without explicit team consensus:

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Wallet-bound confirmations** | Confirmation state is tied to the active wallet; switching wallets resets pending confirmations to prevent cross-wallet authorization leakage. |
| 2 | **Transactional activation** | Wallet activation is atomic — key persistence and in-memory state update succeed together or both roll back. No partial activation states. |
| 3 | **Backend sync on wallet change** | All backend clients (Blockscout, LI.FI, Orbs, etc.) are re-initialized synchronously when the wallet changes, before any new tool calls are accepted. |
| 4 | **Durable operation queue** | Pending confirmations are persisted to disk (not held only in memory) so they survive process restarts and can be audited. |
| 5 | **Required Etherscan API key** | `ETHERSCAN_API_KEY` is a hard runtime requirement for ABI-fetching tools; missing key surfaces a clear error rather than a silent fallback. |
| 6 | **Strict input validation** | All tool inputs are validated against Zod schemas at the boundary before any business logic executes. Invalid inputs are rejected with structured errors. |
| 7 | **Abstraction layer for write operations** | All state-changing operations go through a single `executeWrite()` abstraction that enforces confirmation gating, logging, and error handling uniformly. |
| 8 | **Reconcile docs with implementation** | README and inline JSDoc are kept in sync with actual behavior; documentation drift is treated as a bug. |

---

## Prioritized Remediation Roadmap

### P0 — Critical (Security / Correctness)

- [x] **Wallet-bound confirmation reset**
  - On `wallet-changed` event, flush all pending operations from the durable queue that were created under the previous wallet address.
  - Prevents a pending high-value tx approved for wallet A from being executed after switching to wallet B.

- [x] **Atomic wallet activation**
  - Wrap key-file write + in-memory state update in a transaction-like pattern (write to temp file → fsync → rename).
  - On failure, revert in-memory state and surface error to caller.

- [x] **Durable queue persistence**
  - Serialize pending operations to `~/.web3agent/pending-ops.json` (mode 0600) on every enqueue/dequeue.
  - On startup, load and re-hydrate the queue; prune expired entries before accepting new tool calls.

### P1 — High (Reliability / Developer Experience)

- [x] **Backend sync on wallet change**
  - In the `wallet-changed` handler, await re-initialization of all backend clients before emitting `ready`.
  - Add integration test: switch wallet → assert subsequent tool call uses new wallet address.

- [x] **Required Etherscan key enforcement**
  - At server startup, check for `ETHERSCAN_API_KEY`; if absent, mark ABI-dependent tools as unavailable and surface a clear warning in `server_status`.
  - Do not silently degrade — return a structured error from affected tools.

- [x] **Strict Zod validation at tool boundaries**
  - Audit all tool handlers; ensure every input is parsed with `.parse()` (throws) not `.safeParse()` (silent).
  - Add a shared `validateInput<T>(schema, input)` helper in `src/utils/validation.ts`.

### P2 — Medium (Maintainability / Safety)

- [x] **`executeWrite()` abstraction**
  - Extract a single function in `src/utils/write.ts` that: checks confirmation mode → enqueues or executes → logs result → handles errors uniformly.
  - Migrate all existing write-operation tool handlers to use it.

- [x] **Documentation reconciliation**
  - Audit `README.md` and all JSDoc against current behavior.
  - Update wallet activation flow, confirmation gating, and Etherscan key requirement sections.
  - Add a "Known Limitations" section for chains not supported by Blockscout.

### P3 — Low (Polish / Observability)

- [x] **Structured startup diagnostics**
  - On boot, log version, wallet mode/address, active chain, confirmation setting, and per-adapter health to stderr in a consistent structured block.

- [x] **Pending-ops TTL and audit log**
  - Add configurable TTL via `CONFIRM_TTL_MINUTES` env var (default 30 min).
  - Append expired/denied/confirmed ops to an append-only audit log at `~/.web3agent/audit.log`.

---

## Execution Sequence

Execute remediations in this order to minimize rework and avoid introducing regressions:

```
Phase 1 (P0 — unblock safe operation)
  1. Atomic wallet activation
  2. Durable queue persistence
  3. Wallet-bound confirmation reset

Phase 2 (P1 — reliability hardening)
  4. Backend sync on wallet change
  5. Required Etherscan key enforcement
  6. Strict Zod validation at tool boundaries

Phase 3 (P2 — maintainability)
  7. executeWrite() abstraction + migration
  8. Documentation reconciliation

Phase 4 (P3 — polish)
  9. Structured startup diagnostics
 10. Pending-ops TTL and audit log
```

Each phase must pass all existing tests before the next phase begins.

---

## Verification Plan

### Per-Item Acceptance Criteria

| Item | Verification Method |
|------|---------------------|
| Atomic wallet activation | Unit test: simulate fsync failure → assert in-memory state unchanged and key file absent. |
| Durable queue persistence | Integration test: enqueue op → kill process → restart → assert op still pending. |
| Wallet-bound confirmation reset | Integration test: enqueue op as wallet A → switch to wallet B → assert queue empty. |
| Backend sync on wallet change | Integration test: switch wallet → call `get_address` → assert returns new wallet address. |
| Etherscan key enforcement | Unit test: start server without key → call `evm_get_contract_abi` → assert structured error, not crash. |
| Strict Zod validation | Unit test: pass invalid address to any tool → assert `ZodError` surfaces as tool error, not unhandled exception. |
| `executeWrite()` abstraction | Code review: grep for direct state-mutation calls outside `executeWrite()` → zero results. |
| Documentation reconciliation | Manual review: README activation flow matches `wallet_activate` implementation line-by-line. |

### Regression Gate

Before merging any phase:

```bash
npx biome check .          # zero errors
npx vitest run             # all tests green
npx tsc --noEmit           # zero type errors
```

### Sign-off

Each phase requires sign-off from at least one reviewer who was not the implementer.
