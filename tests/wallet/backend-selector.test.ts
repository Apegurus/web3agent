import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SELECTOR_TEST_PASSPHRASE = "selector-test-passphrase";

describe("backend-selector", () => {
  let originalOwsForceLegacy: string | undefined;
  let originalOwsPassphrase: string | undefined;

  beforeEach(() => {
    originalOwsForceLegacy = process.env.OWS_FORCE_LEGACY;
    originalOwsPassphrase = process.env.OWS_PASSPHRASE;
    Reflect.deleteProperty(process.env, "OWS_FORCE_LEGACY");
    Reflect.deleteProperty(process.env, "OWS_PASSPHRASE");
  });

  afterEach(async () => {
    const mod = await import("../../src/wallet/backend-selector.js");
    mod.resetWalletBackend();
    if (originalOwsForceLegacy === undefined) {
      Reflect.deleteProperty(process.env, "OWS_FORCE_LEGACY");
    } else {
      process.env.OWS_FORCE_LEGACY = originalOwsForceLegacy;
    }

    if (originalOwsPassphrase === undefined) {
      Reflect.deleteProperty(process.env, "OWS_PASSPHRASE");
    } else {
      process.env.OWS_PASSPHRASE = originalOwsPassphrase;
    }
  });

  describe("detectOwsAvailability", () => {
    it("returns false when resolver throws a module-not-found error", async () => {
      process.env.OWS_PASSPHRASE = SELECTOR_TEST_PASSPHRASE;
      const { detectOwsAvailability, setOwsPackageResolverForTests } = await import(
        "../../src/wallet/backend-selector.js"
      );
      setOwsPackageResolverForTests(() => {
        throw Object.assign(new Error("Cannot find module"), { code: "MODULE_NOT_FOUND" });
      });
      expect(detectOwsAvailability()).toBe(false);
    });

    it("returns true when resolver returns a path", async () => {
      process.env.OWS_PASSPHRASE = SELECTOR_TEST_PASSPHRASE;
      const { detectOwsAvailability, setOwsPackageResolverForTests } = await import(
        "../../src/wallet/backend-selector.js"
      );
      setOwsPackageResolverForTests(() => "/node_modules/@open-wallet-standard/core/index.js");
      expect(detectOwsAvailability()).toBe(true);
    });

    it("returns false when OWS_FORCE_LEGACY=1 even if resolver succeeds", async () => {
      process.env.OWS_FORCE_LEGACY = "1";
      const { detectOwsAvailability, setOwsPackageResolverForTests } = await import(
        "../../src/wallet/backend-selector.js"
      );
      setOwsPackageResolverForTests(() => "/node_modules/@open-wallet-standard/core/index.js");
      expect(detectOwsAvailability()).toBe(false);
    });

    it("returns false when passphrase is missing even if resolver succeeds", async () => {
      const { detectOwsAvailability, setOwsPackageResolverForTests } = await import(
        "../../src/wallet/backend-selector.js"
      );
      setOwsPackageResolverForTests(() => "/node_modules/@open-wallet-standard/core/index.js");
      expect(detectOwsAvailability()).toBe(false);
    });
  });

  describe("selectWalletBackend", () => {
    it("returns LegacyWalletBackend when resolver reports package unavailable", async () => {
      process.env.OWS_PASSPHRASE = SELECTOR_TEST_PASSPHRASE;
      const { selectWalletBackend, setOwsPackageResolverForTests } = await import(
        "../../src/wallet/backend-selector.js"
      );
      setOwsPackageResolverForTests(() => {
        throw Object.assign(new Error("Cannot find module"), { code: "MODULE_NOT_FOUND" });
      });
      const backend = await selectWalletBackend();
      expect(backend.info.type).toBe("legacy");
    });

    it("returns LegacyWalletBackend when OWS_FORCE_LEGACY=1", async () => {
      process.env.OWS_FORCE_LEGACY = "1";
      const { selectWalletBackend } = await import("../../src/wallet/backend-selector.js");
      const backend = await selectWalletBackend();
      expect(backend.info.type).toBe("legacy");
    });

    it("returns LegacyWalletBackend and logs a warning when passphrase is missing", async () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      try {
        const { selectWalletBackend, setOwsPackageResolverForTests } = await import(
          "../../src/wallet/backend-selector.js"
        );
        setOwsPackageResolverForTests(() => "/node_modules/@open-wallet-standard/core/index.js");

        const backend = await selectWalletBackend();

        expect(backend.info.type).toBe("legacy");
        expect(stderrSpy.mock.calls.flat().join("\n")).toContain(
          "[wallet] OWS passphrase missing or empty"
        );
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it("returns LegacyWalletBackend when passphrase is empty whitespace", async () => {
      process.env.OWS_PASSPHRASE = "   ";
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      try {
        const { selectWalletBackend, setOwsPackageResolverForTests } = await import(
          "../../src/wallet/backend-selector.js"
        );
        setOwsPackageResolverForTests(() => "/node_modules/@open-wallet-standard/core/index.js");

        const backend = await selectWalletBackend();

        expect(backend.info.type).toBe("legacy");
        expect(stderrSpy.mock.calls.flat().join("\n")).toContain(
          "[wallet] OWS passphrase missing or empty"
        );
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it("caches the selected backend on subsequent calls", async () => {
      process.env.OWS_PASSPHRASE = SELECTOR_TEST_PASSPHRASE;
      const { selectWalletBackend, setOwsPackageResolverForTests } = await import(
        "../../src/wallet/backend-selector.js"
      );
      setOwsPackageResolverForTests(() => {
        throw Object.assign(new Error("Cannot find module"), { code: "MODULE_NOT_FOUND" });
      });
      const first = await selectWalletBackend();
      const second = await selectWalletBackend();
      expect(first).toBe(second);
    });
  });

  describe("getWalletBackend", () => {
    it("throws before selectWalletBackend is called", async () => {
      const { getWalletBackend } = await import("../../src/wallet/backend-selector.js");
      expect(() => getWalletBackend()).toThrow();
    });

    it("returns cached backend after selectWalletBackend is called", async () => {
      process.env.OWS_PASSPHRASE = SELECTOR_TEST_PASSPHRASE;
      const { selectWalletBackend, getWalletBackend, setOwsPackageResolverForTests } = await import(
        "../../src/wallet/backend-selector.js"
      );
      setOwsPackageResolverForTests(() => {
        throw Object.assign(new Error("Cannot find module"), { code: "MODULE_NOT_FOUND" });
      });
      const selected = await selectWalletBackend();
      expect(getWalletBackend()).toBe(selected);
    });
  });

  describe("resetWalletBackend", () => {
    it("clears cached backend so getWalletBackend throws again", async () => {
      process.env.OWS_PASSPHRASE = SELECTOR_TEST_PASSPHRASE;
      const {
        selectWalletBackend,
        getWalletBackend,
        resetWalletBackend,
        setOwsPackageResolverForTests,
      } = await import("../../src/wallet/backend-selector.js");
      setOwsPackageResolverForTests(() => {
        throw Object.assign(new Error("Cannot find module"), { code: "MODULE_NOT_FOUND" });
      });
      await selectWalletBackend();
      resetWalletBackend();
      expect(() => getWalletBackend()).toThrow();
    });

    it("clears the test resolver so a new resolver can be injected cleanly", async () => {
      process.env.OWS_PASSPHRASE = SELECTOR_TEST_PASSPHRASE;
      const { detectOwsAvailability, setOwsPackageResolverForTests, resetWalletBackend } =
        await import("../../src/wallet/backend-selector.js");
      setOwsPackageResolverForTests(() => "/some/path");
      expect(detectOwsAvailability()).toBe(true);
      resetWalletBackend();
      setOwsPackageResolverForTests(() => {
        throw Object.assign(new Error("Cannot find module"), { code: "MODULE_NOT_FOUND" });
      });
      expect(detectOwsAvailability()).toBe(false);
    });
  });
});
