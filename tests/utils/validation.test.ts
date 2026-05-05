import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateAddress, validateInput } from "../../src/utils/validation.js";

describe("validateInput", () => {
  const inputSchema = z.object({
    name: z.string().min(1),
    amount: z.number().int().positive(),
  });

  it("returns success=true with parsed data for valid input", () => {
    const result = validateInput(inputSchema, { name: "swap", amount: 1 });

    expect(result).toEqual({
      success: true,
      data: { name: "swap", amount: 1 },
    });
  });

  it("returns success=false with CallToolResult for invalid input", () => {
    const result = validateInput(inputSchema, { name: "", amount: -1 });

    expect(result.success).toBe(false);
    if (result.success) {
      expect.unreachable("expected invalid result");
    }

    expect(result.error).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: "INVALID_PARAMS",
        },
      },
    });
    const text = (result.error.content[0] as { text: string }).text;
    expect(text).toContain("name");
    expect(text).toContain("amount");
  });
});

describe("validateAddress", () => {
  it("returns null for valid address", () => {
    const result = validateAddress("0x1234567890123456789012345678901234567890", "recipient");
    expect(result).toBeNull();
  });

  it("returns CallToolResult error for invalid address", () => {
    const result = validateAddress("not-an-address", "recipient");

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: "INVALID_ADDRESS",
          message: 'Invalid Ethereum address for recipient: "not-an-address"',
        },
      },
    });
  });
});
