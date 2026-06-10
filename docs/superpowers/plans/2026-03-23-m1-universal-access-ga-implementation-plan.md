# M1 Universal Access GA Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship M1 Universal Access GA so `web3agent` can be installed into priority existing-agent hosts, invoked through a universal CLI surface, and validated with one real safe write flow that behaves consistently across MCP, CLI, and SDK/runtime.

**Architecture:** Keep the current runtime and tool system as the single capability core, then add a thin universal access layer on top of it. Phase 1 should avoid productizing new protocol breadth and instead focus on host adapters, CLI tool parity, degraded-startup hardening, and one canonical parity-tested write flow using existing queue/confirm semantics.

**Tech Stack:** TypeScript, Node.js 22, MCP SDK, Vitest, existing `ManagedRuntime`, existing host writer abstractions, existing confirmation queue and write helpers.

---

## Assumptions And Execution Notes

- The canonical cross-surface safe write flow for M1 will use `lifi_execute_bridge` plus `transaction_confirm`, because it already exercises `executeWrite()` and has existing confirmation-gating coverage in `tests/lifi/lifi-confirmation.test.ts`.
- SDK/runtime parity for M1 means the runtime surface (`createRuntime().invokeTool(...)` and `runtime.transactions.confirm(...)`), not necessarily a new root-package convenience wrapper.
- The canonical self-install artifact for M1 is `docs/guides/universal-access.md`. Any terminal-capable agent should be installable by following that guide directly.
- `web3agent init` is a convenience path for hosts with stable config contracts. For M1, Codex should join that lane; OpenClaw should be first-class through the guide-driven self-install path rather than a new `init` writer.
- OpenClaw and Codex host contracts must still be verified against their actual documentation and centralized in one place so that any late path correction touches one file plus tests.
- M1 should not introduce new wallet assumptions that would block a future OWS-backed local wallet backend. Keep CLI, runtime, and doctor contracts wallet-backend-agnostic where possible.
- `create-web3agent` scaffolder work may begin in parallel, but it is explicitly not on the M1 critical path.

## File Structure

### Core CLI access layer

- Create: `src/cli/commands/tools.ts`
  - CLI entrypoints for `tools list`, `tools describe`, and `tool call`
- Create: `src/cli/commands/doctor.ts`
  - CLI diagnostics and health reporting
- Create: `src/cli/output.ts`
  - Stable JSON envelope helpers and stderr/stdout discipline for CLI commands
- Create: `src/cli/runtime.ts`
  - Shared runtime lifecycle helpers for CLI commands
- Modify: `src/cli.ts`
  - Thin command router only; delegates to command modules

### Host integration surface

- Create: `src/hosts/registry.ts`
  - Single source of truth for supported host IDs, detection markers, config targets, and context targets
- Create: `src/hosts/writers/codex.ts`
  - Codex config writer
- Modify: `src/hosts/detect.ts`
  - Detect OpenClaw and Codex markers using centralized host registry
- Modify: `src/cli/init.ts`
  - Route to new host writers where stable config contracts exist
- Modify: `src/hosts/context/index.ts`
  - Add host-specific context targets if those hosts support managed instruction/context files

### Runtime hardening

- Modify: `src/runtime/managed-runtime.ts`
  - Remove eager optional-backend initialization from startup critical path where possible
- Modify: `src/lifi/config.ts`
  - Make LI.FI initialization lazy and idempotent without causing startup network calls
- Modify: `src/runtime/startup.ts`
  - Keep startup summary usable when optional backends are degraded
- Modify: `src/config/health.ts`
  - Reuse or extend startup-formatting helpers if doctor output should match startup semantics

### Tests

- Create: `tests/cli/tools-command.test.ts`
  - Unit tests for `tools list`, `tools describe`, and `tool call`
- Create: `tests/cli/doctor.test.ts`
  - Unit tests for diagnostics / doctor output
- Create: `tests/e2e/cli-parity.test.ts`
  - Cross-surface parity test for one real safe write flow
- Create: `tests/fixtures/hosts/codex-project/.gitkeep`
  - Host detection fixture
- Create: `tests/fixtures/hosts/openclaw-project/.gitkeep`
  - Host detection fixture
- Modify: `tests/cli/init.test.ts`
  - New writer routing and dry-run behavior
- Modify: `tests/hosts/detect.test.ts`
  - Detection coverage for OpenClaw and Codex
