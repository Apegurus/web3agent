# Web3Agent Product Spec & Roadmap

**Date:** 2026-03-23
**Status:** Draft for review
**Author:** Codex + Igna

**Decisions merged into this draft (2026-03-23):**

- Phase-1 focus: universal access for existing agents
- Priority phase-1 hosts: **OpenClaw, Claude Code, Codex, OpenCode**
- Universal access surfaces: **MCP + CLI + SDK/runtime**
- Canonical self-install artifact: **`docs/guides/universal-access.md` for terminal-capable agents; host-native `init` is a convenience path where contracts are stable**
- CLI phase-1 priority: **tool parity before workflow sugar**
- Initial starter/scaffolder templates: **Vercel AI SDK, Mastra, MCP-host**
- First protocol-depth targets after universal access: **Compound + Morpho + Aave**
- Wallet interoperability lane: **evaluate OWS as the preferred local wallet substrate first, optional CDP second**, never as the required default
- Tracking mode for delivery: **milestone-based**

## Executive Summary

`web3agent` should become the fastest way to make any agent Web3-native.

The product should win first as a **portable upgrade layer for existing agents**, not as another opinionated agent framework. The primary wedge is simple installation into existing hosts such as OpenClaw, Claude Code, Codex, and OpenCode. The same core should also support:

- a typed SDK/runtime for builders creating custom agent harnesses
- a first-party starter harness for users who want a working Web3 agent immediately

The long-term moat is not only transaction capability. It is the **full Web3-native agent lifecycle**:

`research -> decide -> simulate -> execute -> verify -> pay -> coordinate`

That lifecycle should include agent-economy primitives from the start of the narrative, even when some pieces mature over later phases:

- payments
- identity
- hiring
- escrow
- agent-to-agent coordination

## Product Thesis

### Positioning

`web3agent` is the portable Web3 capability layer for the full Web3-native agent lifecycle.

In one sentence:

> `web3agent` is the fastest way to make any agent Web3-native, and the portable capability layer that grows into agent payments, identity, hiring, and escrow.

### Why This Positioning Wins

Most competing products bundle Web3 capability with a specific harness, runtime, or ecosystem. `web3agent` should win by being:

- **portable where others are bundled**
- **safe where others are merely capable**
- **full-lifecycle where others stop at tools or swaps**
- **agent-economy aware without requiring users to adopt a new worldview on day one**

### Primary Wedge

The phase-1 wedge is:

> **Upgrade an existing agent with serious Web3 capability in minutes**

Primary host priorities:

1. OpenClaw
2. Claude Code
3. Codex
4. OpenCode

### Narrative Hierarchy

The product narrative should follow this order:

1. **Lead with** the universal Web3 upgrade-layer story
2. **Substantiate with** safe execution and browser-wallet support
3. **Differentiate with** the agent-economy story

### Core Package Boundary

At the product and brand level, `web3agent` is the portable Web3 capability layer for the full Web3-native agent lifecycle.

At the core package boundary, `web3agent` should remain the **execution and reliability substrate for DeFi-capable AI agents**.

That means the core package must stay strongest in:

- deterministic execution lifecycles
- typed schemas and structured returns
- safety controls
- normalized protocol adapters
- framework-neutral interfaces

This boundary matters so the broad narrative does not turn the core package into a vague agent operating system.

## What The Research Says

### Market Lesson 1: Most strong products are tied to their own harness

- **AgentKit** is modular and developer-friendly, but still centered on its own wallet-provider and action-provider abstractions.
- **ElizaOS** is powerful because of its runtime, plugin system, memory, and ecosystem, but Web3 capability there is generally experienced through Eliza-first integration patterns.
- **HIM---DeFI-Agent** is a good example of a compelling DeFi agent built inside that harness model.
- **Ottie** and **automaton** are ambitious end-to-end systems, not neutral capability layers.

Implication:

`web3agent` should not try to out-framework the framework products. It should be the capability layer that upgrades them, complements them, or replaces only the Web3 slice.

### Market Lesson 2: Intent UX and execution separation matter

**Brian** is especially instructive. It treats natural-language understanding and transaction execution as separate concerns, and its flows can hand transactions to different execution environments instead of forcing one wallet model.

