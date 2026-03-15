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

- **ESM only** — all imports use `.js` extension (`import { foo } from "./bar.js"`)
- **stdout is reserved** for MCP protocol messages. All logging goes to `process.stderr.write()` with module prefix: `[module-name] message`. Never `console.log`.
- **Type safety** — `catch (e: unknown)` always. No `@ts-ignore` or `@ts-expect-error`. `as any` only with biome-ignore explaining the SDK constraint.
- **Import style** — prefer `import type { Foo }` for type-only imports. Group: Node builtins, external packages, internal modules.

## Tool Schemas

- **Zod as single source of truth** — for both input and output shapes. Define the Zod schema first, then derive the TypeScript type with `z.infer<typeof schema>`. Never maintain a separate `interface` that duplicates a Zod schema.
- **Input schemas** — every field must have `.describe()`. Generate `inputSchema` via `zodToJsonSchema()`. Never write manual JSON schemas.
- **Enforced by test** — `tests/tools/schema-quality.test.ts` fails if any Zod field is missing `.describe()`.
- **`chainId` convention** — make optional in the schema when the handler falls back to runtime config. Resolve via `resolveToolChainId(v.data.chainId)`.

## Error Handling

- **Tool errors** — use `formatToolError(code, message)` and `formatToolErrorFromUnknown(code, error)` from `src/utils/errors.ts`.
- **Read-only tools** — use `createToolHandler` from `src/tools/shared/handler-factory.ts` (wraps validation + try-catch + response formatting).
- **Write operations** — `executeWrite()` → confirmation queue → executor using `buildWriteContext()` from `src/tools/shared/write-context.ts`.
- **Tool handlers** return `CallToolResult` with structured `{ ok, data }` or `{ ok: false, error: { code, message } }` envelopes.

## Single Source of Truth

Never duplicate utility functions. Canonical locations:

| Utility | Location |
|---------|----------|
| `formatToolError`, `formatToolResponse`, `formatToolErrorFromUnknown` | `src/utils/errors.ts` |
| `resolveToolChainId`, `resolveToolChain`, `isChainResolved` | `src/tools/shared/chain-context.ts` |
| `buildWriteContext`, `isWriteContext` | `src/tools/shared/write-context.ts` |
| `createToolHandler` | `src/tools/shared/handler-factory.ts` |
| `validateInput`, `validateAddress` | `src/utils/validation.ts` |
| `executeWrite` | `src/utils/write.ts` |
| Chain registry | `src/chains/registry.ts` |
| Wallet state | `src/wallet/persistence.ts` |

## Testing

- Vitest with `tests/` mirroring `src/` structure
- Mock external dependencies (SDK calls, network, filesystem)
- Test both success and error paths
- All new modules must have corresponding test files
- Run `pnpm test` before every commit

## Biome

Key rules beyond `recommended`:
- `noEmptyBlockStatements: "warn"` — prevents silent error swallowing
- `noExplicitAny` — enforced, requires `biome-ignore` with justification
