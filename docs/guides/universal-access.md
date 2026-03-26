# Universal Access Guide

Use this guide when you want to install `web3agent` into an existing agent host, add it manually to a host that supports MCP, or point a coding agent at one Markdown file and let it handle setup.

This guide is the canonical self-install contract for terminal-capable agents. `web3agent init` is a convenience path for hosts with stable config contracts, not the only supported installation methodology.

## Canonical Raw URL

When this guide is published on the default branch, the canonical raw Markdown URL is:

```text
https://raw.githubusercontent.com/apegurus/web3agent/main/docs/guides/universal-access.md
```

If you are a human helping another coding agent install `web3agent`, you can paste:

```text
Install and configure web3agent by following this guide exactly:
https://raw.githubusercontent.com/apegurus/web3agent/main/docs/guides/universal-access.md
```

## Requirements

- Node.js 22 or newer
- `npx`
- a host that supports MCP directly, or any environment that can launch `npx web3agent` as a stdio process

## Current Support Status

### Canonical Self-Install Path

Any terminal-capable agent should be installable by following this guide directly.

Priority hosts for M1:

- Claude Code
- Cursor
- Windsurf
- OpenCode
- Codex
- OpenClaw

### Current `web3agent init` Fast Paths

- Claude Code
- Cursor
- Windsurf
- OpenCode
- Codex

### Generic MCP Fallback Today

Use the manual path in this guide if your host can run a stdio MCP server but does not yet have first-class `web3agent init` support.

Examples:

- custom agent harnesses
- local MCP-compatible wrappers

## For Humans

### Canonical agent-driven install prompt

If you want another coding agent to perform the install, paste:

```text
Install and configure web3agent by following this guide exactly:
https://raw.githubusercontent.com/apegurus/web3agent/main/docs/guides/universal-access.md
```

### Fast path for supported hosts

Run:

```bash
npx web3agent init
```

If more than one supported host is detected, run with an explicit host:

```bash
npx web3agent init --host claude
npx web3agent init --host cursor
npx web3agent init --host windsurf
npx web3agent init --host opencode
```

What this does:

- writes the host MCP config pointing to `npx web3agent`
- installs a small managed context block so the host knows Web3 tools are available

After installation:

1. Restart your host
2. Confirm the host sees the server
3. Verify the tools by invoking:
   - `server_status`
   - `list_supported_chains`

### OpenClaw path

OpenClaw should be installed by the OpenClaw agent itself through this guide, not by inventing an external `web3agent init` writer contract.

Recommended flow:

1. Open your OpenClaw agent
2. Paste the canonical install prompt shown above
3. Let the agent follow this guide and perform the setup in its own environment
4. Verify with `server_status` and `list_supported_chains`

### Manual MCP fallback

If your host supports stdio MCP servers but is not yet supported by `web3agent init`, configure a server that runs:

```bash
npx web3agent
```

The generic stdio server shape is:

```json
{
  "web3agent": {
    "type": "stdio",
    "command": "npx",
    "args": ["web3agent"]
  }
}
```

If your host uses a different MCP config schema, adapt that same command to the host's expected format.

After you add the config:

1. Restart the host
2. Confirm it lists `web3agent`
3. Verify with `server_status` and `list_supported_chains`

### Universal CLI fallback

When you want a host-independent install and verification path, use the CLI directly:

```bash
npx web3agent tools list --json
npx web3agent tools describe resolve_token --json
npx web3agent tool call server_status --input '{}' --json
npx web3agent doctor --json
```

### Canonical safe write walkthrough

The M1 parity flow is intentionally:

1. `lifi_execute_bridge`
2. `transaction_confirm`

Example lifecycle:

```bash
npx web3agent tool call lifi_execute_bridge --input '{"fromChainId":1,"toChainId":8453,"fromToken":"0x0000000000000000000000000000000000000000","toToken":"0x0000000000000000000000000000000000000000","fromAmount":"1000000000000000000"}' --json

npx web3agent tool call transaction_confirm --input '{"id":"<pending-operation-id>"}' --json
```

This is the same safe-write shape we expect across MCP, CLI, and SDK/runtime.

## For LLM Agents

If you are a coding agent helping a user install `web3agent`, follow this procedure.

### Step 0: Identify the host

Ask the user which host they want to enable:

- Claude Code
- Cursor
- Windsurf
- OpenCode
- Codex
- OpenClaw
- another MCP-capable host

Do not invent support that does not exist. Choose between:

- explicit `web3agent init --host ...` when the host contract is stable in this repo revision
- the guide-driven OpenClaw path for OpenClaw
- manual MCP fallback for other MCP-capable hosts

### Step 1: Verify local prerequisites

Run:

```bash
node --version
npx --version
```

If Node.js is below 22, stop and tell the user to upgrade Node first.

### Step 2: Prefer explicit host installation when supported

For supported hosts, run the explicit installer instead of relying on auto-detection:

```bash
npx web3agent init --host claude
npx web3agent init --host cursor
npx web3agent init --host windsurf
npx web3agent init --host opencode
npx web3agent init --host codex
```

Use `--dry-run` first if you want to preview changes:

```bash
npx web3agent init --host claude --dry-run
```

Then run again without `--dry-run` to apply changes.

### Step 3: Use the guide-driven OpenClaw path when the host is OpenClaw

If the user wants OpenClaw, do not guess a `web3agent init` contract.

Instead, tell the OpenClaw agent to follow this guide directly by sending:

```text
Install and configure web3agent by following this guide exactly:
https://raw.githubusercontent.com/apegurus/web3agent/main/docs/guides/universal-access.md
```

The OpenClaw agent should perform the setup in its own environment and then verify:

- `server_status`
- `list_supported_chains`
- `web3agent doctor --json` when the CLI is available

### Step 4: Use manual MCP fallback when the host is not first-class yet

If the host is not currently supported by `web3agent init`, configure an MCP server that launches:

```bash
npx web3agent
```

Use this logical server definition:

```json
{
  "web3agent": {
    "type": "stdio",
    "command": "npx",
    "args": ["web3agent"]
  }
}
```

Adapt it to the host's own config schema.

Do not guess undocumented file paths or config formats. If you cannot verify the host's MCP config format, ask the user for the config location or use that host's official docs.

### Step 5: Verify the install

After installation:

1. Restart the host if needed
2. Confirm the host sees the `web3agent` server
3. Verify these tools are available:
   - `server_status`
   - `list_supported_chains`

If the host can invoke tools, run `server_status` and confirm the response is structured and successful.

### Step 6: Explain the first safe action

Tell the user:

- read-only tools work without activating a wallet
- write actions are confirmation-gated by default
- browser-wallet flows are indirect: `web3agent` can prepare and resume, but a generic MCP host cannot click a wallet popup for the user

Recommend this first sequence:

1. `server_status`
2. `list_supported_chains`
3. `resolve_token`
4. `transaction_simulate` or a read-only quote flow

### Step 7: Escalate only when current support is truly missing

If the user asks for a host whose contract is not verified in the current repo revision, tell them clearly:

- the canonical guide is still the primary self-install artifact
- when a host-specific `init` path is unavailable, use the guide-driven or manual fallback path instead of inventing config writes

## Supported Host Config Paths Today

These are the current install targets in this repo revision.

| Host | Config path |
|------|-------------|
| Claude Code | `~/.claude/mcp.json` or project-local `.mcp.json` when present |
| Cursor | `.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| OpenCode | `.opencode/config.json` or `opencode.json` |
| Codex | `.codex/config.toml` or `~/.codex/config.toml` |
| OpenClaw | guide-driven agent install; environment usually includes `~/.openclaw/openclaw.json` and workspace `AGENTS.md` |

## Quick Verification Checklist

- `npx web3agent --version` prints a version
- the host config contains a `web3agent` MCP entry
- after restart, the host lists the `web3agent` server
- `server_status` succeeds
- `list_supported_chains` succeeds

## Troubleshooting

### `No supported agent host detected`

Use an explicit host:

```bash
npx web3agent init --host claude
```

Or use the manual MCP fallback if the host is not yet first-class.

### Multiple hosts detected

Use `--host` explicitly:

```bash
npx web3agent init --host opencode
```

### The host starts, but some backends are degraded

This can happen when optional upstream services are unavailable or not configured.

That does not necessarily block basic usage. Start with:

- `server_status`
- `list_supported_chains`

Then use read-only flows first.

### Write actions fail in read-only mode

`web3agent` requires an active wallet for write actions.

Read-only operations still work without wallet activation.

### Browser wallet popup does not appear

That is expected in generic MCP hosts. Browser-wallet flows in `web3agent` are preparation and resume flows, not direct popup control.

## What This Guide Covers

This guide is intentionally narrow:

- install into a supported host
- manually wire a generic stdio MCP server
- verify the setup
- give both humans and coding agents one deterministic path

For deeper usage after installation, start with:

- `README.md`
- `WEB3_CONTEXT.md`