Implication:

`web3agent` should double down on the current separation between:

- research and intent formation
- simulation and planning
- transaction preparation
- actual execution via server wallet, browser wallet, or external host

### Market Lesson 3: Packaging matters as much as capability

**Pearl / Optimus / BabyDegen** show that the market rewards agent products that feel ownable, packaged, and app-like. Users care about:

- getting started fast
- understanding what the agent can do
- trusting how it acts
- feeling that the agent has identity and economic agency

Implication:

`web3agent` needs to feel installable and coherent, not just technically deep.

### Market Lesson 4: Agent economy is a moat, not the first wedge

**automaton** proves that sovereign identity, payment, self-funding, and survival create a powerful story. But it is a runtime worldview, not a lightweight upgrade layer.

Implication:

`web3agent` should keep agent economy as a core part of the long-term narrative and architecture, while distributing first through easier installability.

### Market Lesson 5: Wallet standardization is becoming its own platform layer

**Open Wallet Standard (OWS)** is highly aligned with the direction `web3agent` already wants:

- local-first wallet storage
- policy-gated signing
- multi-chain by default
- access through CLI, MCP, SDK, and REST
- explicit separation between access layer, policy engine, signer, and wallet vault

Implication:

`web3agent` should avoid becoming another isolated wallet silo. Its long-term wallet lane should emphasize using an emerging local-first wallet standard as the underlying local wallet substrate, instead of only adding more proprietary wallet modes.

## Competitive Synthesis

### Coinbase AgentKit

Strengths:

- strong modular developer story
- clean provider/action extension model
- credible wallet and transaction primitives

Weakness:

- still feels like a builder toolkit, not the universal upgrade layer for any existing agent

Lesson for `web3agent`:

- preserve modularity
- win on portability and installability

Sources:

- https://docs.cdp.coinbase.com/agent-kit/welcome
- https://docs.cdp.coinbase.com/agent-kit/core-concepts/architecture-explained

### ElizaOS

Strengths:

- runtime, memory, plugin ecosystem, broader autonomy story
- strong framework identity

Weakness:

- best experience generally assumes ElizaOS adoption

Lesson for `web3agent`:

- be the Web3 layer ElizaOS users can adopt without re-platforming their entire stack

Sources:

- https://docs.elizaos.ai/plugins/architecture
- https://docs.elizaos.ai/runtime/core

### Brian

Strengths:

- natural-language Web3 intent UX
- clear separation between intent formation and execution paths

Weakness:

- less of a universal runtime substrate for arbitrary agent stacks

Lesson for `web3agent`:

- improve lifecycle UX around intent, simulation, and execution handoff

Sources:

- https://docs.brianknows.org/
- https://docs.brianknows.org/brian-api/apis/transaction

### Pearl / Optimus / BabyDegen

Strengths:

- strong packaging
- ownable agent framing
- agent-app-store style distribution

Weakness:

- more productized agent destinations than portable developer substrate

Lesson for `web3agent`:

- invest in productized onboarding and clear user-facing entrypoints

Sources:

- https://olas.network/blog/pearl-the-agent-app-store-adds-a-new-agent-meet-optimus
- https://olas.network/agents/babydegen

### automaton

Strengths:

- sovereign runtime
- identity, payments, self-modification, survival pressure
- highly differentiated agent-economy and autonomy story

Weakness:

- bundled worldview and runtime

Lesson for `web3agent`:

- build toward economic agency, but do so as a portable layer rather than a monolithic runtime

Sources:

- https://github.com/Conway-Research/automaton
- https://raw.githubusercontent.com/Conway-Research/automaton/main/ARCHITECTURE.md

### Ottie

Strengths:

- public framing emphasizes purpose-built crypto-native agent behavior, self-evolving skills, and specialized workflows

Weakness:

- public materials are much more product/runtime-centric than portable integration-centric

Lesson for `web3agent`:

- crypto users want specialized capability and strong defaults, not only generic frameworks

Sources:

- https://github.com/jiayaoqijia/ottie
- https://www.reddit.com/r/u_jiayaoqijia/comments/1rvfrqe/after_eth2030_i_built_ottie_selfevolving_agent/

### HIM---DeFI-Agent

