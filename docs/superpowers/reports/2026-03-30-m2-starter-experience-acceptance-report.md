# M2 Starter Experience Acceptance Report

**Date:** 2026-04-01
**Branch:** `codex/m2-starter-slice1`
**Scope:** starter/scaffolder acceptance proof for `web3agent create`

## Summary

This branch now provides `web3agent create` as the primary starter command, with three bundled starters:

- Vercel AI SDK
- Mastra
- MCP-host

The starters stay on public `web3agent` package surfaces and do not introduce a parallel execution model.
The create implementation and template assets are owned by the root package under `src/create/**` and `templates/create/**`.

## Starter Parity Matrix

| Starter | Primary surface | Lifecycle example | Timed path documented | Generated app install/check smoke | Packed create-package smoke |
|---|---|---|---|---|---|
| Vercel AI SDK | `web3agent/runtime` | `lifi_execute_bridge -> transaction_confirm` plus staged lifecycle notes | Yes | Yes | Yes |
| Mastra | `web3agent` root APIs + Mastra tools | `prepareOperation -> simulateTransaction -> resumeOperation` | Yes | Yes | No direct template-specific packed smoke |
| MCP-host | `web3agent/mcp` + `web3agent/runtime` | `lifi_execute_bridge -> transaction_confirm` | Yes | Yes | No direct template-specific packed smoke |

## Verified Evidence

### Scaffolder/package readiness

- root README documents `npx web3agent create`
- root package owns the create implementation and bundled starter assets
- the supported published starter entrypoint remains `npx web3agent create`
- CI packages the root artifact and validates its internal workspace adapter

### Generated project smoke

Verified locally by running generated-project install smoke that:

- scaffolds each starter into a temp directory
- rewrites the generated `web3agent` dependency to the local tarball
- runs `npm install`
- runs `npm run check`

### Packed CLI smoke

Verified locally by:

- packing `web3agent`
- installing the tarball into a temp project
- invoking `web3agent create`
- installing the generated starter
- running `npm run check`

## Commands Used

The following commands were run successfully on this branch during acceptance-proofing:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test tests/e2e/create-web3agent-packaging.test.ts
pnpm test tests/e2e/web3agent-create-cli-install.test.ts
pnpm test tests/e2e/create-web3agent-generated-projects.test.ts
pnpm test
```

Latest full-suite result on this branch:

- `121` test files passed, `2` skipped
- `1474` tests passed, `2` skipped

## What This Proves

- the primary create surface exists in the root `web3agent` package and is pack ready
- the main `web3agent` CLI can scaffold starters directly
- all three templates scaffold successfully
- all three generated starters install and pass their local `check` scripts
- the starter READMEs now document an explicit timed path

## What This Does Not Yet Prove

- real-world time-to-first-write is below 30 seconds for an external user in practice
- a remote GitHub Actions run has passed on this exact branch
- live chain execution success for the example flows without user-supplied credentials and wallets

## Current Honest Status

This branch is no longer just “scaffolding exists.” It now has:

- root-owned create implementation
- root-owned bundled starter assets
- internal starter workspace adapter
- three starters
- post-install execution
- generated-project install smoke
- packed root-package starter smoke
- acceptance report artifact

Remaining M2 risk is no longer local implementation completeness. It is primarily:

- remote CI confirmation on the branch
- external validation of the 30-second first-write claim
