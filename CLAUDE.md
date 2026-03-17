# CLAUDE.md — web3agent

Web3 MCP proxy server that gives AI agents (Claude Code, Cursor, Windsurf, OpenCode) blockchain capabilities through a single install.

## Quick Commands

```bash
pnpm run lint          # Biome check
pnpm run lint:fix      # Biome auto-fix
pnpm run typecheck     # tsc --noEmit
pnpm run build         # tsup (ESM + DTS)
pnpm test              # vitest run (580+ tests)
pnpm test -- --run tests/path/file.test.ts  # single test file
```

All four must pass before committing: `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`

## Key Conventions

- **ESM only** — all imports use `.js` extension (`import { foo } from "./bar.js"`)
- **stdout is reserved** for MCP protocol messages. All logging goes to `process.stderr.write()` with module prefix: `[module-name] message`. Never `console.log`.
- **Type safety** — `catch (e: unknown)` always. No `@ts-ignore` or `@ts-expect-error`. `as any` only with biome-ignore explaining the SDK constraint.
- **Import style** — prefer `import type { Foo }` for type-only imports. Group: Node builtins, external packages, internal modules.

## Two-Layer Architecture

This package serves **two audiences** and every feature must work for both:

1. **MCP tool layer** (`src/tools/`) — AI agents (Claude Code, Cursor, etc.) discover and call tools via the MCP protocol. Tools are registered in `src/tools/<group>/index.ts`.
2. **Programmatic SDK layer** (`src/api/`, `src/index.ts`) — downstream projects (e.g. Orbzy) `import { ... } from "web3agent"` and call functions directly. SDK functions invoke tools via `getRuntime()` + `invokeAndRequireData(runtime, toolName, params)` from `src/api/shared.ts`.

**SDK entry points by domain:**

| Domain | File | Pattern | Example |
|--------|------|---------|---------|
| Swaps & bridge | `src/api/swaps.ts` | Runtime → tool invocation | `getSwapQuote()`, `executeSameChainSwap()` |
| Intents (external signing) | `src/api/intents.ts` | Wraps `operations.ts` | `prepareSwapIntent()`, `prepareOrderIntent()` |
| Orders | `src/api/orders.ts` | Runtime → tool invocation | `listOrders()`, `placeOrder()`, `cancelOrder()` |
| Operations (staged) | `src/api/operations.ts` | Multi-integration dispatch | `prepareOperation()`, `resumeOperation()` |
| Chains | `src/api/chains.ts` | Direct + runtime | `getChain()`, `listSupportedChains()` |
| Tokens | `src/api/tokens.ts` | Direct | `resolveToken()`, `listChainTokens()` |
| Simulation | `src/api/simulation.ts` | Direct | `simulateTransaction()` |

**When adding or removing tools, you must update both layers:**
- Add/remove the MCP tool handler in `src/tools/<group>/index.ts`
- Add/remove the corresponding SDK function in the appropriate `src/api/` file
- Export the function, schemas, and types from `src/index.ts`
- Verify with `pnpm run build` — the DTS output in `dist/index.d.ts` is the public API contract

**Never remove a public export without checking downstream consumers.** Search the monorepo (`/Users/ignacioblitzer/Develop/defizoo/web3agent/`) for imports of any function you're removing.

## Tool Schemas

- **Zod as single source of truth** — for both input and output shapes. Define the Zod schema first, then derive the TypeScript type with `z.infer<typeof schema>`. Never maintain a separate `interface` that duplicates a Zod schema.
- **All fields must have `.describe()`** — input AND output. Enforced by `tests/tools/schema-quality.test.ts` (auto-discovers all schema files).
- **Generate `inputSchema`** via `zodToJsonSchema()`. Never write manual JSON schemas.
- **Use shared base schemas** from `src/api/schemas/common.ts`: `chainIdOptionalSchema`, `tokenPairSchema`, `tokenAmountSchema`, `tokenEstimateSchema`. Extend them instead of redeclaring `fromToken`/`toToken`/`fromAmount` fields.
- **Consistent naming** — always `fromToken`/`toToken`/`fromAmount` (never `srcToken`/`dstToken`/`inAmount`/`fromTokenAddress`). Map to SDK-specific names at the call boundary.

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
