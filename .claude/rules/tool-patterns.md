---
description: Patterns for adding and modifying tool handlers and API functions
globs: src/tools/**/*.ts, src/api/**/*.ts
---

# Tool Patterns

## Zod as Single Source of Truth

Define the Zod schema first, derive the TypeScript type from it. Never maintain a separate `interface` that duplicates a Zod schema. All Zod fields — input AND output — must have `.describe()`.

```typescript
// CORRECT — Zod is the source, type is derived
export const myResultSchema = z.object({
  status: z.string().describe("Result status"),
  txHash: z.string().optional().describe("Transaction hash"),
});
export type MyResult = z.infer<typeof myResultSchema>;

// WRONG — duplicate interface alongside Zod schema
export interface MyResult { status: string; txHash?: string; }  // will drift
```

Input schemas live in `src/tools/<group>/schemas.ts` or `src/api/schemas/`. Output schemas live in `src/api/schemas/outputs.ts`. Types derived from both live in `src/api/types.ts`.

## Shared Base Schemas

Extend shared schemas from `src/api/schemas/common.ts` instead of redeclaring common fields:

```typescript
import { chainIdOptionalSchema, tokenAmountSchema } from "./common.js";

// CORRECT — extends shared base
export const myToolSchema = tokenAmountSchema.extend({
  chainId: chainIdOptionalSchema,
  slippage: z.number().optional().describe("Slippage percentage"),
});

// WRONG — redeclares fromToken, toToken, fromAmount
export const myToolSchema = z.object({
  fromToken: z.string().describe("Source token address"),
  toToken: z.string().describe("Destination token address"),
  fromAmount: z.string().describe("Amount"),
  chainId: z.number().optional().describe("Chain ID"),
  slippage: z.number().optional().describe("Slippage"),
});
```

Available bases: `chainIdOptionalSchema`, `tokenPairSchema` (fromToken + toToken), `tokenAmountSchema` (+ fromAmount), `tokenEstimateSchema` (+ decimals + USD values).

## Field Naming Convention

Always use `from/to` naming. Map to SDK-specific names at the call boundary:

```typescript
const { fromToken, toToken, fromAmount } = v.data;
sdk.call({ srcToken: fromToken, dstToken: toToken, inAmount: fromAmount });
```

Never use `srcToken`, `dstToken`, `inAmount`, `fromTokenAddress`, `toTokenAddress` in schemas.

## Adding a New Tool

**MCP layer:**
1. Define Zod input schema in `src/tools/<group>/schemas.ts` with `.describe()` on every field
2. Define Zod output schema in `src/api/schemas/outputs.ts` with `.describe()` on every field if the output is part of the public API
3. Derive TypeScript types in `src/api/types.ts` via `z.infer<typeof schema>`
4. Write handler — `createToolHandler` for read-only, manual pattern for write/complex
5. Define tool in `src/tools/<group>/index.ts` with `zodToJsonSchema(schema)` for `inputSchema`
6. Register executors if tool uses `executeWrite()`
7. Add tests in `tests/` mirroring source path

**SDK layer (mandatory — downstream projects like Orbzy import from `"web3agent"`):**
8. Add SDK function in the appropriate `src/api/` file — use `getRuntime()` + `invokeAndRequireData(runtime, toolName, params)` for tool-backed functions, or wrap `prepareOperation()` for intent flows
9. Export the function, schemas, and types from `src/index.ts`
10. Run `pnpm run build` and verify the export appears in `dist/index.d.ts`
11. Search the monorepo for imports of any function you're removing or renaming

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