Strengths:

- concrete DeFi agent product built for a specific harness and audience

Weakness:

- reinforces the pattern that Web3 agents are often tied to their parent framework

Lesson for `web3agent`:

- stay portable, even while offering strong first-party examples

Source:

- https://github.com/miami0x/HIM---DeFI-Agent

## Current Web3Agent Assessment

### What Already Exists And Is Strong

The repository already contains a meaningful capability core.

Evidence:

- The package clearly presents a dual audience of MCP users and SDK consumers in `README.md` and `CLAUDE.md`.
- The runtime is already centralized through `src/runtime/managed-runtime.ts`.
- Tool registration is broad and typed, spanning wallets, transactions, operations, explorer, DeFi, market, research, and agent-economy domains.
- The browser-wallet architecture is already explicit and reusable in `docs/architecture/browser-wallet-operations.md`.
- Safety is not an afterthought. Confirmation queues, policy rules, input sanitization, and simulation are part of the core behavior.

Key strengths:

- reusable managed runtime
- typed tool catalog
- MCP + SDK split
- browser-wallet prepared operations
- transaction simulation and confirmation
- treasury policy enforcement
- on-chain identity, hiring, escrow, and x402 payment primitives

Relevant files:

- `README.md`
- `CLAUDE.md`
- `src/runtime/managed-runtime.ts`
- `src/runtime/server.ts`
- `src/policy/engine.ts`
- `src/tools/x402/index.ts`
- `src/tools/agdp/index.ts`
- `docs/architecture/browser-wallet-operations.md`

### What Is Missing From The Product

The biggest gap is not raw Web3 capability. It is **integration surface and productization**.

Current limitations:

- host support is still explicitly enumerated instead of generally extensible
- no first-class OpenClaw or Codex support yet
- current CLI is mostly bootstrap-oriented rather than full tool invocation parity
- the starter harness exists only as an example
- no optional smart-wallet / account-abstraction lane yet
- current wallet model is still centered on `private-key`, `mnemonic`, and `read-only` modes instead of a standard external wallet access contract
- protocol depth is uneven across categories
- the agent-economy pieces exist, but do not yet feel like one cohesive user journey

Relevant files:

- `src/hosts/detect.ts`
- `src/hosts/writers/base.ts`
- `src/hosts/writers/claude.ts`
- `src/hosts/writers/opencode.ts`
- `src/hosts/writers/cursor.ts`
- `src/hosts/writers/windsurf.ts`
- `src/cli.ts`
- `src/cli/init.ts`
- `examples/agent-playground/src/index.ts`

### Product Risk In Current Architecture

Runtime bootstrap still behaves more like a builder library than a universally installable product in some places. For example, certain backend setup paths are eager enough that degraded network conditions can hurt first impressions.

This is acceptable for builders, but weak for a product claiming easy universal onboarding.

## Product Definition

### Core Promise

`web3agent` gives any agent the capabilities required to participate meaningfully in Web3:

- understand the market
- inspect chains and assets
- prepare and execute safe transactions
- use either server-side or browser-side wallets
- pay and get paid
- prove identity
- discover, hire, and coordinate with other agents

### Three Entry Modes

The product should be one capability core with three entry modes.

#### 1. Existing-Agent Upgrade Path

Primary phase-1 entry mode.

Examples:

- install into OpenClaw
- install into Claude Code
- install into Codex
- install into OpenCode

Promise:

> keep your current agent, add Web3 in minutes

#### 2. Builder Runtime / SDK

For teams building custom harnesses or applications.

Promise:

> build your own Web3-native agent without reinventing wallet safety, DeFi execution, or economic coordination

#### 3. Starter Harness

For users who want an end-to-end working system immediately.

Promise:

> start with a usable Web3 agent today, customize later

### Product Rule

No host-specific capability should exist without a generic path.

That means every important feature should be reachable through at least one universal access surface.

## Product Boundaries

### In Scope For The Core Package

- DeFi execution primitives: swaps, bridge, orders, operations, approvals
- policy and safety primitives: limits, confirmations, spend controls, constraints
- structured operation lifecycle and state recovery
- protocol adapters with normalized schemas
- framework-agnostic access surfaces: MCP, CLI, SDK/runtime
- market, research, and explorer surfaces that directly support execution decisions
- agent-economy primitives tied to identity, payments, hiring, escrow, and coordination

