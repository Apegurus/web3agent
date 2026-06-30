# Web3Agent MCPB bundle

This directory builds the local stdio bundle used for Smithery MCPB distribution.

The bundle is intentionally thin: it validates as an MCPB package and launches the
published npm package with `npm exec --package web3agent@0.6.2`. npm remains the canonical
artifact for Web3Agent, while Smithery receives a downloadable local stdio bundle.

## Build

```bash
pnpm run mcpb:check
```

The generated bundle is written to `dist/web3agent.mcpb`.

## Publish to Smithery

```bash
smithery auth login
smithery mcp publish dist/web3agent.mcpb -n Apegurus/web3agent
```

The bundle requires Node.js 22+ and network access the first time npm resolves
`web3agent@0.6.2`.

## Smoke test

```bash
node mcpb/server/web3agent.mjs --help
```
