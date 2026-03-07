# AGENTS.md — Engineering Standards for web3agent

This file codifies coding standards for AI agents and human contributors working on this codebase.

## Error Handling

### No Empty Catch Blocks

Every catch block must either handle the error or explain why it's ignored.

```typescript
// WRONG
try { await client.close(); } catch {}

// CORRECT — log to stderr
try {
  await client.close();
} catch (e: unknown) {
  process.stderr.write(`[module] Failed to close client: ${e}\n`);
}
```

Biome enforces this via `noEmptyBlockStatements: "warn"`.

### Explicit Catch Typing

Always annotate catch variables with `: unknown`, even though `strict` mode infers it.

```typescript
// WRONG
catch (err) {

// CORRECT
catch (err: unknown) {
```

### No Silent Error Swallowing

If a catch block intentionally ignores an error, add a `biome-ignore` comment explaining why:

```typescript
// biome-ignore lint/suspicious/noEmptyBlockStatements: file may not exist, null return is the API contract
catch { return null; }
```

## Type Safety

### No `as any` Without Justification

Every `as any` cast requires a `biome-ignore` comment explaining the SDK or API constraint that forces it:

```typescript
// biome-ignore lint/suspicious/noExplicitAny: LI.FI SDK expects loosely typed WalletClient
return createWalletClientForChain(account, chainId) as any;
```

If you find yourself needing `as any` for non-SDK reasons, refactor the code instead.

### Forbidden Patterns

- `@ts-ignore` — never
- `@ts-expect-error` — never
- `as unknown as SomeType` — only at SDK boundaries with comment
- Untyped `catch (e)` — always use `catch (e: unknown)`

## Async & Event Handling

### Async Event Handlers Must Catch

Async callbacks on event emitters must wrap their body in try-catch. Unhandled rejections crash the process.

```typescript
// WRONG — unhandled rejection if restart() throws
walletEvents.on("wallet-changed", async (state) => {
  await this.restart();
});

// CORRECT
walletEvents.on("wallet-changed", async (state) => {
  try {
    await this.restart();
  } catch (e: unknown) {
    process.stderr.write(`[module] Restart failed: ${e}\n`);
  }
});
```

### Fire-and-Forget Promises Must Catch

If you call an async function without awaiting, append `.catch()`:

```typescript
this.server
  .notification({ method: "notifications/tools/list_changed" })
  .catch((e: unknown) => {
    process.stderr.write(`[module] Notification failed: ${e}\n`);
  });
```

### Event Listeners Must Have Cleanup

Store handler references as class properties. Remove them in `shutdown()` or `destroy()`:

```typescript
private walletChangeHandler?: (state: WalletState) => void;

initialize() {
  this.walletChangeHandler = async (state) => { /* ... */ };
  walletEvents.on("wallet-changed", this.walletChangeHandler);
}

shutdown() {
  if (this.walletChangeHandler) {
    walletEvents.off("wallet-changed", this.walletChangeHandler);
    this.walletChangeHandler = undefined;
  }
}
```

## Code Organization

### Single Source of Truth

Never duplicate utility functions across modules. Canonical locations:

| Utility | Location |
|---------|----------|
| `formatToolError`, `formatToolResponse` | `src/utils/errors.ts` |
| Chain registry | `src/chains/registry.ts` |
| Wallet state | `src/wallet/persistence.ts` |

### Import Conventions

- Use `.js` extension in import paths (ESM requirement)
- Prefer type-only imports: `import type { Foo } from "./bar.js"`
- Group imports: Node builtins, external packages, internal modules

## Testing

### Coverage Requirements

- All new modules must have corresponding test files
- Test files go in `tests/` mirroring the `src/` directory structure
- Use Vitest (`describe`, `it`, `expect`)
- Mock external dependencies (SDK calls, network, filesystem)
- Test both success paths and error paths

### Test File Naming

```
src/orbs/chains.ts       → tests/orbs/chains.test.ts
src/config/health.ts      → tests/config/health.test.ts
```

## Logging

All runtime log messages go to `process.stderr.write()` with module prefix:

```typescript
process.stderr.write(`[module-name] Message here\n`);
```

Never use `console.log` — stdout is reserved for MCP protocol messages.

## Biome Configuration

The project uses Biome for linting and formatting. Key rules beyond `recommended`:

- `noEmptyBlockStatements: "warn"` — prevents silent error swallowing
- `noExplicitAny` — enforced, requires `biome-ignore` with justification

Run before committing:

```bash
npx biome check --write .
```