### Out Of Scope For The Core Package

- full agent orchestration runtime: persona, memory, social loops, long-horizon autonomy
- end-user chat shell as the center of gravity for the product
- opaque NLP-to-transaction black-box behavior
- built-in strategy alpha generation as a core package responsibility

## Non-Negotiable Principles

1. **Structured returns always**: no opaque string-only execution APIs.
2. **One lifecycle everywhere**: the same operation semantics should hold across MCP, CLI, and SDK.
3. **Safety before automation**: simulation and policy checks should precede value movement.
4. **Adapter isolation**: provider-specific fields stay at the boundaries.
5. **Deterministic failure semantics**: stable error envelopes, retry behavior, and recovery states.
6. **Framework neutrality**: the product must work across agent frameworks and plain TypeScript integrations.
7. **No host-specific capability without a generic path**: host adapters are packaging, not the only interface.
8. **Do not become another wallet silo**: prefer a wallet capability contract that can sit on top of a standard local wallet substrate over proliferating bespoke key-storage modes.

## Personas

### Agent Upgrader

This is the primary phase-1 persona.

Profile:

- already has an agent or workflow
- does not want to adopt a new framework
- wants Web3 capability quickly

Core job:

> add production-grade Web3 capability to my existing agent without rebuilding my stack

### Agent Builder

Profile:

- building a new agent, app, or orchestration layer
- wants typed primitives, safety, and portability

Core job:

> ship a Web3-native agent product faster and safer than building the substrate from scratch

### Operator / Power User

Profile:

- wants a working Web3 agent quickly
- may care less about framework details

Core job:

> get a useful Web3 agent running immediately, then adapt it over time

## Jobs To Be Done

- upgrade my existing agent with Web3 in minutes
- let my agent research before it acts
- let my agent transact safely
- support server-wallet and browser-wallet execution models
- let my agent prove identity and coordinate economically
- start simple and grow into production

## Non-Goals

- becoming a monolithic general-purpose agent framework
- requiring users to adopt a new orchestration model just to access Web3
- making the starter harness the product center of gravity
- optimizing first for maximal autonomy over installability and trust
- chasing broad agent framework parity with ElizaOS or Olas
- coupling core architecture to one provider, wallet, or framework
- letting the core package become a read-only data utility with no execution moat
- adding protocols without full lifecycle quality

## Product Pillars

### 1. Install Anywhere

`web3agent` must feel native inside existing agents, not like an awkward sidecar.

Requirements:

- host-specific install flows for priority environments
- generic installation path independent of host-specific adapters
- canonical guide-driven self-install path that an agent can follow without repo archaeology
- compatibility checks and install doctor
- clear degraded-mode behavior
- a canonical installation guide that both humans and coding agents can follow without repo archaeology

### 2. Safe Execution By Default

Safety must be a visible product feature.

Requirements:

- simulation before execution
- confirmation queue by default for writes
- treasury and payment policy controls
- auditability and explicit operation states
- browser-wallet compatible paths for external signing

### 3. Full Web3-Native Agent Lifecycle

The product should cover:

- research
- planning
- simulation
- execution
- verification
- payments
- identity
- hiring / escrow / coordination

### 4. One Core, Three Entry Modes

The same underlying capability core should power:

- MCP
- CLI
- SDK/runtime
- starter harness

These are not separate products. They are different access paths into one product.

### 5. Typed, Portable, Composable DX

Developers should be able to move between:

- MCP for drop-in tool access
- CLI for universal shell-based integration
- SDK/runtime for embedding and custom orchestration

without changing the mental model of the product.

## Capability Priorities

1. **Universal access first**
   Priority hosts, CLI parity, diagnostics, degraded startup behavior.
2. **Starter/scaffolder second**
   `npm create web3agent` and three first-party templates: Vercel AI SDK, Mastra, MCP-host.
3. **Protocol depth third**
   First targets: Compound, Morpho, Aave.
4. **Wallet interoperability lane fourth**
   Evaluate OWS as the preferred local wallet substrate first; optional CDP support second; both must preserve existing lifecycle semantics.
