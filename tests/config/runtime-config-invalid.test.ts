import { describe, expect, it } from "vitest";
import { ValidationError, parseEnv } from "../../src/config/env.js";

describe("runtime config validation errors", () => {
  it("throws ValidationError for non-numeric CHAIN_ID", () => {
    expect(() => parseEnv({ CHAIN_ID: "not-a-number" })).toThrow(ValidationError);
  });

  it("throws ValidationError for unsupported CHAIN_ID", () => {
    expect(() => parseEnv({ CHAIN_ID: "9999999" })).toThrow(ValidationError);
  });

  it("ValidationError has field property", () => {
    try {
      parseEnv({ CHAIN_ID: "not-a-number" });
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).field).toBe("CHAIN_ID");
      expect((e as ValidationError).rawValue).toBe("not-a-number");
    }
  });

  it("throws ValidationError for non-integer CHAIN_ID", () => {
    expect(() => parseEnv({ CHAIN_ID: "3.14" })).toThrow(ValidationError);
  });

  it("throws ValidationError for non-numeric WALLET_ACCOUNT_INDEX", () => {
    expect(() => parseEnv({ WALLET_ACCOUNT_INDEX: "abc" })).toThrow(ValidationError);
  });
});
