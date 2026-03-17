---
description: Error handling, async patterns, and type safety rules
globs: src/**/*.ts
---

# Error Handling & Async Patterns

## Catch Blocks

Every catch block must handle the error or explain why it's ignored:

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

If intentionally ignoring, add biome-ignore:

```typescript
// biome-ignore lint/suspicious/noEmptyBlockStatements: file may not exist
catch { return null; }
```

## Forbidden Patterns

- `@ts-ignore` — never
- `@ts-expect-error` — never
- `as unknown as SomeType` — only at SDK boundaries with comment
- Untyped `catch (e)` — always use `catch (e: unknown)`
- `as any` — only with biome-ignore explaining the SDK constraint

## Async Event Handlers Must Catch

Unhandled rejections crash the process:

```typescript
walletEvents.on("wallet-changed", async (state) => {
  try {
    await this.restart();
  } catch (e: unknown) {
    process.stderr.write(`[module] Restart failed: ${e}\n`);
  }
});
```

## Fire-and-Forget Promises Must Catch

```typescript
this.server
  .notification({ method: "notifications/tools/list_changed" })
  .catch((e: unknown) => {
    process.stderr.write(`[module] Notification failed: ${e}\n`);
  });
```

## Event Listeners Must Have Cleanup

Store handler references as class properties. Remove them in `shutdown()` or `destroy()`.