5. **Demand-driven chain expansion later**
   Solana only after the universal access layer, protocol depth, and wallet capability model are solid.

## Protocol Depth Gate

No protocol adapter should ship unless it meets the full lifecycle bar.

Minimum acceptance checklist:

- read state
- prepare write
- execute write
- monitor or reconcile post-write state
- deterministic error taxonomy
- simulation and allowance checks where relevant
- resumability or explicit recovery strategy for partial failure

## Architecture Direction

### Capability Core

System of record for:

- wallets
- transactions
- DeFi protocols
- explorer and research data
- simulation
- policy
- agent-economy primitives

This is the current runtime, schemas, and tool system.

### Universal Access Layer

This replaces the narrower concept of a host-integration layer.

It should expose the same capabilities through:

- **MCP** for native tool-aware agent frameworks
- **CLI** for shell-capable environments and universal fallback
- **SDK/runtime** for direct embedding

Host-specific integrations should be built on top of this layer, not instead of it.

### Execution Layer

This is where safe operation happens:

- simulation
- write confirmation
- spend policy
- browser-wallet prepared operations
- audit trails

### Agent Economy Layer

This should become a first-class product concept, not just several tool groups.

Core concepts:

- identity
- discoverability
- payment
- escrow
- hiring
- reputation
- coordination

### Starter Harness Layer

A supported first-party harness built on the same core surfaces.

Purpose:

- fast onboarding
- demos
- reference implementation
- proving that the core surfaces are sufficient for real product experiences

## Universal Access Layer Requirements

### MCP

Continue supporting generic tool discovery and invocation through MCP.

Goal:

- work well with hosts that already understand MCP
- remain the default upgrade path where MCP support exists

### CLI

CLI should become the universal fallback path and a phase-1 priority developed in parallel with host install flows.

Phase-1 CLI principle:

> tool parity before workflow sugar

Required CLI capabilities:

- `web3agent tools list`
- `web3agent tools describe <name>`
- `web3agent tool call <name> --json`
- stable JSON output
- schema inspection
- clear error codes
- resumable operation support
- parity with MCP tool reach where practical
- at least one full safe write flow with equivalent semantics across MCP, CLI, and SDK

Rationale:

- any environment that can shell out can integrate
- CLI becomes the generic last-mile interface
- host-specific work becomes packaging, not the only path

### Canonical Install Guide

M1 should require a canonical install guide at:

- `docs/guides/universal-access.md`

This guide should be intentionally usable in two modes:

- **For humans**: readable install paths, host-specific quickstarts, CLI fallback, and troubleshooting
- **For LLM agents**: deterministic step-by-step instructions that can be fetched as raw Markdown and followed directly

Minimum requirements:

- stable raw GitHub URL that can be pasted into an agent session
- explicit `For LLM Agents` section
- the guide is the primary self-install contract for terminal-capable agents
- host-native `init` fast paths are called out explicitly when their contracts are verified
- OpenClaw support is allowed to be guide-driven rather than `init`-driven
- `doctor` and troubleshooting instructions
- no marketing fluff or hidden required context
- written so an agent can install `web3agent` without reading unrelated docs first

### SDK / Runtime

Keep and improve the current builder surface.

Requirements:

- typed runtime
- stable public exports
- clearer documentation by domain
- stronger examples for custom harness builders

## Phase Roadmap

### Horizon 1: Universal Access

**Goal:** make `web3agent` the easiest way to add Web3 to an existing agent.

#### Product outcomes

- first-class install story for OpenClaw, Claude Code, Codex, and OpenCode
- universal fallback through CLI parity
- better startup behavior under degraded network conditions
- installation confidence through diagnostics

#### Deliverables

- add OpenClaw guide-driven support
- add Codex support
- refine Claude Code and OpenCode install paths
- expand host detection / install abstractions
- introduce install doctor and capability checks
- evolve CLI from bootstrap utility to universal tool-invocation surface
- support schema introspection and stable JSON output in CLI
- make runtime startup more lazy and degradation-friendly
- add conformance checks for representative MCP, CLI, and SDK flows
- ship `docs/guides/universal-access.md` as the canonical install guide for both humans and LLM agents