- Modify: `tests/hosts/writers.test.ts`
  - Writer behavior for Codex plus existing hosts
- Modify: `tests/hosts/context.test.ts`
  - Context target handling for new hosts if applicable
- Modify: `tests/e2e/host-matrix.test.ts`
  - Extend host matrix
- Modify: `tests/runtime/proxy-degraded.test.ts`
  - Startup hardening coverage
- Modify: `tests/lifi/lifi-confirmation.test.ts`
  - Reuse or extend confirmation-gating write fixture expectations

### Docs

- Modify: `README.md`
  - Host support table, CLI usage, doctor command, parity expectations
- Create: `docs/guides/universal-access.md`
  - Canonical install guide with `For Humans` and `For LLM Agents` sections and a stable raw Markdown URL

---

## Chunk 1: CLI Access Contract

### Task 1: Extract CLI command routing and JSON output helpers

**Files:**
- Create: `src/cli/output.ts`
- Create: `src/cli/runtime.ts`
- Modify: `src/cli.ts`
- Test: `tests/cli/tools-command.test.ts`

- [ ] **Step 1: Write the failing routing tests**

```ts
it("routes `web3agent tools list` to the tools command module", async () => {
  // expect tools command runner to be called with no mutation of stdout/stderr conventions
});

it("routes `web3agent doctor --json` to the doctor command module", async () => {
  // expect doctor command runner to be called
});
```

- [ ] **Step 2: Run the routing tests to verify they fail**

Run:

```bash
pnpm test -- --run tests/cli/tools-command.test.ts
```

Expected:

- FAIL because the new modules and routing branches do not exist yet

- [ ] **Step 3: Implement the thin CLI dispatcher**

```ts
if (args[0] === "tools") {
  await runToolsCommand(args.slice(1));
  return;
}

if (args[0] === "doctor") {
  await runDoctorCommand(args.slice(1));
  return;
}
```

- [ ] **Step 4: Implement shared CLI output helpers**

```ts
export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function failJson(code: string, message: string): never {
  writeJson({ ok: false, error: { code, message } });
  process.exit(1);
}
```

- [ ] **Step 5: Run the routing tests again**

Run:

```bash
pnpm test -- --run tests/cli/tools-command.test.ts
```

Expected:

- PASS for the new routing assertions

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts src/cli/output.ts src/cli/runtime.ts tests/cli/tools-command.test.ts
git commit -m "feat: add cli command dispatcher and output helpers"
```

### Task 2: Implement `tools list` and `tools describe`

**Files:**
- Create: `src/cli/commands/tools.ts`
- Modify: `src/cli/runtime.ts`
- Modify: `src/cli/output.ts`
- Test: `tests/cli/tools-command.test.ts`

- [ ] **Step 1: Write the failing command tests**

```ts
it("prints a stable JSON catalog for `tools list --json`", async () => {
  expect(parsed).toEqual({
    ok: true,
    data: {
      tools: [
        expect.objectContaining({
          name: "wallet_generate",
          source: "wallet",
          category: "wallet",
          riskLevel: "safe",
        }),
      ],
    },
  });
});

