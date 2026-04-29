import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("withCliRuntime JSON envelope behavior", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("../../src/runtime/managed-runtime.js");
  });

  it("converts createCliRuntime failure to CliExitError with errorCode=RUNTIME_SETUP_FAILED when json=true", async () => {
    vi.doMock("../../src/runtime/managed-runtime.js", () => ({
      createRuntime: vi.fn().mockRejectedValue(new Error("simulated setup failure")),
    }));

    const { withCliRuntime } = await import("../../src/cli/runtime.js");
    const { CliExitError } = await import("../../src/cli/output.js");

    let thrown: unknown;
    try {
      await withCliRuntime(
        async () => {
          throw new Error("operation should not run");
        },
        { json: true }
      );
    } catch (e: unknown) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(CliExitError);
    expect((thrown as { errorCode?: string }).errorCode).toBe("RUNTIME_SETUP_FAILED");
  });

  it("treats shutdown failure as best-effort stderr log and preserves operation success when json=true", async () => {
    const shutdownError = new Error("simulated shutdown failure");
    const fakeRuntime = {
      shutdown: vi.fn().mockRejectedValue(shutdownError),
    };

    vi.doMock("../../src/runtime/managed-runtime.js", () => ({
      createRuntime: vi.fn().mockResolvedValue(fakeRuntime),
    }));

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { withCliRuntime } = await import("../../src/cli/runtime.js");

    const operationCalls: string[] = [];

    await expect(
      withCliRuntime(
        async () => {
          operationCalls.push("op-ran");
        },
        { json: true }
      )
    ).resolves.toBeUndefined();

    expect(operationCalls).toEqual(["op-ran"]);
    expect(fakeRuntime.shutdown).toHaveBeenCalledTimes(1);
    const stderrCalls = stderrSpy.mock.calls.map(([chunk]) => String(chunk));
    expect(stderrCalls.some((message) => message.toLowerCase().includes("shutdown"))).toBe(true);
  });
});
