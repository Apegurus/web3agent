import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("backend-selector", () => {
  let originalOwsForceLegacy: string | undefined;

  beforeEach(() => {
    originalOwsForceLegacy = process.env.OWS_FORCE_LEGACY;
    Reflect.deleteProperty(process.env, "OWS_FORCE_LEGACY");
  });

  afterEach(async () => {
    const mod = await import("../../src/wallet/backend-selector.js");
    mod.resetWalletBackend();
    if (originalOwsForceLegacy === undefined) {
      Reflect.deleteProperty(process.env, "OWS_FORCE_LEGACY");
    } else {
      process.env.OWS_FORCE_LEGACY = originalOwsForceLegacy;
    }
  });

  describe("detectOwsAvailability", () => {
    it("returns false when resolver throws a module-not-found error", async () => {
      const { detectOwsAvailability, setOwsPackageResolverForTests } = await import(
        "../../src/wallet/backend-selector.js"
      );
      setOwsPackageResolverForTests(() => {
        throw Object.assign(new Error("Cannot find module"), { code: "MODULE_NOT_FOUND" });
      });
      expect(detectOwsAvailability()).toBe(false);
    });

    it("returns true when resolver returns a path", async () => {
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
  });

  describe("selectWalletBackend", () => {
    it("returns LegacyWalletBackend when resolver reports package unavailable", async () => {
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

    it("caches the selected backend on subsequent calls", async () => {
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
