import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: vi.fn(),
}));

vi.mock("../../../src/tokens/resolver.js", () => ({
  resolveToken: vi.fn(),
}));

import { getResearchToolDefinitions } from "../../../src/tools/research/index.js";

describe("research tool registration", () => {
  const tools = getResearchToolDefinitions();

  it("registers exactly 13 tools", () => {
    expect(tools).toHaveLength(13);
  });

  it("all tools have the research_ prefix", () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^research_/);
    }
  });

  it("all tools have category 'research'", () => {
    for (const tool of tools) {
      expect(tool.category).toBe("research");
    }
  });

  it("all tools have readOnlyHint annotation", () => {
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  it("all tools have non-empty descriptions", () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it("all tools have valid inputSchema with type object", () => {
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("no duplicate tool names", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