#### Repo implications

- expand `src/hosts/detect.ts`
- add new writers / install adapters under `src/hosts/` where contracts are stable
- extend `src/cli.ts` and `src/cli/`
- expose tool catalog and schemas for CLI-friendly consumption
- audit eager backend initialization paths

### Horizon 2: Starter Experience & Protocol Depth

**Goal:** make first successful Web3-agent integration fast, and core DeFi flows deep enough to matter.

#### Product outcomes

- `npm create web3agent` becomes a real supported onramp
- the first successful write flow is understandable and repeatable
- protocol support gets deeper where it matters, not merely broader

#### Deliverables

- ship starter/scaffolder with three templates:
  - Vercel AI SDK
  - Mastra
  - MCP-host
- add opinionated lifecycle recipes:
  - quote -> simulate -> prepare -> confirm -> execute -> resume -> status
  - bridge and swap flow
  - external-wallet order or intent flow
- add first protocol-depth targets with full lifecycle support:
  - Compound
  - Morpho
  - Aave
- add operation funnel metrics and adapter error taxonomy
- strengthen documentation and troubleshooting for safe write flows

#### Example lifecycle

`research token -> assess security -> simulate swap -> approve -> execute -> verify result`

### Horizon 3: Wallet Interoperability & Builder Surface Maturity

**Goal:** expand wallet capabilities and mature the builder surface without breaking self-custody-first defaults or creating another wallet silo.

#### Product outcomes

- OWS-backed local wallet support with no lifecycle divergence
- optional smart-wallet support where it adds real value
- stronger SDK/runtime DX
- clearer builder contracts and reference architectures

#### Deliverables

- define a wallet capability contract across:
  - private key / mnemonic
  - read-only
  - browser-wallet prepared operations
  - OWS-backed local wallet backend
  - optional CDP smart wallet
- evaluate replacing or abstracting the current local wallet persistence with an OWS-backed local wallet backend
- add optional CDP provider module
- define policy and spend-permission interaction model
- document recommended integration patterns
- improve runtime ergonomics and surface clarity
- publish reference architectures for common agent categories

### Horizon 4: Agent Economy Cohesion & Competitive Durability

**Goal:** make the agent-economy layer cohesive and turn portability plus execution reliability into durable differentiation.

#### Product outcomes

- agent-economy features feel cohesive
- identity, payment, and coordination are no longer fringe features
- framework and host embeddings grow without fragmenting the core package

#### Deliverables

- unify the story around x402, ERC-8004, ACP, and aGDP
- define cohesive identity / payment / escrow / hiring flows
- improve capability publishing and discoverability
- make coordination between agents productized instead of merely exposed
- add conformance tests for MCP, CLI, and SDK parity
- add upgrade-safety and version-migration contracts where needed

## Success Metrics

### Entry Mode: Existing-Agent Upgrade

- installs into existing hosts per month
- install success rate by host
- percent of users reaching first successful tool call after install
- percent of users reaching first safe write after install
- 30-day repeat usage by integration teams

### Entry Mode: Builder Runtime / SDK

- number of external integrations using core runtime or operations APIs
- time to first tool call in a custom integration
- time to first safe transaction in a custom integration
- docs coverage for top builder workflows

### Entry Mode: Starter Harness

- number of starter templates installed and run successfully
- starter scaffolder completion rate
- time to first successful write through a starter template
- percent of starter users who later adopt MCP, CLI, or SDK directly

### Capability

- first successful read action
- first successful simulated write
- first successful confirmed write
- first successful browser-wallet flow
- first successful agent-economy action
- share of usage coming from top core execution workflows

### DX

- surface parity across MCP, CLI, and SDK
- install doctor success rate
- troubleshooting resolution rate for top onboarding failures
- successful self-install completion rate when users point a coding agent at the canonical install guide

### Reliability

- runtime startup success under degraded network conditions
- tool invocation success by backend
- resumable operation success rate
- policy clarity and false-positive rate
- unrecoverable operation rate

## Key Risks

### Risk 1: Too Many Stories At Once

If users hear "framework, MCP server, SDK, wallet layer, market intelligence, agent economy, starter app" all at once, positioning will blur.

