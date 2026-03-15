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

## Key Conventions

- **ESM only** — all imports use `.js` extension
- **stdout is reserved** for MCP protocol. All logging → `process.stderr.write()` with `[module-name]` prefix. Never `console.log`.
- **Type safety** — `catch (e: unknown)` always. No `@ts-ignore` or `@ts-expect-error`. `as any` only with biome-ignore.
- **Tool schemas** — Zod as source of truth with `.describe()` on every field. Generate `inputSchema` via `zodToJsonSchema()`. Never manual JSON schemas. Enforced by `tests/tools/schema-quality.test.ts`.
- **Chain ID** — use `resolveToolChainId(chainId)` from `src/tools/shared/chain-context.ts`. Make `chainId` optional in schemas when the handler falls back to runtime config.
- **Error formatting** — `formatToolError()`, `formatToolErrorFromUnknown()` from `src/utils/errors.ts`. For simple read-only tools, use `createToolHandler` from `src/tools/shared/handler-factory.ts`.
- **Write operations** — `executeWrite()` → confirmation queue → executor using `buildWriteContext()` from `src/tools/shared/write-context.ts`.

## Architecture

```
src/
├── cli.ts              # CLI entry (init, --help, --version, start server)
├── index.ts            # Public API re-exports
├── mcp/index.ts        # MCP server setup + tool registration
├── runtime/            # Runtime lifecycle (create, shutdown, tool invocation)
├── api/                # Business logic (swaps, tokens, operations, simulation)
│   ├── operations/     # Prepared-operation flow (LI.FI, Orbs)
│   └── schemas/        # Zod schemas for API inputs
├── tools/              # MCP tool definitions + handlers
│   ├── shared/         # handler-factory, chain-context, write-context
│   ├── wallet/ tokens/ orbs/ lifi/ acp/ acp-virtuals/ erc8004/ agdp/ x402/
├── goat/               # GOAT SDK integration
├── chains/             # Chain registry and support tiers
├── tokens/             # Token registry, resolver, CoinGecko
├── config/             # Environment config, wallet factory, health checks
├── wallet/             # Wallet persistence, confirmation queue, audit log
├── upstream/           # Remote MCP adapters (Blockscout, Etherscan)
└── utils/              # Shared utilities (errors, validation, write helpers)
```

## Testing

- Vitest with `tests/` mirroring `src/` structure. Mock external deps. Test success + error paths.
- All new modules must have corresponding test files.
