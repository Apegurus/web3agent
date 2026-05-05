import { describe, expect, it } from "vitest";
import { TimeoutError, withTimeout } from "../../src/utils/timeout.js";

describe("withTimeout", () => {
  it("resolves before timeout", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 1000, "test");
    expect(result).toBe("ok");
  });

  it("rejects before timeout", async () => {
    await expect(withTimeout(Promise.reject(new Error("fail")), 1000, "test")).rejects.toThrow(
      "fail"
    );
  });

  it("times out with TimeoutError", async () => {
    const promise = new Promise<string>(() => {
      // intentionally never resolves
    });
    await expect(withTimeout(promise, 10, "slow")).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(TimeoutError);
      expect((err as TimeoutError).message).toContain("slow");
      expect((err as TimeoutError).message).toContain("10ms");
      return true;
    });
  });
});