Mitigation:

Always lead with:

> the fastest way to make any agent Web3-native

### Risk 2: Product Promise Outruns Installability

The narrative promises portability. The integration surface must actually deliver it.

Mitigation:

- prioritize CLI parity and install flows before major new tool breadth
- treat host-specific integrations as packaging on top of a universal access layer

### Risk 3: Breadth Without Coherence

Many tools can still feel like no product.

Mitigation:

- prioritize lifecycle flows
- document recommended agent behaviors, not only tool APIs

### Risk 4: Surface Drift Across MCP, CLI, And SDK

If access surfaces diverge, the portability thesis breaks.

Mitigation:

- conformance tests and release gates requiring parity on representative flows
- shared schema and lifecycle contracts
- require parity for at least one real safe write flow, not only read and prepare steps

### Risk 5: Provider Lock-In Pressure

Wallet and provider expansion can distort the architecture if one provider becomes the implicit default.

Mitigation:

- wallet capability abstraction
- optional provider modules
- preserve self-custody-first defaults

### Risk 6: Wallet Fragmentation And Key Sprawl

If `web3agent` keeps growing its own wallet storage assumptions while the ecosystem standardizes elsewhere, it will accumulate migration and trust costs.

Mitigation:

- favor a standard local wallet substrate over bespoke wallet expansion
- evaluate OWS compatibility before adding more native wallet modes
- keep core execution semantics independent from any one wallet backend

### Risk 7: Agent Economy Feels Bolted On

The current primitives are strong but can still feel like separate domains.

Mitigation:

- make them part of lifecycle and narrative from the beginning
- unify them in product docs and demos

### Risk 7: Degraded Startup Hurts Trust

Early setup friction undermines the install-anywhere thesis.

Mitigation:

- lazy initialization
- explicit capability health
- graceful degradation
- diagnostics and doctor commands

## Product Decisions Confirmed In This Draft

- Primary strategy: **universal Web3 upgrade layer**
- Narrative scope: **full Web3-native agent lifecycle**
- Agent economy: **core narrative, long-term moat**
- Priority phase-1 hosts: **OpenClaw, Claude Code, Codex, OpenCode**
- Universal access model: **MCP + CLI + SDK/runtime**
- CLI phase-1 priority: **tool parity first**
- Initial starter/scaffolder templates: **Vercel AI SDK, Mastra, MCP-host**
- First protocol-depth targets: **Compound, Morpho, Aave**
- Wallet interoperability lane: **evaluate OWS as preferred local wallet substrate first, optional CDP provider second**
- Primary phase-1 wow moment: **safe transaction capability**
- Research and agent-economy features remain on the roadmap from day one
- Delivery tracking: **milestone-based**

## Recommended Next Planning Step

Translate this spec into an execution plan with these concrete streams:

1. Universal access and installability
2. Starter/scaffolder and protocol-depth acceptance gates
3. Wallet capability contract, OWS-backed local wallet evaluation, and optional CDP lane
4. Agent-economy cohesion

## Appendix: Source List

External references used in this strategy:

- https://github.com/jiayaoqijia/ottie
- https://github.com/Conway-Research/automaton
- https://raw.githubusercontent.com/Conway-Research/automaton/main/ARCHITECTURE.md
- https://olas.network/blog/pearl-the-agent-app-store-adds-a-new-agent-meet-optimus
- https://docs.brianknows.org/
- https://olas.network/agents/babydegen
- https://docs.elizaos.ai/
- https://github.com/miami0x/HIM---DeFI-Agent
- https://docs.cdp.coinbase.com/agent-kit/welcome
- https://openwallet.sh/
- https://github.com/open-wallet-standard/core

Internal references used in this strategy:

- `README.md`
- `CLAUDE.md`
- `src/runtime/managed-runtime.ts`
- `src/runtime/server.ts`
- `src/hosts/detect.ts`
- `src/hosts/writers/base.ts`
- `src/cli.ts`
- `src/cli/init.ts`
- `src/policy/engine.ts`
- `src/tools/x402/index.ts`
- `src/tools/agdp/index.ts`
- `docs/architecture/browser-wallet-operations.md`
- `examples/agent-playground/src/index.ts`
