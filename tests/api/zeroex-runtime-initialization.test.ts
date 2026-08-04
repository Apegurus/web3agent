import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRuntime: vi.fn(),
  prepareZeroExSwapOperation: vi.fn(),
  resumeZeroExSwapOperation: vi.fn(),
}));

vi.mock("../../src/api/shared.js", () => ({
  getRuntime: () => mocks.getRuntime(),
}));

vi.mock("../../src/api/operations/zerox.js", () => ({
  prepareZeroExSwapOperation: (input: unknown) => mocks.prepareZeroExSwapOperation(input),
  resumeZeroExSwapOperation: (state: unknown, results: unknown) =>
    mocks.resumeZeroExSwapOperation(state, results),
}));

describe("0x runtime initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRuntime.mockResolvedValue({});
    mocks.prepareZeroExSwapOperation.mockResolvedValue({
      actions: [],
      integration: "zeroex",
      kind: "swap",
      resumeState: {
        integration: "zeroex",
        kind: "swap",
        state: { integrity: `v1.${"a".repeat(16)}.${"b".repeat(64)}` },
        version: 1,
      },
    });
  });

  it("Given a cold root SDK, when preparing the first 0x operation, then it initializes runtime first", async () => {
    const { prepareOperation } = await import("../../src/api/operations.js");

    await prepareOperation({
      account: "0x1234567890123456789012345678901234567890",
      chainId: 4663,
      fromAmount: "1000",
      fromToken: "0x3333333333333333333333333333333333333333",
      integration: "zeroex",
      kind: "swap",
      toToken: "0x4444444444444444444444444444444444444444",
    });

    expect(mocks.getRuntime).toHaveBeenCalledOnce();
    expect(mocks.prepareZeroExSwapOperation).toHaveBeenCalledOnce();
    expect(mocks.getRuntime.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prepareZeroExSwapOperation.mock.invocationCallOrder[0] ?? 0
    );
  });
});
