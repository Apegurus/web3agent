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
│   ├── shared/         # Shared utilities (handler-factory, chain-context, write-context)
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
- **Type safety** — `catch (e: unknown)` always. No `@ts-ignore` or `@ts-expect-error`. `as any` only with biome-ignore explaining the SDK constraint
- **Tool handlers** return `CallToolResult` with structured `{ ok, data }` or `{ ok: false, error: { code, message } }` envelopes

## Single Source of Truth

Never duplicate utility functions across modules. Canonical locations:

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

## Tool Schemas

### Zod as source of truth

Every tool's `inputSchema` is generated from a Zod schema via `zodToJsonSchema()`. Never write manual JSON schemas.

```typescript
// CORRECT
inputSchema: zodToJsonSchema(myToolSchema) as Record<string, unknown>,

// WRONG — do not write manual JSON
inputSchema: { type: "object", properties: { ... }, required: [...] },
```

### Every field must have `.describe()`

All Zod schema fields must have `.describe("...")` annotations. This is enforced by `tests/tools/schema-quality.test.ts` — the test will fail if any field is missing a description.

```typescript
// CORRECT
const mySchema = z.object({
  chainId: z.number().optional().describe("Chain ID (defaults to runtime config)"),
  amount: z.string().describe("Amount in smallest token units"),
});

// WRONG — missing .describe()
const mySchema = z.object({
  chainId: z.number().optional(),
  amount: z.string(),
});
```

### `chainId` convention

When a tool handler falls back to `getConfig().chainId`, make `chainId` optional in the schema and use `resolveToolChainId()` in the handler:

```typescript
// Schema
chainId: z.number().optional().describe("Chain ID (defaults to runtime config)"),

// Handler
const chainId = resolveToolChainId(v.data.chainId);
```

## Adding a New Tool

1. **Define the Zod schema** in `src/tools/<group>/schemas.ts` with `.describe()` on every field
2. **Write the handler** — use `createToolHandler` for read-only tools, manual pattern for write/complex tools
3. **Define the tool** in `src/tools/<group>/index.ts` with `zodToJsonSchema(schema)` for `inputSchema`
4. **Register executors** if the tool uses `executeWrite()`
5. **Add tests** in `tests/` mirroring the source path
6. **Export schemas** from `src/index.ts` if they are part of the public API

### Read-only tools — use `createToolHandler`

For simple validate → execute → return tools with no early-return branches:

```typescript
const myHandler = createToolHandler(
  mySchema,
  async (input) => {
    // business logic — return data, not CallToolResult
    return { result: "value" };
  },
  "MY_ERROR_CODE"
);
```

### Write tools — use `executeWrite` + `buildWriteContext`

```typescript
async function myWriteHandler(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(mySchema, params);
  if (!v.success) return v.error;

  const chainId = resolveToolChainId(v.data.chainId);

  return executeWrite({
    toolName: "my_tool",
    description: `Do something on chain ${chainId}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeMyTool,
  });
}

async function executeMyTool(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const { someField, chainId: rawChainId } = params as { someField: string; chainId?: number };
    const chainId = resolveToolChainId(rawChainId);
    const ctx = buildWriteContext(chainId);
    if (!isWriteContext(ctx)) return ctx;
    const { chain, account, walletClient, publicClient } = ctx;

    // ... contract interaction ...

    return formatToolResponse({ status: "done", txHash: hash });
  } catch (e: unknown) {
    return formatToolError("MY_ERROR", e instanceof Error ? e.message : String(e));
  }
}
```

## Error Handling

### No empty catch blocks

Every catch block must either handle the error or explain why it's ignored.

```typescript
// WRONG
try { await client.close(); } catch {}

// CORRECT
try {
  await client.close();
} catch (e: unknown) {
  process.stderr.write(`[module] Failed to close client: ${e}\n`);
}
```

Biome enforces this via `noEmptyBlockStatements: "warn"`. If a catch block intentionally ignores an error, add a `biome-ignore` comment:

```typescript
// biome-ignore lint/suspicious/noEmptyBlockStatements: file may not exist, null return is the API contract
catch { return null; }
```

### Tool error formatting

Use the canonical error helpers, never format errors manually:

```typescript
// Read-only tools via createToolHandler — errors handled automatically

// Write tools / complex handlers:
return formatToolError("ERROR_CODE", "Human-readable message");
return formatToolErrorFromUnknown("FALLBACK_CODE", error);
```

### Forbidden patterns

- `@ts-ignore` — never
- `@ts-expect-error` — never
- `as unknown as SomeType` — only at SDK boundaries with comment
- Untyped `catch (e)` — always use `catch (e: unknown)`

## Async & Event Handling

### Async event handlers must catch

Async callbacks on event emitters must wrap their body in try-catch. Unhandled rejections crash the process.

```typescript
walletEvents.on("wallet-changed", async (state) => {
  try {
    await this.restart();
  } catch (e: unknown) {
    process.stderr.write(`[module] Restart failed: ${e}\n`);
  }
});
```

### Fire-and-forget promises must catch

If you call an async function without awaiting, append `.catch()`:

```typescript
this.server
  .notification({ method: "notifications/tools/list_changed" })
  .catch((e: unknown) => {
    process.stderr.write(`[module] Notification failed: ${e}\n`);
  });
```

### Event listeners must have cleanup

Store handler references as class properties. Remove them in `shutdown()` or `destroy()`.

## Testing

- Vitest with `tests/` mirroring `src/` structure
- Mock external dependencies (SDK calls, network, filesystem)
- Test both success and error paths
- All new modules must have corresponding test files
- Run `pnpm test` before every commit

### Test file naming

```
src/orbs/chains.ts       → tests/orbs/chains.test.ts
src/config/health.ts     → tests/config/health.test.ts
```

## Import Conventions

- Use `.js` extension in import paths (ESM requirement)
- Prefer type-only imports: `import type { Foo } from "./bar.js"`
- Group imports: Node builtins, external packages, internal modules

## Biome Configuration

Key rules beyond `recommended`:

- `noEmptyBlockStatements: "warn"` — prevents silent error swallowing
- `noExplicitAny` — enforced, requires `biome-ignore` with justification

## Logging

All runtime log messages go to `process.stderr.write()` with module prefix:

```typescript
process.stderr.write(`[module-name] Message here\n`);
```

Never use `console.log` — stdout is reserved for MCP protocol messages.
