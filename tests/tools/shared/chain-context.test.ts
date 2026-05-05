import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/config/env.js", () => ({
  getConfig: vi.fn(() => ({ chainId: 8453 })),
}));

vi.mock("../../../src/chains/registry.js", () => ({
  getChainById: vi.fn((id: number) => (id === 8453 ? { id: 8453, name: "Base" } : undefined)),
}));

describe("resolveToolChainId", () => {
  it("uses provided chainId when given", async () => {
    const { resolveToolChainId } = await import("../../../src/tools/shared/chain-context.js");
    expect(resolveToolChainId(1)).toBe(1);
  });

  it("falls back to config chainId when undefined", async () => {
    const { resolveToolChainId } = await import("../../../src/tools/shared/chain-context.js");
    expect(resolveToolChainId(undefined)).toBe(8453);
  });
});

describe("resolveToolChain", () => {
  it("returns chain object for valid chainId", async () => {
    const { resolveToolChain, isChainResolved } = await import(
      "../../../src/tools/shared/chain-context.js"
    );
    const result = resolveToolChain(8453);
    expect(isChainResolved(result)).toBe(true);
    if (isChainResolved(result)) {
      expect(result.chain.id).toBe(8453);
    }
  });

  it("returns error for unsupported chainId", async () => {
    const { resolveToolChain, isChainResolved } = await import(
      "../../../src/tools/shared/chain-context.js"
    );
    const result = resolveToolChain(99999);
    expect(isChainResolved(result)).toBe(false);
  });
});
