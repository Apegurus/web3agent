import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../../src/create/templates.js";

describe("create-web3agent template ownership", () => {
  it("resolves starter assets from the root package template directory", () => {
    const template = resolveTemplate("vercel-ai-sdk");
    const relativeSourceDir = relative(process.cwd(), template.sourceDir).replaceAll("\\", "/");

    expect(relativeSourceDir.startsWith("templates/create/")).toBe(true);
    expect(relativeSourceDir.includes("packages/create-web3agent")).toBe(false);
  });
});
