import { describe, expect, it } from "vitest";
import { joinSignature, splitSignature } from "../../src/utils/signature.js";

// A well-known dummy signature (65 bytes = 130 hex chars + 0x prefix = 132 chars)
// r = 32 bytes of 'aa', s = 32 bytes of 'bb', v = 0x1b (27)
const VALID_SIG_V27 = `0x${"aa".repeat(32)}${"bb".repeat(32)}1b`; // v = 27

const VALID_SIG_V28 = `0x${"cc".repeat(32)}${"dd".repeat(32)}1c`; // v = 28

describe("splitSignature", () => {
  it("correctly splits r, s, v from a valid 132-char hex signature (v=27)", () => {
    const result = splitSignature(VALID_SIG_V27);

    expect(result.r).toBe(`0x${"aa".repeat(32)}`);
    expect(result.s).toBe(`0x${"bb".repeat(32)}`);
    expect(result.v).toBe("0x1b");
  });

  it("correctly splits r, s, v from a valid 132-char hex signature (v=28)", () => {
    const result = splitSignature(VALID_SIG_V28);

    expect(result.r).toBe(`0x${"cc".repeat(32)}`);
    expect(result.s).toBe(`0x${"dd".repeat(32)}`);
    expect(result.v).toBe("0x1c");
  });

  it("throws when the 0x prefix is missing", () => {
    const noPrefix = `${"aa".repeat(32) + "bb".repeat(32)}1b`;

    expect(() => splitSignature(noPrefix)).toThrowError(
      "Invalid signature: must start with 0x prefix"
    );
  });

  it("throws when the signature has wrong length (too short)", () => {
    const tooShort = `0x${"aa".repeat(16)}`;

    expect(() => splitSignature(tooShort)).toThrowError(/expected 132 characters/);
  });

  it("throws when the signature has wrong length (too long)", () => {
    const tooLong = `0x${"aa".repeat(66)}`;

    expect(() => splitSignature(tooLong)).toThrowError(/expected 132 characters/);
  });

  it("throws when the signature contains non-hex characters", () => {
    // 130 hex chars total, but with 'zz' (non-hex) embedded
    const nonHex = `0x${"aa".repeat(32)}${"bb".repeat(31)}zz1b`;

    expect(() => splitSignature(nonHex)).toThrowError(
      "Invalid signature: contains non-hex characters"
    );
  });

  it("round-trips a split signature through joinSignature", () => {
    const split = splitSignature(VALID_SIG_V27);

    expect(
      joinSignature({
        r: split.r,
        s: split.s,
        v: split.v,
      })
    ).toBe(VALID_SIG_V27);
  });
});
