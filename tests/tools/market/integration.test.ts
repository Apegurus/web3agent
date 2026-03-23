import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: vi.fn(),
}));

import { getMarketToolDefinitions } from "../../../src/tools/market/index.js";

describe("market tool registration", () => {
  const tools = getMarketToolDefinitions();

  it("registers exactly 20 tools", () => {
    expect(tools).toHaveLength(20);
  });

  it("all tools have the market_ prefix", () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^market_/);
    }
  });

  it("all tools have category 'market'", () => {
    for (const tool of tools) {
      expect(tool.category).toBe("market");
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
