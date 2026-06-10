import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("wallet-utils", () => {
  let originalPassphrase: string | undefined;

  beforeEach(() => {
    originalPassphrase = process.env.OWS_PASSPHRASE;
    Reflect.deleteProperty(process.env, "OWS_PASSPHRASE");
  });

  afterEach(() => {
    if (originalPassphrase === undefined) {
      Reflect.deleteProperty(process.env, "OWS_PASSPHRASE");
    } else {
      process.env.OWS_PASSPHRASE = originalPassphrase;
    }
  });

  describe("hasConfiguredOwsPassphrase", () => {
    it("returns false when OWS_PASSPHRASE is not set", async () => {
      const { hasConfiguredOwsPassphrase } = await import("../../src/wallet/wallet-utils.js");
      expect(hasConfiguredOwsPassphrase()).toBe(false);
    });

    it("returns false when OWS_PASSPHRASE is empty string", async () => {
      process.env.OWS_PASSPHRASE = "";
      const { hasConfiguredOwsPassphrase } = await import("../../src/wallet/wallet-utils.js");
      expect(hasConfiguredOwsPassphrase()).toBe(false);
    });

    it("returns false when OWS_PASSPHRASE is whitespace only", async () => {
      process.env.OWS_PASSPHRASE = "   ";
      const { hasConfiguredOwsPassphrase } = await import("../../src/wallet/wallet-utils.js");
      expect(hasConfiguredOwsPassphrase()).toBe(false);
    });

    it("returns true when OWS_PASSPHRASE is a non-empty string", async () => {
      process.env.OWS_PASSPHRASE = "my-secret";
      const { hasConfiguredOwsPassphrase } = await import("../../src/wallet/wallet-utils.js");
      expect(hasConfiguredOwsPassphrase()).toBe(true);
    });
  });

  describe("normalizePrivateKey", () => {
    it("returns a valid 32-byte hex key with 0x prefix as-is", async () => {
      const { normalizePrivateKey } = await import("../../src/wallet/wallet-utils.js");
      const key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      expect(normalizePrivateKey(key)).toBe(key);
    });

    it("prepends 0x to a valid 32-byte hex key without prefix", async () => {
      const { normalizePrivateKey } = await import("../../src/wallet/wallet-utils.js");
      const raw = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      expect(normalizePrivateKey(raw)).toBe(`0x${raw}`);
    });

    it("returns null for a key that is too short", async () => {
      const { normalizePrivateKey } = await import("../../src/wallet/wallet-utils.js");
      expect(normalizePrivateKey("0x1234")).toBeNull();
    });

    it("returns null for a key with non-hex characters", async () => {
      const { normalizePrivateKey } = await import("../../src/wallet/wallet-utils.js");
      expect(
        normalizePrivateKey("0xzz0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")
      ).toBeNull();
    });
  });

  describe("requirePrivateKey", () => {
    it("returns normalized key for valid input", async () => {
      const { requirePrivateKey } = await import("../../src/wallet/wallet-utils.js");
      const key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      expect(requirePrivateKey(key)).toBe(key);
    });

    it("throws with default message for invalid input", async () => {
      const { requirePrivateKey } = await import("../../src/wallet/wallet-utils.js");
      expect(() => requirePrivateKey("0x1234")).toThrow("[wallet] Invalid 32-byte hex private key");
    });

    it("throws with custom message when provided", async () => {
      const { requirePrivateKey } = await import("../../src/wallet/wallet-utils.js");
      expect(() => requirePrivateKey("0x1234", "custom error")).toThrow("custom error");
    });
  });

  describe("isRecord", () => {
    it("returns true for plain objects", async () => {
      const { isRecord } = await import("../../src/wallet/wallet-utils.js");
      expect(isRecord({})).toBe(true);
      expect(isRecord({ key: "value" })).toBe(true);
    });

    it("returns false for null", async () => {
      const { isRecord } = await import("../../src/wallet/wallet-utils.js");
      expect(isRecord(null)).toBe(false);
    });

    it("returns false for non-object types", async () => {
      const { isRecord } = await import("../../src/wallet/wallet-utils.js");
      expect(isRecord("string")).toBe(false);
      expect(isRecord(42)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord(true)).toBe(false);
    });

    it("returns true for arrays (arrays are objects)", async () => {
      const { isRecord } = await import("../../src/wallet/wallet-utils.js");
      expect(isRecord([1, 2, 3])).toBe(true);
    });
  });
});
