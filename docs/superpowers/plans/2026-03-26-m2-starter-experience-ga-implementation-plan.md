# M2 Starter Experience GA Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `npm create web3agent` as the fastest supported path to a working Web3-capable agent, starting with a real scaffolder package and a production-grade first starter template.

**Architecture:** Keep starter creation rooted in the main `web3agent` package under `src/create/**` and `templates/create/**`, so `npx web3agent create` is the primary supported entrypoint. Keep `packages/create-web3agent` as a thin compatibility wrapper for `npm create web3agent`. Keep every starter wired to the existing `web3agent` runtime and root API surfaces so lifecycle semantics stay aligned with the M1 MCP, CLI, and SDK contracts.

**Tech Stack:** TypeScript, Node.js 22+, pnpm workspaces, tsup, Vitest, existing `web3agent` runtime/root APIs, Vercel AI SDK, Mastra, MCP stdio hosting.

---

## Scope guardrails

- Do not introduce a parallel execution engine. Templates must call `web3agent` public package surfaces (`web3agent`, `web3agent/runtime`) only.
- Preserve the M1 install contract: guide-first self-install for terminal-capable hosts; `init` only where host contracts are already stable.
- Keep lifecycle examples aligned with the canonical safe-write discipline:
  - queue or prepare
  - simulate
  - explicit confirm / external wallet handoff
  - execute
  - resume / status verification
- Do not expand into OWS or wallet-substrate work in this milestone.

## Proposed file map

### Compatibility wrapper package

- Create: `packages/create-web3agent/package.json`
- Create: `packages/create-web3agent/tsconfig.json`
- Create: `packages/create-web3agent/tsup.config.ts`
- Create: `packages/create-web3agent/src/index.ts`

### Root create implementation

- Create: `src/create/cli.ts`
- Create: `src/create/args.ts`
- Create: `src/create/create.ts`
- Create: `src/create/templates.ts`
- Create: `src/create/render.ts`
- Create: `src/create/validate.ts`
- Create: `src/create/postinstall.ts`
- Create: `src/create/template-manifest.ts`

### Bundled template assets

- Create: `templates/create/vercel-ai-sdk/**`
- Create: `templates/create/mastra/**`
- Create: `templates/create/mcp-host/**`

### Workspace template smoke fixtures / examples

- Create or promote: `examples/starter-vercel-ai-sdk/**`
- Create: `examples/starter-mastra/**`
- Create: `examples/starter-mcp-host/**`

### Root repo wiring

- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `vitest.config.ts`

### Tests

- Create: `tests/create-web3agent/args.test.ts`
- Create: `tests/create-web3agent/render.test.ts`
- Create: `tests/create-web3agent/validate.test.ts`
- Create: `tests/create-web3agent/scaffold.test.ts`
- Create: `tests/e2e/create-web3agent-smoke.test.ts`

## Chunk 1: Scaffolder Foundation

### Task 1: Add the compatibility `create-web3agent` workspace package

**Files:**
- Create: `packages/create-web3agent/package.json`
- Create: `packages/create-web3agent/tsconfig.json`
- Create: `packages/create-web3agent/tsup.config.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`

- [ ] **Step 1: Write the failing workspace/package wiring test**

Create `tests/create-web3agent/scaffold.test.ts` assertions that fail until:
- the workspace includes `packages/*`
- `packages/create-web3agent/package.json` exists
- the package declares a bin entry for `create-web3agent`

- [ ] **Step 2: Run the targeted test to verify the failure**

Run: `pnpm test -- --run tests/create-web3agent/scaffold.test.ts`
Expected: FAIL because the package and workspace wiring do not exist yet.

- [ ] **Step 3: Add minimal package/build wiring**

Implement:
- workspace inclusion in `pnpm-workspace.yaml`
- root scripts that build and typecheck the new package in addition to the root package
- a standalone `create-web3agent` compatibility package with `bin`, `build`, and `typecheck` scripts

- [ ] **Step 4: Run the targeted test again**

Run: `pnpm test -- --run tests/create-web3agent/scaffold.test.ts`
Expected: PASS for package existence and workspace wiring.

### Task 2: Implement CLI argument parsing and template registry

**Files:**
- Create: `src/create/args.ts`
- Create: `src/create/template-manifest.ts`
- Create: `src/create/templates.ts`
- Create: `tests/create-web3agent/args.test.ts`

- [ ] **Step 1: Write failing CLI parsing and manifest tests**

Cover:
- `--template <id>`
- `--yes`
- `--skip-install`
- `--skip-checks`
- target directory handling
- supported template IDs (`vercel-ai-sdk`, `mastra`, `mcp-host`)

