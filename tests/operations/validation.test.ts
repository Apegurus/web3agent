import { describe, expect, it } from "vitest";
import { Web3AgentError } from "../../src/api/errors.js";
import {
  assertAddress,
  assertHex,
  assertInteger,
  assertRecord,
  parseBigIntString,
} from "../../src/operations/validation.js";

describe("assertAddress", () => {
  it("returns a valid address", () => {
    const addr = "0x1234567890123456789012345678901234567890";
    expect(assertAddress(addr, "test")).toBe(addr);
  });

  it("throws Web3AgentError for invalid address", () => {
    expect(() => assertAddress("not-an-address", "test")).toThrow(Web3AgentError);
    try {
      assertAddress("not-an-address", "test");
    } catch (err) {
      expect((err as Web3AgentError).code).toBe("INVALID_PARAMS");
    }
  });
});

describe("assertHex", () => {
  it("returns a valid hex string", () => {
    expect(assertHex("0xdeadbeef", "test")).toBe("0xdeadbeef");
  });

  it("throws for non-hex string", () => {
    expect(() => assertHex("nothex", "test")).toThrow();
  });
});

describe("assertRecord", () => {
  it("returns a valid record", () => {
    const obj = { a: 1 };
    expect(assertRecord(obj, "test")).toBe(obj);
  });

  it("throws for null", () => {
    expect(() => assertRecord(null, "test")).toThrow();
  });

  it("throws for array", () => {
    expect(() => assertRecord([1, 2], "test")).toThrow();
  });

  it("throws for string", () => {
    expect(() => assertRecord("string", "test")).toThrow();
  });
});

describe("assertInteger", () => {
  it("returns a valid integer", () => {
    expect(assertInteger(42, "test")).toBe(42);
  });

  it("throws for float", () => {
    expect(() => assertInteger(3.14, "test")).toThrow();
  });

  it("throws for string", () => {
    expect(() => assertInteger("string" as unknown as number, "test")).toThrow();
  });
});

describe("parseBigIntString", () => {
  it("parses a valid bigint string", () => {
    expect(parseBigIntString("123", "test")).toBe(123n);
  });

  it("throws for invalid string", () => {
    expect(() => parseBigIntString("abc", "test")).toThrow();
  });
});
