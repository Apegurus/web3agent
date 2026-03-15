---
description: Patterns for adding and modifying tool handlers and API functions
globs: src/tools/**/*.ts, src/api/**/*.ts
---

# Tool Patterns

## Adding a New Tool

1. Define Zod schema in `src/tools/<group>/schemas.ts` with `.describe()` on every field
2. Write handler — `createToolHandler` for read-only, manual pattern for write/complex
3. Define tool in `src/tools/<group>/index.ts` with `zodToJsonSchema(schema)` for `inputSchema`
4. Register executors if tool uses `executeWrite()`
5. Add tests in `tests/` mirroring source path
6. Export schemas from `src/index.ts` if part of the public API

## Read-Only Tools

Use `createToolHandler` for simple validate → execute → return tools:

```typescript
const myHandler = createToolHandler(
  mySchema,
  async (input) => {
    return { result: "value" }; // return data, not CallToolResult
  },
  "MY_ERROR_CODE"
);
```

## Write Tools

Use `executeWrite()` + `buildWriteContext()`:

```typescript
async function myExecutor(params: Record<string, unknown>): Promise<CallToolResult> {
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

## Single Source of Truth

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