- [ ] **Step 2: Run the targeted tests to verify failure**

Run: `pnpm test -- --run tests/create-web3agent/args.test.ts`
Expected: FAIL because the parser and manifest do not exist.

- [ ] **Step 3: Implement the minimal parser and template metadata**

Implement:
- non-interactive parsing
- template metadata with labels, summaries, package manager defaults, and status flags
- helpful error messages for unsupported or missing template IDs

- [ ] **Step 4: Run the targeted tests again**

Run: `pnpm test -- --run tests/create-web3agent/args.test.ts`
Expected: PASS.

## Chunk 2: Shared Rendering, Validation, and Post-Install Checks

### Task 3: Build the render pipeline for bundled starter templates

**Files:**
- Create: `src/create/render.ts`
- Create: `src/create/create.ts`
- Create: `tests/create-web3agent/render.test.ts`

- [ ] **Step 1: Write failing render tests**

Cover:
- recursive template copy
- token replacement for project name and package metadata
- omission of files that should remain template-only
- refusal to overwrite non-empty directories unless explicitly supported later

- [ ] **Step 2: Run the targeted tests to verify failure**

Run: `pnpm test -- --run tests/create-web3agent/render.test.ts`
Expected: FAIL because rendering helpers are missing.

- [ ] **Step 3: Implement the minimal render pipeline**

Implement:
- recursive copy from bundled template assets
- token substitution helpers
- directory safety checks
- a top-level `createProject()` orchestration entrypoint

- [ ] **Step 4: Run the targeted tests again**

Run: `pnpm test -- --run tests/create-web3agent/render.test.ts`
Expected: PASS.

### Task 4: Add environment validation and post-install checks

**Files:**
- Create: `src/create/validate.ts`
- Create: `src/create/postinstall.ts`
- Create: `tests/create-web3agent/validate.test.ts`

- [ ] **Step 1: Write failing validation tests**

Cover:
- Node.js 22+ enforcement
- writable target directory validation
- post-install command planning (`install`, `check`, next-steps output)
- skip flags for offline / CI usage

- [ ] **Step 2: Run the targeted tests to verify failure**

Run: `pnpm test -- --run tests/create-web3agent/validate.test.ts`
Expected: FAIL because validation and post-install logic are absent.

- [ ] **Step 3: Implement minimal validation and post-install planning**

Implement:
- version guard
- target path checks
- shared post-install command planner
- human-readable next steps and troubleshooting hooks

- [ ] **Step 4: Run the targeted tests again**

Run: `pnpm test -- --run tests/create-web3agent/validate.test.ts`
Expected: PASS.

## Chunk 3: First PR-Sized Slice

### Task 5: Ship the Vercel AI SDK starter as the first production template

**Files:**
- Create or promote: `examples/starter-vercel-ai-sdk/package.json`
- Create or promote: `examples/starter-vercel-ai-sdk/src/index.ts`
- Create: `examples/starter-vercel-ai-sdk/src/tools.ts`
- Create: `examples/starter-vercel-ai-sdk/src/examples/lifecycle.ts`
- Create: `examples/starter-vercel-ai-sdk/README.md`
- Create: `examples/starter-vercel-ai-sdk/.env.example`
- Create: `templates/create/vercel-ai-sdk/**`

- [ ] **Step 1: Write failing smoke coverage for the first template**

Create `tests/e2e/create-web3agent-smoke.test.ts` coverage that expects:
- the scaffolder can materialize the Vercel template into a temp directory
- the generated project contains a runtime-backed tool loader
- the generated project includes a first-write tutorial and a lifecycle example file

- [ ] **Step 2: Run the targeted smoke test to verify failure**

Run: `pnpm test -- --run tests/e2e/create-web3agent-smoke.test.ts`
Expected: FAIL because the template source and scaffolder flow do not exist yet.

- [ ] **Step 3: Implement the Vercel template with public-surface runtime usage**

Implement:
- `web3agent/runtime` tool discovery in the starter app
- a first-write lifecycle example that demonstrates:
  - quote / queue
  - explicit confirmation
  - execute / resume / status semantics
- template quickstart and troubleshooting content
- copy or build-time bundling of the template into `templates/create/vercel-ai-sdk`

- [ ] **Step 4: Run the targeted smoke test again**

Run: `pnpm test -- --run tests/e2e/create-web3agent-smoke.test.ts`
Expected: PASS for materialization and file-contract coverage.

### Task 6: Expose the scaffolder CLI end to end for the first slice

