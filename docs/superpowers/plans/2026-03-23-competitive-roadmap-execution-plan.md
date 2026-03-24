# Competitive Roadmap — Milestone Execution Plan

> Parent spec: `docs/superpowers/specs/2026-03-23-web3agent-product-spec-roadmap.md`

## Execution model

- **Tracking:** milestone-based
- **Primary objective:** make `web3agent` the default portable Web3 upgrade and execution substrate for AI agents
- **Locked priorities:**
  1. Universal access first: host installs + CLI parity + degraded startup + doctor tooling
  2. Starter/scaffolder second: Vercel AI SDK, Mastra, MCP-host
  3. Protocol depth third: Compound + Morpho + Aave
  4. Wallet interoperability lane fourth: evaluate OWS as preferred local wallet substrate first, CDP optional second
  5. Agent-economy cohesion is a cross-milestone design requirement

M2 and M3 both roll up to **Horizon 2** from the product spec:

- **Horizon 2A:** starter experience
- **Horizon 2B:** protocol depth

## Milestone M1 — Universal Access GA

## Goal

Ship first-class installation and invocation surfaces for existing agents:

- OpenClaw
- Claude Code
- Codex
- OpenCode

and make CLI a universal fallback with tool parity for core flows.

The canonical self-install contract should be the raw Markdown install guide that any terminal-capable agent can follow. Host-native `init` flows are convenience paths where config contracts are stable, not the only way a host becomes first-class.

## Workstreams

### WS1: Host installation surface

- Add OpenClaw detection plus guide-driven self-install path
- Add Codex detection and `init` install path
- Refine Claude Code install path
- Refine OpenCode install path
- Expand host-matrix tests and fixtures

### WS2: CLI parity

- Add `web3agent tools list`
- Add `web3agent tools describe <name>`
- Add `web3agent tool call <name> --json`
- Add stable JSON envelopes and clear exit behavior
- Add schema inspection and representative operation-resume support

### WS3: Runtime hardening

- Reduce eager backend initialization
- Improve degraded capability health reporting
- Add install doctor / diagnostics flow
- Ensure unrelated degraded backends do not block useful boot paths

### WS4: Onboarding docs

- Host-specific install guides
- Universal CLI integration guide
- Canonical `docs/guides/universal-access.md` guide with `For Humans` and `For LLM Agents` sections
- First safe transaction walkthrough
- Troubleshooting for policy, wallets, chain config, and degraded services

## Acceptance criteria

1. Priority host install paths succeed through the canonical guide, with dry-run and smoke coverage for hosts whose config contracts are encoded in `init`
2. CLI can list, describe, and call representative read, write-prepare, and resume tools with stable JSON
3. At least one real safe write flow can be completed with equivalent lifecycle semantics across MCP, CLI, and SDK
4. New user reaches first safe write flow in under 30 minutes via host or CLI path
5. Unused degraded backends do not prevent runtime startup for unrelated workflows
6. Representative MCP, CLI, and SDK calls show no schema or lifecycle drift

## Exit artifacts

- Host adapters and guide-driven install flows merged
- CLI parity commands merged
- Doctor / diagnostics flow merged
- Universal access docs and walkthroughs merged
- `docs/guides/universal-access.md` published and usable via stable raw Markdown URL
- Surface parity report for the first real write flow merged

## Milestone M2 — Horizon 2A: Starter Experience GA

## Goal

Ship `npm create web3agent` as the fastest supported path for users who want a working Web3-capable agent immediately.

Templates:

- Vercel AI SDK
- Mastra
- MCP-host quickstart

## Workstreams

### WS1: Scaffolder core

- Create standalone scaffolder package / entrypoint
- Add template selection flow
- Add environment validation and post-install checks

### WS2: Template quality

- Vercel AI SDK template with runtime tool discovery
- Mastra template around root SDK APIs and operation lifecycle examples
- MCP-host template for local tool hosting plus config helper

### WS3: Lifecycle recipes

- Add quote -> simulate -> prepare -> confirm -> execute -> resume -> status example
- Add bridge + swap example
- Add external-wallet order / intent example

### WS4: DX and docs

- Quickstart docs per template
- Troubleshooting section
- First-write tutorial for each template

## Acceptance criteria

1. Each template includes one full lifecycle example
2. New developer reaches first successful write flow in under 30 minutes
3. CI smoke tests pass for generated projects
4. Included examples show no MCP, CLI, or SDK lifecycle drift

## Exit artifacts

- Scaffolder package merged
- Template smoke tests merged
- Lifecycle recipe docs merged

## Milestone M3 — Horizon 2B: Protocol Depth Pack v1

## Goal

Add **Compound + Morpho + Aave** with full lifecycle quality instead of shallow protocol breadth.

## Workstreams

### WS1: Adapter design contracts

- Define canonical adapter interface:
  - read state
  - prepare write
  - execute write
  - monitor / reconcile state
  - deterministic error taxonomy

### WS2: Protocol adapters

- Implement Compound adapter
- Implement Morpho adapter
- Implement Aave adapter

