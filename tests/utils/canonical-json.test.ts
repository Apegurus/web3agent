import { describe, expect, it } from "vitest";

import { canonicalJson } from "../../src/utils/canonical-json.js";

describe("canonicalJson", () => {
  it("Given equivalent objects with different key order, when serialized, then output is identical", () => {
    expect(canonicalJson({ z: 1, a: { y: true, b: "value" } })).toBe(
      canonicalJson({ a: { b: "value", y: true }, z: 1 })
    );
  });

  it("Given bigint values, when serialized, then their decimal representation is stable", () => {
    expect(canonicalJson({ amount: 123n })).toBe('{"amount":"123"}');
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, () => undefined, Symbol("value")])(
    "Given a non-canonical value, when serialized, then it rejects instead of dropping data",
    (value) => {
      expect(() => canonicalJson({ value })).toThrow();
    }
  );
});
