import { describe, expect, it } from "vitest";
import { isPlainObject } from "../../src/utils/type-guards.js";

describe("isPlainObject", () => {
  it("returns true for ordinary objects", () => {
    expect(isPlainObject({ hello: "world" })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it("returns false for arrays and null", () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
  });

  it("returns false for class instances and built-ins", () => {
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
  });
});
