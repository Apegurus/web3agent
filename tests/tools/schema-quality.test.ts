import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import type { ZodObject, ZodTypeAny } from "zod";

/**
 * Walks a Zod schema tree and collects field paths missing .describe().
 * Only checks top-level object properties (the MCP tool input level).
 */
function findFieldsMissingDescribe(schema: ZodTypeAny, path = ""): string[] {
  const missing: string[] = [];
  const def = (schema as { _def?: Record<string, unknown> })._def;
  if (!def) return missing;

  // Unwrap ZodOptional, ZodDefault, ZodNullable
  if (
    def.typeName === "ZodOptional" ||
    def.typeName === "ZodDefault" ||
    def.typeName === "ZodNullable"
  ) {
    const inner = (def as { innerType?: ZodTypeAny }).innerType;
    if (inner) return findFieldsMissingDescribe(inner, path);
  }

  // ZodObject: check each property
  if (def.typeName === "ZodObject") {
    const shape = (schema as ZodObject<Record<string, ZodTypeAny>>).shape;
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const fieldDef = (fieldSchema as { _def?: Record<string, unknown> })._def;
      if (!fieldDef) continue;

      // Check if this field has a description
      const desc = fieldDef.description;
      if (!desc) {
        // Unwrap optional/default/nullable to check inner description
        let innerDef = fieldDef;
        while (
          innerDef.typeName === "ZodOptional" ||
          innerDef.typeName === "ZodDefault" ||
          innerDef.typeName === "ZodNullable"
        ) {
          const inner = (innerDef as { innerType?: ZodTypeAny }).innerType;
          if (!inner) break;
          innerDef = (inner as { _def: Record<string, unknown> })._def;
        }
        if (!innerDef.description && !fieldDef.description) {
          missing.push(fieldPath);
        }
      }
    }
  }

  return missing;
}

/**
 * Recursively find all schema files under src/.
 * Matches: *\/schemas.ts, *\/schemas/*.ts
 */
function findSchemaFiles(dir: string, root: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full);
    if (statSync(full).isDirectory()) {
      // Skip node_modules, dist, .git, etc.
      if (entry.startsWith(".") || entry === "node_modules" || entry === "dist") continue;
      results.push(...findSchemaFiles(full, root));
    } else if (
      entry.endsWith(".ts") &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".d.ts") &&
      (entry === "schemas.ts" || rel.includes("/schemas/"))
    ) {
      results.push(full);
    }
  }
  return results;
}

const ROOT = join(import.meta.dirname, "../../src");
const schemaFiles = findSchemaFiles(ROOT, ROOT);

// Dynamic import all discovered schema files
const schemaModules = await Promise.all(
  schemaFiles.map((f) => import(/* @vite-ignore */ f.replace(/\.ts$/, ".js")))
);

// Internal schemas that are not user-facing — skip .describe() checks
const INTERNAL_SCHEMAS = new Set([
  "operationResumeStateSchema",
  "orbsSwapResumeStateStateSchema",
  "orbsOrderResumeStateStateSchema",
  "goatResumeStateStateSchema",
  "lifiBridgeResumeStateStateSchema",
]);

const allSchemas: Array<{ name: string; schema: ZodTypeAny }> = [];
const seen = new Set<string>();
for (const mod of schemaModules) {
  for (const [name, value] of Object.entries(mod)) {
    if (
      name.endsWith("Schema") &&
      !INTERNAL_SCHEMAS.has(name) &&
      !seen.has(name) &&
      value &&
      typeof value === "object" &&
      "_def" in (value as object)
    ) {
      const def = (value as { _def: Record<string, unknown> })._def;
      // Only test ZodObject schemas (tool inputs and outputs)
      if (def.typeName === "ZodObject") {
        allSchemas.push({ name, schema: value as ZodTypeAny });
        seen.add(name);
      }
    }
  }
}

describe("schema quality", () => {
  it("auto-discovered schema files", () => {
    expect(schemaFiles.length).toBeGreaterThan(0);
  });

  it("found schemas to test", () => {
    expect(allSchemas.length).toBeGreaterThan(0);
  });

  for (const { name, schema } of allSchemas) {
    it(`${name} — all fields have .describe()`, () => {
      const missing = findFieldsMissingDescribe(schema);
      if (missing.length > 0) {
        throw new Error(`${name} has fields missing .describe(): ${missing.join(", ")}`);
      }
    });
  }
});
