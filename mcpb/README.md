# Web3Agent MCPB bundle

This directory builds the local stdio bundle used for Smithery MCPB distribution.

The bundle is intentionally thin: it validates as an MCPB package and launches the
published npm package with `npm exec --package web3agent@0.7.0`. npm remains the canonical
artifact for Web3Agent, while Smithery receives a downloadable local stdio bundle.

## Build

```bash
pnpm run mcpb:check
```

The generated bundle is written to `dist/web3agent.mcpb`.

The manifest keeps all configuration optional or defaulted so users can install
and inspect read-only tools before adding API keys, exchange configuration, or an
OWS passphrase. Prepared Orbs, LI.FI, and 0x operations on Windows require a
`WEB3AGENT_RESUME_STATE_SECRETS` ring configured through the bundle settings.

## Publish to Smithery

```bash
smithery auth login
smithery mcp publish dist/web3agent.mcpb -n Apegurus/web3agent
```

The bundle requires Node.js 22+ and network access the first time npm resolves
`web3agent@0.7.0`.

## Smoke test

```bash
node mcpb/server/web3agent.mjs --help
```
