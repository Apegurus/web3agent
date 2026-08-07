# Web3Agent starter workspace

This is an internal workspace adapter used to verify the starter implementation
shipped by `web3agent`. It is not a user-facing package or supported entrypoint.

## Usage

```bash
npx web3agent create
```

The supported published entrypoint is `npx web3agent create`.

Templates currently bundled in this repo:

- Vercel AI SDK
- Mastra
- MCP-host

Each starter is built on the public `web3agent` package surfaces and keeps the same safe-write lifecycle discipline used across MCP, CLI, and SDK flows.
