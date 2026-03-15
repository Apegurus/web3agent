# CLAUDE.md — web3agent

Web3 MCP proxy server that gives AI agents (Claude Code, Cursor, Windsurf, OpenCode) blockchain capabilities through a single install.

## Quick Commands

```bash
pnpm run lint          # Biome check
pnpm run lint:fix      # Biome auto-fix
pnpm run typecheck     # tsc --noEmit
pnpm run build         # tsup (ESM + DTS)
pnpm test              # vitest run (520+ tests)
pnpm test -- --run tests/path/file.test.ts  # single test file
```

All four must pass before committing: `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`

## Architecture

```
src/
├── cli.ts              # CLI entry point (init, --help, --version, start server)
├── index.ts            # Public API re-exports (root package surface)
├── mcp/index.ts        # MCP server setup + tool registration
├── runtime/            # Runtime lifecycle (create, shutdown, tool invocation)
│   ├── managed-runtime.ts  # Full runtime with GOAT provider + upstream MCPs
│   ├── default.ts          # Lazy singleton runtime for root API consumers
│   └── startup.ts          # Server startup (connects transports)
├── api/                # Business logic (swaps, tokens, operations, simulation)
│   ├── operations/     # Prepared-operation flow (LI.FI, Orbs)
│   ├── schemas/        # Zod schemas for API inputs
│   └── simulation.ts   # Transaction simulation with trace decoding
├── tools/              # MCP tool definitions + handlers
│   ├── shared/         # Shared utilities (handler-factory, chain-context)
│   ├── wallet/         # Wallet management tools
│   ├── tokens/         # Token resolution tools
│   ├── orbs/           # Orbs swap/TWAP/limit tools
│   ├── lifi/           # LI.FI bridge/swap tools
│   ├── acp/            # ERC-8183 agent commerce tools
│   ├── acp-virtuals/   # Virtuals ACPRouter tools
│   ├── erc8004/        # Agent identity/reputation tools
│   ├── agdp/           # Agent data protocol tools
│   └── x402/           # HTTP 402 payment tools
├── goat/               # GOAT SDK integration (plugins, dispatch, provider)
├── chains/             # Chain registry and support tiers
├── tokens/             # Token registry, resolver, CoinGecko integration
├── config/             # Environment config, wallet factory, health checks
├── wallet/             # Wallet persistence, confirmation queue, audit log
├── upstream/           # Remote MCP adapters (Blockscout, Etherscan)
├── orbs/               # Orbs SDK wrappers (Liquidity Hub, TWAP)
├── lifi/               # LI.FI SDK configuration
├── hosts/              # AI host detection + config writers
├── utils/              # Shared utilities (errors, validation, write helpers)
└── types/              # Shared type definitions
```

## Key Conventions

- **ESM only** — all imports use `.js` extension (`import { foo } from "./bar.js"`)
- **stdout is reserved** for MCP protocol messages. All logging goes to `process.stderr.write()` with module prefix: `[module-name] message`
- **Never use `console.log`**
- **Error handling** — use `formatToolError(code, message)` and `formatToolErrorFromUnknown(code, error)` from `src/utils/errors.ts`. For simple read-only tools, use `createToolHandler` from `src/tools/shared/handler-factory.ts`
- **Type safety** — `catch (e: unknown)` always. No `@ts-ignore` or `@ts-expect-error`. `as any` only with biome-ignore explaining the SDK constraint
- **Tool handlers** return `CallToolResult` with structured `{ ok, data }` or `{ ok: false, error: { code, message } }` envelopes
- **Write operations** go through `executeWrite()` → confirmation queue → executor pattern
- **Chain ID resolution** — use `resolveToolChainId(chainId)` and `resolveToolChain(chainId)` from `src/tools/shared/chain-context.ts`

## Testing

- Vitest with `tests/` mirroring `src/` structure
- Mock external dependencies (SDK calls, network, filesystem)
- Test both success and error paths
- Run `pnpm test` before every commit

## Detailed Coding Standards

See [AGENTS.md](./AGENTS.md) for comprehensive coding standards covering error handling, async patterns, import conventions, and Biome configuration.
