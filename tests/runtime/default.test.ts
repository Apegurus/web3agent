import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  createRuntime: vi.fn(),
  shutdown: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/runtime/managed-runtime.js", () => ({
  createRuntime: (...args: unknown[]) => mockState.createRuntime(...args),
}));

describe("default runtime lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.createRuntime.mockReset();
    mockState.shutdown.mockClear();
  });

  it("caches the default runtime and allows it to be shut down and recreated", async () => {
    mockState.createRuntime.mockResolvedValue({
      shutdown: mockState.shutdown,
    });

    const { getDefaultRuntime, resetDefaultRuntimeForTests, shutdownDefaultRuntime } = await import(
      "../../src/runtime/default.js"
    );

    const first = getDefaultRuntime();
    const second = getDefaultRuntime();

    expect(first).toBe(second);
    await expect(first).resolves.toEqual({
      shutdown: mockState.shutdown,
    });
    expect(mockState.createRuntime).toHaveBeenCalledTimes(1);

    await shutdownDefaultRuntime();
    expect(mockState.shutdown).toHaveBeenCalledTimes(1);

    mockState.createRuntime.mockResolvedValue({
      shutdown: mockState.shutdown,
      id: "next-runtime",
    });

    await expect(getDefaultRuntime()).resolves.toEqual({
      shutdown: mockState.shutdown,
      id: "next-runtime",
    });
    expect(mockState.createRuntime).toHaveBeenCalledTimes(2);

    resetDefaultRuntimeForTests();
  });
});