### WS3: Lifecycle completeness

- Add position and state readers
- Add simulation and allowance checks where relevant
- Add resumability and post-write verification hooks
- Add failure-recovery paths or explicit recovery semantics

### WS4: Reliability instrumentation

- Per-adapter operation funnel metrics
- Failure-category reporting
- Protocol acceptance checklist enforcement

## Acceptance criteria

1. Each target protocol supports read + write + monitor
2. Write flows pass simulation checks before execution where applicable
3. Completion success rate is above 95% under normal upstream conditions
4. Unrecoverable operation rate is below 2%

## Exit artifacts

- Three protocol adapters merged
- Conformance tests merged
- Reliability report for first protocol cohort

## Milestone M4 — Wallet Interoperability Lane

## Goal

Evaluate OWS as the preferred local wallet substrate while preserving self-custody-first defaults and lifecycle consistency, then layer optional `@coinbase/cdp-sdk` support on top of the same wallet capability contract.

## Workstreams

### WS1: Wallet capability contract

- Define capability matrix across:
  - private key / mnemonic
  - read-only
  - browser-wallet prepared operations
  - OWS-backed local wallet backend
  - CDP smart wallet

### WS2: OWS local wallet evaluation

- Evaluate whether OWS can replace or sit behind the current local wallet persistence layer
- Implement an OWS-backed local wallet path if the lifecycle and security model fit
- Verify policy evaluation and signing boundaries still hold with OWS as the local wallet substrate

### WS3: CDP provider module

- Implement optional provider package or module
- Wire it into operation lifecycle without semantic drift
- Map spend-permission features into policy model

### WS4: Safety alignment

- Define precedence between policy rules and wallet spend permissions
- Add edge-case tests for allow/deny conflicts

## Acceptance criteria

1. Existing flows continue to work unchanged without OWS or CDP
2. OWS-backed local wallet mode works as a drop-in option for supported flows, or the evaluation clearly documents why it should not replace the current local wallet path yet
3. CDP works as an optional provider for supported flows
4. No lifecycle divergence across wallet modes in representative MCP, CLI, and SDK flows

## Exit artifacts

- Wallet capability RFC finalized
- OWS evaluation and implementation decision merged
- Optional CDP provider merged
- Safety matrix tests merged

## Milestone M5 — Agent Economy Cohesion & Competitive Durability

## Goal

Turn identity, payment, escrow, and hiring from separate modules into a coherent product layer, while preserving portability and core execution quality.

## Workstreams

### WS1: Cohesive agent-economy flows

- Define canonical flows for:
  - identity bootstrap
  - pay for access or service
  - hire agent
  - escrow work or value
  - publish and discover capabilities

### WS2: Surface parity and version durability

- Add MCP, CLI, and SDK conformance coverage for representative lifecycle flows
- Add upgrade-safety and schema-version migration checks

### WS3: Ecosystem embedding

- Add first-party adapter packages or references for key ecosystems where justified
- Validate design-partner embedding patterns

## Acceptance criteria

1. At least one end-to-end agent-economy flow is documented, tested, and demoable
2. x402, ERC-8004, ACP, and aGDP share coherent lifecycle concepts where possible
3. Three or more independent apps or frameworks embed `web3agent` in pilot or production form

## Exit artifacts

- Agent-economy flow docs and demos merged
- Surface parity conformance tests merged
- Integration report from design partners

## Cross-milestone guardrails

1. No protocol adapter ships without full lifecycle coverage
2. No host-specific feature ships without a generic path
3. No template ships without end-to-end smoke tests
4. No release if MCP, CLI, and SDK schemas or lifecycle semantics diverge on representative flows
5. No scope creep into persona, memory, or full agent-runtime features in the core package

## KPI checkpoints by milestone

## M1 checkpoint

- Install success rate improved for priority hosts
- CLI parity available for representative core tools
- One real safe write flow works across MCP, CLI, and SDK
- Time-to-first-safe-write under 30 minutes
- A coding agent can complete a self-install flow by following the canonical install guide

## M2 checkpoint

- Three templates production-ready
- Template smoke success rate in CI: 100%
- Lifecycle examples validated end to end

## M3 checkpoint

- Compound, Morpho, and Aave adapters production-ready
- Operation success above 95%
- Unrecoverable rate below 2%

## M4 checkpoint

- OWS-backed local wallet path validated with at least one design partner or reference integration, or explicitly deferred with written rationale
- CDP provider adopted by at least two design partners if implemented in this milestone
- No regression in self-custody baseline flows

## M5 checkpoint

- At least one cohesive agent-economy flow in real pilot use
- Three or more external embeddings using `web3agent` as a core substrate

## Immediate next sprint

1. Define CLI command contract and JSON output envelope
2. Implement OpenClaw and Codex host detection / writer stubs
3. Create lazy-startup and capability-health hardening backlog
4. Create `create-web3agent` package skeleton and template inventory as parallel prep only, not the M1 critical path
5. Draft protocol adapter acceptance checklist