**Files:**
- Create: `src/create/cli.ts`
- Create: `src/create/index.ts`
- Create: `packages/create-web3agent/src/index.ts`
- Modify: `src/cli.ts`
- Modify: `README.md`

- [ ] **Step 1: Write a failing end-to-end scaffolder invocation test**

Extend `tests/create-web3agent/scaffold.test.ts` to assert:
- `create-web3agent my-agent --template vercel-ai-sdk --skip-install`
- project directory creation
- post-install instructions mention the template’s quickstart path

- [ ] **Step 2: Run the targeted test to verify failure**

Run: `pnpm test -- --run tests/create-web3agent/scaffold.test.ts`
Expected: FAIL because the CLI entrypoint is not wired.

- [ ] **Step 3: Implement the CLI entrypoint**

Implement:
- `web3agent create` as the primary executable path
- `create-web3agent` as a thin compatibility wrapper
- non-interactive happy path for CI/tests
- interactive template selection when running in a TTY
- post-install summary output

- [ ] **Step 4: Run the targeted test again**

Run: `pnpm test -- --run tests/create-web3agent/scaffold.test.ts`
Expected: PASS.

## Chunk 4: Remaining M2 Completion Work

### Task 7: Add the Mastra starter template

**Files:**
- Create: `examples/starter-mastra/**`
- Create: `templates/create/mastra/**`
- Modify: `src/create/template-manifest.ts`
- Test: `tests/e2e/create-web3agent-smoke.test.ts`

- [ ] Add a Mastra starter that wraps the same runtime/root API lifecycle semantics.
- [ ] Include one full lifecycle example and first-write tutorial.
- [ ] Extend smoke coverage to materialize the Mastra template.

### Task 8: Add the MCP-host quickstart template

**Files:**
- Create: `examples/starter-mcp-host/**`
- Create: `templates/create/mcp-host/**`
- Modify: `src/create/template-manifest.ts`
- Test: `tests/e2e/create-web3agent-smoke.test.ts`

- [ ] Add a local MCP-host quickstart template using `npx web3agent` / `web3agent/runtime` with no parallel execution model.
- [ ] Include one full lifecycle example and troubleshooting.
- [ ] Extend smoke coverage to materialize the MCP-host template.

### Task 9: Add cross-template docs, recipes, and troubleshooting

**Files:**
- Modify: `README.md`
- Create or modify: template `README.md` files
- Create: shared troubleshooting section(s) under template docs as needed

- [ ] Add quickstart docs per template.
- [ ] Add first-write tutorial per template.
- [ ] Add troubleshooting for Node version, missing env, wallet mode, degraded services, and confirmation queue expectations.
- [ ] Document the three lifecycle recipe families:
  - quote -> simulate -> prepare -> confirm -> execute -> resume -> status
  - bridge + swap
  - external-wallet order / intent flow

### Task 10: Add CI smoke coverage for generated projects

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: root `package.json`
- Test: `tests/e2e/create-web3agent-smoke.test.ts`

- [ ] Add workspace or temp-project smoke commands that run in CI without requiring live chain execution.
- [ ] Verify generated starter projects build and run their imports-only / local smoke checks.
- [ ] Keep smoke coverage aligned with the canonical lifecycle examples to prevent MCP, CLI, and SDK drift.

## First slice execution target

This plan’s first PR-sized execution slice is:

1. `packages/create-web3agent` workspace/package skeleton
2. root-owned shared args + template registry + render + validation plumbing
3. end-to-end CLI scaffolding for `web3agent create --template vercel-ai-sdk`
4. first production starter based on the Vercel AI SDK/runtime discovery path
5. file-contract smoke tests for the generated project

## Verification gates

Before calling the first slice complete, run:

```bash
pnpm test -- --run tests/create-web3agent/args.test.ts tests/create-web3agent/render.test.ts tests/create-web3agent/validate.test.ts tests/create-web3agent/scaffold.test.ts tests/e2e/create-web3agent-smoke.test.ts
pnpm typecheck
pnpm build
pnpm test
```

Expected:
- the new scaffolder tests pass
- root typecheck still passes
- root build includes the create package build
- existing repo tests remain green

## Notes for implementation

- Use the existing `examples/agent-playground` structure as the design seed for the first Vercel starter, but promote it into an intentional starter with template tokens, docs, and lifecycle examples instead of leaving it as an ad hoc playground.
- Prefer local, deterministic smoke tests over live network execution in CI.
- Any starter example that demonstrates a write flow should either:
  - run in imports-only / mocked mode in CI, or
  - gate live execution behind explicit env variables, matching the current repo pattern.
