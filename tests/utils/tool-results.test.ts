import { describe, expect, it } from "vitest";
import {
  getToolResultPayload,
  isCallToolResult,
  normalizeCallToolResult,
} from "../../src/utils/tool-results.js";

describe("tool result helpers", () => {
  it("accepts MCP tool results that omit isError and standardizes structuredContent", () => {
    const payload = {
      content: [{ type: "text", text: '{"quote":{"from":"USDC","to":"ETH"}}' }],
    };

    expect(isCallToolResult(payload)).toBe(true);

    const result = normalizeCallToolResult(payload);

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({
      ok: true,
      data: { quote: { from: "USDC", to: "ETH" } },
    });
  });

  it("falls back to raw text when tool payload is not JSON", () => {
    const result = normalizeCallToolResult({
      content: [{ type: "text", text: "plain text response" }],
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({
      ok: true,
      data: "plain text response",
    });
  });

  it("wraps legacy structuredContent objects as success data", () => {
    const result = normalizeCallToolResult({
      isError: false,
      structuredContent: {
        balance: "1.0",
        token: "ETH",
      },
      content: [{ type: "text", text: '{\n  "balance": "1.0",\n  "token": "ETH"\n}' }],
    });

    expect(result.structuredContent).toEqual({
      ok: true,
      data: {
        balance: "1.0",
        token: "ETH",
      },
    });
  });

  it("standardizes legacy flat error payloads", () => {
    const result = normalizeCallToolResult({
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "QUOTE_ERROR",
            message: "route unavailable",
          }),
        },
      ],
    });

    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: "QUOTE_ERROR",
        message: "route unavailable",
      },
    });
  });

  it("extracts the standardized payload", () => {
    const payload = getToolResultPayload({
      isError: false,
      structuredContent: {
        ok: true,
        data: {
          foo: "bar",
        },
      },
      content: [{ type: "text", text: '{\n  "foo": "bar"\n}' }],
    });

    expect(payload).toEqual({
      ok: true,
      data: {
        foo: "bar",
      },
    });
  });
});
