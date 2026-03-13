import { describe, expect, it } from "vitest";
import { formatToolError, formatToolResponse } from "../src/utils/errors.js";

describe("smoke test — package scaffold", () => {
  it("formatToolError returns MCP error structure", () => {
    const result = formatToolError("TEST_ERROR", "test message", { detail: "x" });
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: "TEST_ERROR",
        message: "test message",
        details: { detail: "x" },
      },
    });
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.error).toBe("TEST_ERROR");
    expect(parsed.message).toBe("test message");
    expect(parsed.details?.detail).toBe("x");
  });

  it("formatToolResponse wraps strings", () => {
    const result = formatToolResponse("hello");
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({
      ok: true,
      data: "hello",
    });
    expect(result.content[0].text).toBe("hello");
  });

  it("formatToolResponse serializes objects", () => {
    const result = formatToolResponse({ foo: "bar" });
    expect(result.structuredContent).toEqual({
      ok: true,
      data: { foo: "bar" },
    });
    const parsed = JSON.parse(result.content[0].text as string);
    expect(parsed.foo).toBe("bar");
  });
});
