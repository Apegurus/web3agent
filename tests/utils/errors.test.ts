import { describe, expect, it } from "vitest";
import { formatToolError, formatToolResponse } from "../../src/utils/errors.js";

describe("formatToolError", () => {
  it("returns isError true with error code and message", () => {
    const result = formatToolError("INVALID_INPUT", "missing parameter");

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "missing parameter",
      },
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify({
        error: "INVALID_INPUT",
        message: "missing parameter",
      }),
    });
  });

  it("includes details when provided", () => {
    const details = { field: "address", reason: "invalid format" };
    const result = formatToolError("VALIDATION_ERROR", "bad input", details);

    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "bad input",
        details,
      },
    });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toEqual({
      error: "VALIDATION_ERROR",
      message: "bad input",
      details,
    });
  });

  it("sets details to undefined when omitted", () => {
    const result = formatToolError("ERR", "msg");
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.details).toBeUndefined();
  });
});

describe("formatToolResponse", () => {
  it("returns isError false with JSON-stringified object data", () => {
    const data = { balance: "1.5", token: "ETH" };
    const result = formatToolResponse(data);

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({
      ok: true,
      data,
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify(data, null, 2),
    });
  });

  it("returns raw string when data is a string", () => {
    const result = formatToolResponse("hello world");

    expect(result.structuredContent).toEqual({
      ok: true,
      data: "hello world",
    });
    expect(result.content[0]).toEqual({
      type: "text",
      text: "hello world",
    });
  });

  it("handles numeric data", () => {
    const result = formatToolResponse(42);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toBe(42);
  });

  it("handles null data", () => {
    const result = formatToolResponse(null);
    expect((result.content[0] as { text: string }).text).toBe("null");
    expect(result.isError).toBe(false);
  });

  it("handles array data", () => {
    const data = [1, 2, 3];
    const result = formatToolResponse(data);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toEqual([1, 2, 3]);
  });
});