it("prints schema and metadata for `tools describe resolve_token --json`", async () => {
  expect(parsed.data.tool.name).toBe("resolve_token");
  expect(parsed.data.tool.inputSchema).toBeDefined();
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
pnpm test -- --run tests/cli/tools-command.test.ts
```

Expected:

- FAIL because `runToolsCommand()` does not support `list` or `describe`

- [ ] **Step 3: Implement the minimal list/describe handlers**

```ts
if (subcommand === "list") {
  const runtime = await withCliRuntime();
  writeJson({ ok: true, data: { tools: runtime.listTools() } });
}

if (subcommand === "describe") {
  const tool = runtime.getTool(name);
  if (!tool) failJson("UNKNOWN_TOOL", `Unknown tool: ${name}`);
  writeJson({ ok: true, data: { tool } });
}
```

- [ ] **Step 4: Run the tests again**

Run:

```bash
pnpm test -- --run tests/cli/tools-command.test.ts
```

Expected:

- PASS for list/describe cases

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/tools.ts src/cli/runtime.ts src/cli/output.ts tests/cli/tools-command.test.ts
git commit -m "feat: add cli tools list and describe commands"
```

### Task 3: Implement `tool call` with one real safe write parity flow

**Files:**
- Modify: `src/cli/commands/tools.ts`
- Modify: `src/cli/output.ts`
- Create: `tests/e2e/cli-parity.test.ts`
- Modify: `tests/lifi/lifi-confirmation.test.ts`

- [ ] **Step 1: Write the failing `tool call` tests**

Use `lifi_execute_bridge` as the canonical flow and mock `@lifi/sdk` just as existing LI.FI tests do.

```ts
it("returns pending_confirmation for `tool call lifi_execute_bridge --input ... --json`", async () => {
  expect(parsed.data.status).toBe("pending_confirmation");
  expect(parsed.data.id).toEqual(expect.any(String));
});

it("completes the queued flow through `tool call transaction_confirm --input ... --json`", async () => {
  expect(parsed.data.status ?? parsed.data.confirmed).toBeDefined();
});

it("matches runtime semantics for the same queued write flow", async () => {
  // runtime.invokeTool("lifi_execute_bridge", ...) -> pending_confirmation
  // runtime.transactions.confirm(id) -> executed result
});
```

- [ ] **Step 2: Run the parity tests to verify failure**

Run:

```bash
pnpm test -- --run tests/e2e/cli-parity.test.ts tests/lifi/lifi-confirmation.test.ts
```

Expected:

- FAIL because `tool call` and parity helpers do not exist yet

- [ ] **Step 3: Implement `tool call`**

Use a minimal contract for M1:

```ts
web3agent tool call <toolName> --input '{"fromChainId":1,...}' --json
```

Implementation shape:

```ts
const args = JSON.parse(inputJson);
const result = await runtime.invokeTool(toolName, args);
const payload = getToolResultPayload(result);
writeJson(payload.ok ? { ok: true, data: payload.data } : payload);
```

- [ ] **Step 4: Make `transaction_confirm` callable through the same CLI path**

No special branch. It must work because `tool call` delegates to runtime tool invocation generically.

- [ ] **Step 5: Run the parity tests again**

Run:

```bash
pnpm test -- --run tests/e2e/cli-parity.test.ts tests/lifi/lifi-confirmation.test.ts
```

Expected:

- PASS with equivalent lifecycle semantics for:
  - queued write
  - queued ID handoff
  - confirmation execution

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/tools.ts src/cli/output.ts tests/e2e/cli-parity.test.ts tests/lifi/lifi-confirmation.test.ts
git commit -m "feat: add cli tool call and safe write parity flow"
```

## Chunk 2: Host Installation Surface

### Task 4: Centralize host contracts and extend detection for OpenClaw and Codex

**Files:**
- Create: `src/hosts/registry.ts`
- Modify: `src/hosts/detect.ts`
- Modify: `tests/hosts/detect.test.ts`
- Create: `tests/fixtures/hosts/openclaw-project/.gitkeep`
- Create: `tests/fixtures/hosts/codex-project/.gitkeep`

- [ ] **Step 1: Verify OpenClaw and Codex host contracts**

Record one canonical detection marker per host and the best-known install/context target metadata inside `src/hosts/registry.ts`. If official docs differ from prior assumptions, update only this registry and the fixture paths before proceeding. OpenClaw metadata may be guide-oriented rather than `init`-writer-oriented.

- [ ] **Step 2: Write the failing detection tests**

```ts
it("detects openclaw from its canonical marker", async () => {
  expect(result.detected).toContain("openclaw");
});

it("detects codex from its canonical marker", async () => {
  expect(result.detected).toContain("codex");
});
```

- [ ] **Step 3: Run the detection tests to verify failure**

Run:

```bash
pnpm test -- --run tests/hosts/detect.test.ts
```

Expected:

- FAIL because the new hosts are not in the supported-host union or detection checks

- [ ] **Step 4: Implement centralized host metadata**

```ts
export const HOSTS = {
  claude: { ... },
  codex: { detectionPaths: [...] },
  openclaw: { detectionPaths: [...] },
} as const;
```

Update `detectHosts()` and `assertSingleHost()` to derive from this registry instead of duplicating host IDs.

- [ ] **Step 5: Run the detection tests again**

Run:

```bash
pnpm test -- --run tests/hosts/detect.test.ts
```

Expected:

- PASS for OpenClaw and Codex coverage

- [ ] **Step 6: Commit**

```bash
git add src/hosts/registry.ts src/hosts/detect.ts tests/hosts/detect.test.ts tests/fixtures/hosts/openclaw-project/.gitkeep tests/fixtures/hosts/codex-project/.gitkeep
git commit -m "feat: add codex and openclaw host detection"
```

### Task 5: Add Codex writer, wire `init`, and keep OpenClaw guide-driven

**Files:**
- Create: `src/hosts/writers/codex.ts`
- Modify: `src/cli/init.ts`
- Modify: `src/hosts/context/index.ts`
- Modify: `tests/cli/init.test.ts`
- Modify: `tests/hosts/writers.test.ts`
- Modify: `tests/hosts/context.test.ts`
- Modify: `tests/e2e/host-matrix.test.ts`

- [ ] **Step 1: Write the failing writer and init tests**

```ts
it("routes init to CodexWriter when --host codex is selected", async () => {
  expect(mockState.codexWrite).toHaveBeenCalled();
});

it("supports codex in the host matrix dry-run flow", async () => {
  expect(result).toBe("");
});
```

- [ ] **Step 2: Run the host and init tests to verify failure**

Run:

```bash
pnpm test -- --run tests/cli/init.test.ts tests/hosts/writers.test.ts tests/hosts/context.test.ts tests/e2e/host-matrix.test.ts
```

Expected:

- FAIL because the Codex writer and routes do not exist yet

- [ ] **Step 3: Implement the Codex writer**

Follow the existing `BaseHostWriter` pattern first; do not introduce a new config-writing abstraction unless the host contract truly requires it.

```ts
export class CodexWriter extends BaseHostWriter {
  protected getConfigPath(options: WriteOptions): string {
    return resolvedCodexPathFromRegistry(options.projectDir);
  }
}
```

- [ ] **Step 4: Wire `runInit()` and managed context installation**

Update writer selection in `src/cli/init.ts` for Codex. If Codex needs instruction/context files, add the new target paths in `src/hosts/context/index.ts`; otherwise return a deliberate no-op or explicit unchanged result rather than inventing bogus context files. Do not add an OpenClaw writer here; OpenClaw remains guide-driven in M1.

- [ ] **Step 5: Run the host and init tests again**

Run:

```bash
pnpm test -- --run tests/cli/init.test.ts tests/hosts/writers.test.ts tests/hosts/context.test.ts tests/e2e/host-matrix.test.ts
```

Expected:

- PASS for routing, writer behavior, and dry-run host matrix coverage, including Codex

- [ ] **Step 6: Commit**

```bash
git add src/hosts/writers/codex.ts src/cli/init.ts src/hosts/context/index.ts tests/cli/init.test.ts tests/hosts/writers.test.ts tests/hosts/context.test.ts tests/e2e/host-matrix.test.ts
git commit -m "feat: add codex install surface"
```

## Chunk 3: Runtime Hardening, Doctor, And Docs

### Task 6: Add `doctor` command and capability diagnostics

**Files:**
- Create: `src/cli/commands/doctor.ts`
- Modify: `src/cli/runtime.ts`
- Modify: `src/config/health.ts`
- Create: `tests/cli/doctor.test.ts`

- [ ] **Step 1: Write the failing doctor tests**

```ts
it("prints machine-readable backend and tool health with --json", async () => {
  expect(parsed.ok).toBe(true);
  expect(parsed.data.health.backends).toBeDefined();
});

it("returns actionable diagnostics when a backend is degraded", async () => {
  expect(parsed.data.issues).toContainEqual(
    expect.objectContaining({ code: expect.any(String), fix: expect.any(String) })
  );
});
```

- [ ] **Step 2: Run the doctor tests to verify failure**

Run:

```bash
pnpm test -- --run tests/cli/doctor.test.ts
```

Expected:

- FAIL because the command does not exist

- [ ] **Step 3: Implement doctor output using the runtime health contract**

```ts
const runtime = await createRuntime();
const health = runtime.getHealth();
writeJson({
  ok: true,
  data: {
    health,
    issues: buildDoctorIssues(health),
  },
});
```

- [ ] **Step 4: Run the doctor tests again**

Run:

```bash
pnpm test -- --run tests/cli/doctor.test.ts
```

Expected:

- PASS for JSON and degraded-diagnostics coverage

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/doctor.ts src/cli/runtime.ts src/config/health.ts tests/cli/doctor.test.ts
git commit -m "feat: add cli doctor command"
```

### Task 7: Remove eager LI.FI startup coupling and harden degraded boot

**Files:**
- Modify: `src/runtime/managed-runtime.ts`
- Modify: `src/lifi/config.ts`
- Modify: `tests/runtime/proxy-degraded.test.ts`
- Modify: `tests/lifi/lifi-confirmation.test.ts`

- [ ] **Step 1: Write the failing startup-hardening tests**

Use the existing degraded startup test style and assert that runtime creation does not require an eager LI.FI network touch.

```ts
it("does not initialize LI.FI during runtime bootstrap", async () => {
  expect(initializeLifi).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the degraded startup tests to verify failure**

Run:

```bash
pnpm test -- --run tests/runtime/proxy-degraded.test.ts tests/lifi/lifi-confirmation.test.ts
```

Expected:

- FAIL because startup still eagerly initializes optional backend state

- [ ] **Step 3: Implement lazy LI.FI initialization**

Minimal change:

- remove eager `initializeLifi(config.lifiApiKey)` from runtime bootstrap
- keep `ensureLifiInitialized()` at the LI.FI tool boundary
- preserve idempotency in `src/lifi/config.ts`

- [ ] **Step 4: Run the degraded startup tests again**

Run:

```bash
pnpm test -- --run tests/runtime/proxy-degraded.test.ts tests/lifi/lifi-confirmation.test.ts
```

Expected:

- PASS, with runtime startup decoupled from LI.FI network initialization

- [ ] **Step 5: Commit**

```bash
git add src/runtime/managed-runtime.ts src/lifi/config.ts tests/runtime/proxy-degraded.test.ts tests/lifi/lifi-confirmation.test.ts
git commit -m "fix: lazily initialize lifi during tool execution"
```

### Task 8: Finish docs and full M1 verification

**Files:**
- Modify: `README.md`
- Create: `docs/guides/universal-access.md`
- Test: `tests/e2e/host-matrix.test.ts`
- Test: `tests/e2e/cli-parity.test.ts`

- [ ] **Step 1: Update docs with the new M1 surfaces**

Add:

- host support table entries for OpenClaw and Codex
- CLI usage for `tools list`, `tools describe`, `tool call`, and `doctor`
- note that the canonical guide is the self-install contract for terminal-capable agents
- note that CLI is the universal fallback when MCP is unavailable
- one real safe write parity walkthrough
- `docs/guides/universal-access.md` with:
  - `For Humans`
  - `For LLM Agents`
  - stable raw GitHub URL
  - deterministic guide-driven self-install steps for all priority hosts
  - explicit host-native `init` fast paths where contracts are stable
  - explicit OpenClaw agent-mediated install flow
  - CLI fallback steps
  - doctor / troubleshooting steps

- [ ] **Step 2: Run focused verification**

Run:

```bash
pnpm test -- --run tests/cli/tools-command.test.ts tests/cli/doctor.test.ts tests/hosts/detect.test.ts tests/hosts/writers.test.ts tests/hosts/context.test.ts tests/e2e/host-matrix.test.ts tests/e2e/cli-parity.test.ts tests/runtime/proxy-degraded.test.ts tests/lifi/lifi-confirmation.test.ts
```

Expected:

- PASS for all M1-focused tests

- [ ] **Step 3: Run repo-wide verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Expected:

- all commands succeed

- [ ] **Step 4: Commit**

```bash
git add README.md docs/guides/universal-access.md tests/e2e/host-matrix.test.ts tests/e2e/cli-parity.test.ts
git commit -m "docs: document universal access ga surfaces"
```

## Recommended Execution Order

1. Chunk 1 first
2. Chunk 2 next
3. Chunk 3 after CLI and host surfaces exist

This order keeps the M1 thesis intact:

- universal access first
- real parity second
- hardening and docs before closeout

## Done Definition

M1 is complete only when all of the following are true:

- OpenClaw has a documented guide-driven self-install path through the canonical raw Markdown guide
- Claude Code, Cursor, Windsurf, OpenCode, and Codex have tested `init` or equivalent convenience-install coverage where stable contracts exist
- CLI supports list / describe / call / doctor with stable JSON output
- one real safe write flow works with equivalent lifecycle semantics across MCP, CLI, and SDK/runtime
- degraded optional backends do not block useful startup paths
- focused M1 test suite and full repo verification both pass

Plan complete and saved to `docs/superpowers/plans/2026-03-23-m1-universal-access-ga-implementation-plan.md`. Ready to execute.
